import { create } from "zustand";
import { getVehicleSettings, saveClimateSettings } from "../api/vehicle";

const CUSTOM_TOKEN_KEY = "davax_token";
const CUSTOM_USER_KEY = "davax_user";
const THEME_KEY = "davax_theme";

/**
 * Night is the default: this is a cockpit, and a white screen at night is
 * worse than a dark one in daylight. A driver who picks day gets it back on
 * every load.
 */
function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "dark";
  } catch {
    // Private browsing and blocked site data both throw here.
    return "dark";
  }
}

/** The attribute the [data-theme="light"] token block keys off. */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

// Applied at import time, before React's first render, so a driver who chose
// day does not get a frame of night while the app boots.
const initialTheme = readStoredTheme();
applyTheme(initialTheme);

/**
 * The climate shape lives here.
 *
 * /vehicle-settings/me stores climate_settings as an untyped JSONB dict, so
 * these bounds are the only thing enforcing them — every write goes through
 * clamp() below. Worth moving into the shared schema if the backend ever
 * types that column.
 */
export const CLIMATE_LIMITS = {
  TEMP_MIN: 16,
  TEMP_MAX: 28,
  TEMP_STEP: 0.5,
  FAN_MIN: 0,
  FAN_MAX: 5,
  SEAT_HEAT_MAX: 3,
  AC_MAX: 3,
};

// target_temperature (not target_temp) because the Vehicle Preferences page
// already writes that key into the same climate_settings blob — two names for
// one value would leave the dock and that page permanently disagreeing.
const CLIMATE_DEFAULTS = {
  targetTemp: 21.5,
  fanSpeed: 2,
  acLevel: 2,
  autoMode: true,
  seatHeatLeft: 0,
  seatHeatRight: 0,
  frontDefrost: false,
  rearDefrost: false,
};

/** Writes are debounced so holding the +/- buttons does not spam the API. */
const CLIMATE_SAVE_DELAY = 700;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Root store.
 * Firebase handles Google auth state — Zustand holds our custom JWT auth state
 * for email/password users, plus shared backend user data and vehicle simulation.
 */
export const useAppStore = create((set, get) => ({
  // ── Auth ──────────────────────────────────────────────────────────────────
  backendUser: null,
  setBackendUser: (user) => set({ backendUser: user }),
  clearBackendUser: () => set({ backendUser: null }),

  customToken: localStorage.getItem(CUSTOM_TOKEN_KEY) || null,
  customUser: (() => {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_USER_KEY)) || null;
    } catch {
      return null;
    }
  })(),

  setCustomAuth: (token, user) => {
    localStorage.setItem(CUSTOM_TOKEN_KEY, token);
    localStorage.setItem(CUSTOM_USER_KEY, JSON.stringify(user));
    set({ customToken: token, customUser: user });
  },

  clearCustomAuth: () => {
    localStorage.removeItem(CUSTOM_TOKEN_KEY);
    localStorage.removeItem(CUSTOM_USER_KEY);
    set({ customToken: null, customUser: null });
  },

  // ── Theme ─────────────────────────────────────────────────────────────────
  theme: initialTheme,

  setTheme: (theme) => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
    set({ theme });
  },

  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),

  // ── Climate ───────────────────────────────────────────────────────────────
  // Target/fan/A-C are the driver's settings and persist to the backend.
  // cabinTemp is simulated: it drifts toward the target, faster with the fan up.
  ...CLIMATE_DEFAULTS,
  cabinTemp: 19.5,
  climateLoaded: false,
  _climateLoading: false,
  _climateSaveTimer: null,

  /** Seed climate from the backend once per session. Falls back to defaults. */
  loadClimate: async () => {
    // Set synchronously, before the first await: StrictMode mounts effects
    // twice in dev, and a flag set in the finally block would let both
    // invocations past the guard and fire two identical requests.
    if (get().climateLoaded || get()._climateLoading) return;
    set({ _climateLoading: true });
    try {
      const settings = await getVehicleSettings();
      const climate = settings?.climate_settings;
      if (climate) {
        set({
          targetTemp: climate.target_temperature ?? 21.5,
          fanSpeed: climate.fan_speed,
          acLevel: climate.ac_level ?? 2,
          autoMode: climate.auto_mode,
          seatHeatLeft: climate.seat_heat_left ?? 0,
          seatHeatRight: climate.seat_heat_right ?? 0,
          frontDefrost: climate.front_defrost ?? false,
          rearDefrost: climate.rear_defrost ?? false,
        });
      }
    } catch (error) {
      // A missing profile or an offline backend should not break the dashboard;
      // the defaults above are a perfectly usable starting point.
      console.error("Could not load climate settings", error);
    } finally {
      set({ climateLoaded: true, _climateLoading: false });
    }
  },

  /** Apply a change locally, then persist it once the driver stops adjusting. */
  _commitClimate: (patch) => {
    set(patch);

    const existing = get()._climateSaveTimer;
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const {
        targetTemp, fanSpeed, acLevel, autoMode,
        seatHeatLeft, seatHeatRight, frontDefrost, rearDefrost,
      } = get();
      saveClimateSettings({
        target_temperature: targetTemp,
        fan_speed: fanSpeed,
        ac_level: acLevel,
        auto_mode: autoMode,
        seat_heat_left: seatHeatLeft,
        seat_heat_right: seatHeatRight,
        front_defrost: frontDefrost,
        rear_defrost: rearDefrost,
      }).catch((error) => console.error("Could not save climate settings", error));
      set({ _climateSaveTimer: null });
    }, CLIMATE_SAVE_DELAY);

    set({ _climateSaveTimer: timer });
  },

  adjustTargetTemp: (delta) =>
    get()._commitClimate({
      targetTemp: clamp(
        Math.round((get().targetTemp + delta) * 2) / 2,
        CLIMATE_LIMITS.TEMP_MIN,
        CLIMATE_LIMITS.TEMP_MAX
      ),
    }),

  adjustFanSpeed: (delta) =>
    get()._commitClimate({
      fanSpeed: clamp(get().fanSpeed + delta, CLIMATE_LIMITS.FAN_MIN, CLIMATE_LIMITS.FAN_MAX),
      // Touching the fan by hand drops out of auto, the way a real HVAC does.
      autoMode: false,
    }),

  /** A/C cycles Off -> 1 -> 2 -> 3 -> Off, like a physical intensity button. */
  cycleAcLevel: () => {
    const acLevel = (get().acLevel + 1) % (CLIMATE_LIMITS.AC_MAX + 1);
    // Cutting the compressor by hand means the driver is no longer letting the
    // system decide.
    get()._commitClimate(acLevel === 0 ? { acLevel, autoMode: false } : { acLevel });
  },

  /** Seat heat cycles 0 -> 1 -> 2 -> 3 -> 0, the way a physical seat button does. */
  cycleSeatHeat: (side) => {
    const key = side === "left" ? "seatHeatLeft" : "seatHeatRight";
    const next = (get()[key] + 1) % (CLIMATE_LIMITS.SEAT_HEAT_MAX + 1);
    get()._commitClimate({ [key]: next });
  },

  toggleFrontDefrost: () => get()._commitClimate({ frontDefrost: !get().frontDefrost }),

  toggleRearDefrost: () => get()._commitClimate({ rearDefrost: !get().rearDefrost }),

  toggleAutoMode: () => {
    const autoMode = !get().autoMode;
    // Auto implies the system runs the compressor and picks the fan itself.
    get()._commitClimate(autoMode ? { autoMode, acLevel: 2, fanSpeed: 3 } : { autoMode });
  },

  // ── Vehicle Simulation ────────────────────────────────────────────────────
  speed: 0,
  fuelLevel: 78,
  engineTemp: 88,
  headlightsOn: true,
  leftSignal: false,
  rightSignal: false,
  hazardsOn: false,
  wipersOn: false,
  _simInterval: null,

  toggleHeadlights: () => set((s) => ({ headlightsOn: !s.headlightsOn })),
  toggleWipers: () => set((s) => ({ wipersOn: !s.wipersOn })),
  toggleLeftSignal: () =>
    set((s) => ({ leftSignal: !s.leftSignal, rightSignal: false, hazardsOn: false })),
  toggleRightSignal: () =>
    set((s) => ({ rightSignal: !s.rightSignal, leftSignal: false, hazardsOn: false })),

  // Hazards drive both indicators at once, so they cancel a single signal and
  // are cancelled by one. Deliberately NOT persisted: a car that remembered
  // its hazards were on would turn them on again next trip.
  toggleHazards: () =>
    set((s) => {
      const hazardsOn = !s.hazardsOn;
      return hazardsOn
        ? { hazardsOn, leftSignal: false, rightSignal: false }
        : { hazardsOn };
    }),

  startSimulation: () => {
    // Prevent duplicate intervals
    if (get()._simInterval) return;

    let tick = 0;
    const interval = setInterval(() => {
      tick += 1;
      set((s) => {
        // Speed: gentle sine wave oscillation 30–80 km/h
        const newSpeed = 55 + 25 * Math.sin(tick * 0.04) + (Math.random() - 0.5) * 4;

        // Fuel: very slow decrease
        const newFuel = Math.max(0, s.fuelLevel - 0.005);

        // Engine temp: hovers 85–95°C with slight noise
        const newTemp = 90 + 5 * Math.sin(tick * 0.02) + (Math.random() - 0.5) * 2;

        // Cabin temp: pulled toward the target while the system is running,
        // faster with the fan up. With A/C off it drifts back toward ambient.
        const ambient = 14;
        const running = s.acLevel > 0;
        const goal = running ? s.targetTemp : ambient;
        // Harder compressor and more fan both pull the cabin to target faster.
        const rate = running ? 0.02 + s.acLevel * 0.02 + s.fanSpeed * 0.02 : 0.02;
        const newCabin = s.cabinTemp + (goal - s.cabinTemp) * rate;

        return {
          speed: Math.max(0, newSpeed),
          fuelLevel: newFuel,
          engineTemp: Math.max(60, Math.min(130, newTemp)),
          cabinTemp: newCabin,
        };
      });
    }, 1000);

    set({ _simInterval: interval });
  },

  stopSimulation: () => {
    const interval = get()._simInterval;
    if (interval) {
      clearInterval(interval);
      set({ _simInterval: null });
    }
  },
}));
