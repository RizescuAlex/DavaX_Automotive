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

/**
 * Exterior lights as the Vehicle Preferences page stores them in
 * lighting_settings.exterior. The page seeds its form from these too, so the
 * two cannot drift apart on what "never set" means.
 */
export const EXTERIOR_LIGHT_DEFAULTS = {
  headlights: {
    brightness: 80,
    automatic: true,
    daytime_running: true,
    follow_me_home: false,
    fog_lights: false,
  },
  rear_lights: {
    brightness: 80,
    automatic: true,
    rear_fog_lights: false,
  },
};

/**
 * Stand-in for the dusk sensor behind automatic headlights. There is no light
 * sensor to read, so the clock decides: dark from 19:00 to 07:00.
 */
const isDark = (date = new Date()) => date.getHours() >= 19 || date.getHours() < 7;

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

  // ── Assistant ─────────────────────────────────────────────────────────────
  // Open state lives here because the button that opens the panel is in the
  // top bar while the panel itself is over the map — two siblings that would
  // otherwise have to thread a prop through Dashboard to reach each other.
  assistantOpen: false,

  // Both panels hang over the same corner of the map, so opening one closes
  // the other rather than stacking them.
  setAssistantOpen: (open) =>
    set(open ? { assistantOpen: true, preferencesOpen: false } : { assistantOpen: false }),

  toggleAssistant: () => get().setAssistantOpen(!get().assistantOpen),

  // ── Vehicle Preferences ───────────────────────────────────────────────────
  // A panel over the map rather than a page, so the cockpit stays live behind
  // it and changes land in the dock the moment they are saved.
  preferencesOpen: false,

  setPreferencesOpen: (open) =>
    set(open ? { preferencesOpen: true, assistantOpen: false } : { preferencesOpen: false }),

  togglePreferences: () => get().setPreferencesOpen(!get().preferencesOpen),

  // ── Climate ───────────────────────────────────────────────────────────────
  // Target/fan/A-C are the driver's settings and persist to the backend.
  // cabinTemp is simulated: it drifts toward the target, faster with the fan up.
  ...CLIMATE_DEFAULTS,
  cabinTemp: 19.5,
  settingsLoaded: false,
  _settingsLoading: false,
  _climateSaveTimer: null,

  /**
   * Seed climate and exterior lighting from the backend once per session.
   * Falls back to defaults.
   */
  loadVehicleSettings: async () => {
    // Set synchronously, before the first await: StrictMode mounts effects
    // twice in dev, and a flag set in the finally block would let both
    // invocations past the guard and fire two identical requests.
    if (get().settingsLoaded || get()._settingsLoading) return;
    set({ _settingsLoading: true });
    try {
      const settings = await getVehicleSettings();
      get().applyVehicleSettings(settings);
    } catch (error) {
      // A missing profile or an offline backend should not break the dashboard;
      // the defaults above are a perfectly usable starting point.
      console.error("Could not load vehicle settings", error);
    } finally {
      set({ settingsLoaded: true, _settingsLoading: false });
    }
  },

  /**
   * Take a settings record the backend already holds.
   *
   * loadVehicleSettings runs once per session, so the Vehicle Preferences panel
   * calls this after it saves; otherwise the cockpit would keep showing the old
   * values until a reload. Nothing is written back: the record came from the
   * server.
   */
  applyVehicleSettings: (settings) => {
    if (!settings) return;
    get().applyClimateSettings(settings.climate_settings);
    get().applyLightingSettings(settings.lighting_settings);
    set({ settingsLoaded: true });
  },

  applyClimateSettings: (climate) => {
    if (!climate) return;
    set({
      targetTemp: climate.target_temperature ?? CLIMATE_DEFAULTS.targetTemp,
      fanSpeed: climate.fan_speed ?? CLIMATE_DEFAULTS.fanSpeed,
      acLevel: climate.ac_level ?? CLIMATE_DEFAULTS.acLevel,
      autoMode: climate.auto_mode ?? CLIMATE_DEFAULTS.autoMode,
      seatHeatLeft: climate.seat_heat_left ?? 0,
      seatHeatRight: climate.seat_heat_right ?? 0,
      frontDefrost: climate.front_defrost ?? false,
      rearDefrost: climate.rear_defrost ?? false,
    });
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

  /**
   * Apply absolute climate values, clamped.
   *
   * The adjust and cycle actions below clamp their own deltas, but
   * _commitClimate does not — it trusts its caller. The assistant sends
   * absolutes ("set it to 23"), and a model asking for 40 degrees must not be
   * able to write 40, so the clamping lives here rather than in the
   * dispatcher: one place, whether the value came from a button or a sentence.
   *
   * Keys are the store's own (targetTemp, not target_temperature). Undefined
   * fields are left untouched, so a request that mentions only temperature
   * does not reset the fan.
   */
  setClimate: (patch) => {
    const next = {};

    if (patch.targetTemp !== undefined) {
      next.targetTemp = clamp(
        Math.round(patch.targetTemp * 2) / 2,
        CLIMATE_LIMITS.TEMP_MIN,
        CLIMATE_LIMITS.TEMP_MAX
      );
    }
    if (patch.fanSpeed !== undefined) {
      next.fanSpeed = clamp(
        Math.round(patch.fanSpeed),
        CLIMATE_LIMITS.FAN_MIN,
        CLIMATE_LIMITS.FAN_MAX
      );
    }
    if (patch.acLevel !== undefined) {
      next.acLevel = clamp(Math.round(patch.acLevel), 0, CLIMATE_LIMITS.AC_MAX);
    }
    if (patch.seatHeatLeft !== undefined) {
      next.seatHeatLeft = clamp(
        Math.round(patch.seatHeatLeft),
        0,
        CLIMATE_LIMITS.SEAT_HEAT_MAX
      );
    }
    if (patch.seatHeatRight !== undefined) {
      next.seatHeatRight = clamp(
        Math.round(patch.seatHeatRight),
        0,
        CLIMATE_LIMITS.SEAT_HEAT_MAX
      );
    }
    if (patch.autoMode !== undefined) next.autoMode = Boolean(patch.autoMode);
    if (patch.frontDefrost !== undefined) next.frontDefrost = Boolean(patch.frontDefrost);
    if (patch.rearDefrost !== undefined) next.rearDefrost = Boolean(patch.rearDefrost);

    // Setting the fan by hand, or cutting the compressor, drops out of auto —
    // the same rule adjustFanSpeed and cycleAcLevel follow. An explicit
    // auto_mode in the same breath wins over the implication.
    if (patch.autoMode === undefined && (next.fanSpeed !== undefined || next.acLevel === 0)) {
      next.autoMode = false;
    }

    if (Object.keys(next).length > 0) get()._commitClimate(next);
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

  // ── Exterior lighting ─────────────────────────────────────────────────────
  // The preferences are set on the Vehicle Preferences page and only read
  // here; the cockpit never writes them back.
  exteriorLights: EXTERIOR_LIGHT_DEFAULTS,

  // With automatic headlights, a tap in the dock overrides the sensor for the
  // rest of the session, and a second tap hands control back — the AUTO
  // position on a real light stalk. null means "following the sensor".
  headlightsOverride: null,

  applyLightingSettings: (lighting) => {
    const exterior = lighting?.exterior ?? {};
    set({
      exteriorLights: {
        headlights: {
          ...EXTERIOR_LIGHT_DEFAULTS.headlights,
          ...(exterior.headlights ?? {}),
        },
        rear_lights: {
          ...EXTERIOR_LIGHT_DEFAULTS.rear_lights,
          ...(exterior.rear_lights ?? {}),
        },
      },
      // A new preference is a fresh instruction; an old override should not
      // outlive it.
      headlightsOverride: null,
    });
    get()._syncHeadlights();
  },

  /** In automatic mode, put the headlights where the sensor (or override) says. */
  _syncHeadlights: () => {
    const { exteriorLights, headlightsOverride, headlightsOn } = get();
    if (!exteriorLights.headlights.automatic) return;
    const on = headlightsOverride ?? isDark();
    if (on !== headlightsOn) set({ headlightsOn: on });
  },

  // ── Vehicle Simulation ────────────────────────────────────────────────────
  speed: 0,
  fuelLevel: 78,
  engineTemp: 88,
  // Automatic headlights are the default preference, so start where the
  // sensor would put them rather than always on.
  headlightsOn: isDark(),
  leftSignal: false,
  rightSignal: false,
  hazardsOn: false,
  wipersOn: false,
  _simInterval: null,

  // Absolute setters, not just toggles: the assistant has to be able to say
  // "on" and mean on. Asking a toggle to turn on something already on turns it
  // off instead — and headlightsOn starts true, so that is the first thing a
  // driver would hit.
  // Under automatic headlights an explicit on/off — a tap or the assistant —
  // is an override of the sensor, not a new preference.
  setHeadlights: (on) =>
    set(get().exteriorLights.headlights.automatic
      ? { headlightsOn: on, headlightsOverride: on }
      : { headlightsOn: on }),
  setWipers: (on) => set({ wipersOn: on }),

  // Left, right and hazards are one mutually exclusive group. Hazards drive
  // both indicators at once, so they cancel a single signal and are cancelled
  // by one. Switching a member ON clears the other two; switching it OFF
  // clears only itself, so "cancel the left signal" cannot silently kill
  // hazards the driver turned on afterwards.
  setLeftSignal: (on) =>
    set(on
      ? { leftSignal: true, rightSignal: false, hazardsOn: false }
      : { leftSignal: false }),

  setRightSignal: (on) =>
    set(on
      ? { rightSignal: true, leftSignal: false, hazardsOn: false }
      : { rightSignal: false }),

  // Deliberately NOT persisted: a car that remembered its hazards were on
  // would turn them on again next trip.
  setHazards: (on) =>
    set(on
      ? { hazardsOn: true, leftSignal: false, rightSignal: false }
      : { hazardsOn: false }),

  // The dock's buttons still toggle. They delegate so the exclusion rules
  // above live in exactly one place, whether the driver taps or asks.
  toggleHeadlights: () => {
    const { exteriorLights, headlightsOverride, headlightsOn } = get();
    // Overriding the sensor already? The next tap goes back to auto.
    if (exteriorLights.headlights.automatic && headlightsOverride !== null) {
      set({ headlightsOverride: null });
      get()._syncHeadlights();
      return;
    }
    get().setHeadlights(!headlightsOn);
  },
  toggleWipers: () => get().setWipers(!get().wipersOn),
  toggleLeftSignal: () => get().setLeftSignal(!get().leftSignal),
  toggleRightSignal: () => get().setRightSignal(!get().rightSignal),
  toggleHazards: () => get().setHazards(!get().hazardsOn),

  startSimulation: () => {
    // Prevent duplicate intervals
    if (get()._simInterval) return;

    let tick = 0;
    const interval = setInterval(() => {
      tick += 1;
      // Dusk arrives while driving; the sensor has to notice.
      get()._syncHeadlights();
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
