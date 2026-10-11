import { create } from "zustand";
import { getVehicleSettings, saveClimateSettings, saveExteriorLights } from "../api/vehicle";
import { calculateFuelLevelAfterDistance } from "../utils/fuelConsumption";

const CUSTOM_TOKEN_KEY = "davax_token";
const CUSTOM_USER_KEY = "davax_user";
const THEME_KEY = "davax_theme";

// Night is the default.
function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "dark";
  } catch {
    // Private browsing and blocked site data both throw here.
    return "dark";
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

// Applied before React's first render so a stored day theme doesn't flash night.
const initialTheme = readStoredTheme();
applyTheme(initialTheme);

// climate_settings is an untyped JSONB column, so these bounds are the only
// validation; every write goes through clamp().
export const CLIMATE_LIMITS = {
  TEMP_MIN: 16,
  TEMP_MAX: 28,
  TEMP_STEP: 0.5,
  FAN_MIN: 0,
  FAN_MAX: 5,
  SEAT_HEAT_MAX: 3,
  AC_MAX: 3,
};

// Saved as target_temperature (not target_temp) because Vehicle Preferences
// writes that key into the same blob.
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

// Shape of lighting_settings.exterior. Vehicle Preferences seeds its form from these too.
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

// Stand-in for a dusk sensor: dark from 19:00 to 07:00.
const isDark = (date = new Date()) => date.getHours() >= 19 || date.getHours() < 7;

const PANEL_KEYS = [
  "assistantOpen",
  "preferencesOpen",
  "userSettingsOpen",
  "callOpen",
  "contactsOpen",
];

const onlyPanelOpen = (key) => Object.fromEntries(PANEL_KEYS.map((k) => [k, k === key]));

// Debounce for climate saves, so holding +/- doesn't spam the API.
const CLIMATE_SAVE_DELAY = 700;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Firebase holds Google auth state; this store holds the email/password JWT,
 * the backend user, panel state, climate, lighting and the vehicle simulation.
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
      // Storage unavailable; the theme still applies for this session.
    }
    set({ theme });
  },

  toggleTheme: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),

  // ── Top-bar panels ────────────────────────────────────────────────────────
  // At most one is open; opening one closes the others.
  assistantOpen: false,
  preferencesOpen: false,
  userSettingsOpen: false,
  callOpen: false,
  contactsOpen: false,

  _setPanelOpen: (key, open) =>
    set(open ? onlyPanelOpen(key) : { [key]: false }),

  setAssistantOpen: (open) => get()._setPanelOpen("assistantOpen", open),
  toggleAssistant: () => get().setAssistantOpen(!get().assistantOpen),

  setPreferencesOpen: (open) => get()._setPanelOpen("preferencesOpen", open),
  togglePreferences: () => get().setPreferencesOpen(!get().preferencesOpen),

  setUserSettingsOpen: (open) => get()._setPanelOpen("userSettingsOpen", open),
  toggleUserSettings: () => get().setUserSettingsOpen(!get().userSettingsOpen),

  setCallOpen: (open) => get()._setPanelOpen("callOpen", open),
  toggleCall: () => get().setCallOpen(!get().callOpen),

  setContactsOpen: (open) => get()._setPanelOpen("contactsOpen", open),
  toggleContacts: () => get().setContactsOpen(!get().contactsOpen),

  // ── Climate ───────────────────────────────────────────────────────────────
  // Settings persist to the backend; cabinTemp is simulated.
  ...CLIMATE_DEFAULTS,
  cabinTemp: 19.5,
  settingsLoaded: false,
  _settingsLoading: false,
  _climateSaveTimer: null,

  /** Load climate and exterior lighting once per session; defaults on failure. */
  loadVehicleSettings: async () => {
    // Set before the first await: StrictMode runs effects twice in dev and
    // would otherwise send two requests.
    if (get().settingsLoaded || get()._settingsLoading) return;
    set({ _settingsLoading: true });
    try {
      const settings = await getVehicleSettings();
      get().applyVehicleSettings(settings);
    } catch (error) {
      console.error("Could not load vehicle settings", error);
    } finally {
      set({ settingsLoaded: true, _settingsLoading: false });
    }
  },

  /** Apply a settings record from the backend (e.g. after Vehicle Preferences saves). */
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

  /** Apply locally now, save after CLIMATE_SAVE_DELAY. Does not clamp. */
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
   * Set absolute climate values (used by the assistant), clamped to
   * CLIMATE_LIMITS. Undefined fields are left as they are.
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

    // Setting the fan or turning A/C off leaves auto mode, unless autoMode
    // was given explicitly.
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
      autoMode: false,
    }),

  // Off -> 1 -> 2 -> 3 -> Off. Turning it off leaves auto mode.
  cycleAcLevel: () => {
    const acLevel = (get().acLevel + 1) % (CLIMATE_LIMITS.AC_MAX + 1);
    get()._commitClimate(acLevel === 0 ? { acLevel, autoMode: false } : { acLevel });
  },

  // 0 -> 1 -> 2 -> 3 -> 0
  cycleSeatHeat: (side) => {
    const key = side === "left" ? "seatHeatLeft" : "seatHeatRight";
    const next = (get()[key] + 1) % (CLIMATE_LIMITS.SEAT_HEAT_MAX + 1);
    get()._commitClimate({ [key]: next });
  },

  toggleFrontDefrost: () => get()._commitClimate({ frontDefrost: !get().frontDefrost }),

  toggleRearDefrost: () => get()._commitClimate({ rearDefrost: !get().rearDefrost }),

  toggleAutoMode: () => {
    const autoMode = !get().autoMode;
    get()._commitClimate(autoMode ? { autoMode, acLevel: 2, fanSpeed: 3 } : { autoMode });
  },

  // ── Exterior lighting ─────────────────────────────────────────────────────
  exteriorLights: EXTERIOR_LIGHT_DEFAULTS,

  // With automatic headlights, a tap overrides the sensor until the next tap.
  // null = following the sensor.
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
      // New preferences clear any manual override.
      headlightsOverride: null,
    });
    get()._syncHeadlights();
  },

  /** Change one exterior-light preference: applied now, saved in the background. */
  setExteriorLight: (group, field, value) => {
    const current = get().exteriorLights;
    const exteriorLights = {
      ...current,
      [group]: { ...current[group], [field]: value },
    };
    set({ exteriorLights });
    get()._syncHeadlights();
    saveExteriorLights(exteriorLights).catch((error) =>
      console.error("Could not save exterior lights", error)
    );
  },

  /**
   * Turn automatic headlights on (clearing any override) or off (keeping the
   * headlights in their current state).
   */
  setHeadlightsAuto: (on) => {
    const { exteriorLights } = get();
    if (on) {
      set({ headlightsOverride: null });
      if (exteriorLights.headlights.automatic) get()._syncHeadlights();
      else get().setExteriorLight("headlights", "automatic", true);
    } else if (exteriorLights.headlights.automatic) {
      set({ headlightsOverride: null });
      get().setExteriorLight("headlights", "automatic", false);
    }
  },

  _syncHeadlights: () => {
    const { exteriorLights, headlightsOverride, headlightsOn } = get();
    if (!exteriorLights.headlights.automatic) return;
    const on = headlightsOverride ?? isDark();
    if (on !== headlightsOn) set({ headlightsOn: on });
  },

    // ── Calls ────────────────────────────────────────────────────────────────
  call: null,
  setCall: (call) => set({ call }),
  clearCall: () => set({ call: null }),

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

  // ── Vehicle simulation ────────────────────────────────────────────────────
  speed: 0,
  fuelLevel: 78,
  fuelCapacity: 50,
  fuelCapacityUnit: "L",
  fuelConsumption: 7.5,
  fuelConsumptionUnit: "L/100 km",
  fuelConsumptionSource: "default",
  fuelReservePct: 20,
  fuelProfileSource: "default",
  fuelProfileTrim: null,
  setFuelProfile: (profile) => {
    if (!profile || !Number.isFinite(Number(profile.capacity))) return;
    set({
      fuelCapacity: Number(profile.capacity),
      fuelCapacityUnit: profile.capacity_unit || "L",
      fuelConsumption: Number(profile.consumption) || 0,
      fuelConsumptionUnit: profile.consumption_unit || "L/100 km",
      fuelConsumptionSource: profile.consumption_source || "default",
      fuelReservePct: Number(profile.reserve_threshold_pct) || 20,
      fuelProfileSource: profile.source || "default",
      fuelProfileTrim: profile.selected_trim_name || null,
    });
  },
  setFuelAmount: (amount) => {
    const { fuelCapacity } = get();
    const litersOrKwh = Number(amount);
    if (!Number.isFinite(litersOrKwh) || fuelCapacity <= 0) return;
    set({ fuelLevel: Math.max(0, Math.min(100, litersOrKwh / fuelCapacity * 100)) });
  },
  consumeFuelForDistance: (distanceMeters) => {
    const { fuelLevel, fuelCapacity, fuelConsumption } = get();
    const nextFuelLevel = calculateFuelLevelAfterDistance(
      fuelLevel,
      distanceMeters,
      fuelConsumption,
      fuelCapacity
    );
    if (nextFuelLevel !== fuelLevel) set({ fuelLevel: nextFuelLevel });
  },
  engineTemp: 88,
  headlightsOn: isDark(),
  leftSignal: false,
  rightSignal: false,
  automaticTurnSignal: null,
  hazardsOn: false,
  wipersOn: false,
  _simInterval: null,

  // Absolute setters for the assistant, which must be able to say "on" and
  // mean on. Under automatic headlights, an explicit on/off is an override.
  setHeadlights: (on) =>
    set(get().exteriorLights.headlights.automatic
      ? { headlightsOn: on, headlightsOverride: on }
      : { headlightsOn: on }),
  setWipers: (on) => set({ wipersOn: on }),
  setAutomaticTurnSignal: (direction) => {
    const next = direction === "left" || direction === "right" ? direction : null;
    if (get().automaticTurnSignal !== next) set({ automaticTurnSignal: next });
  },

  // Left, right and hazards are mutually exclusive. Turning one on clears the
  // others; turning one off clears only itself.
  setLeftSignal: (on) =>
    set(on
      ? { leftSignal: true, rightSignal: false, hazardsOn: false }
      : { leftSignal: false }),

  setRightSignal: (on) =>
    set(on
      ? { rightSignal: true, leftSignal: false, hazardsOn: false }
      : { rightSignal: false }),

  // Not persisted, so hazards are off at the start of each session.
  setHazards: (on) =>
    set(on
      ? { hazardsOn: true, leftSignal: false, rightSignal: false }
      : { hazardsOn: false }),

  toggleHeadlights: () => {
    const { exteriorLights, headlightsOverride, headlightsOn } = get();
    // A tap while overriding the sensor returns to auto.
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
    if (get()._simInterval) return;

    let tick = 0;
    const interval = setInterval(() => {
      tick += 1;
      get()._syncHeadlights();
      set((s) => {
        // Speed oscillates around 30–80 km/h
        const newSpeed = 55 + 25 * Math.sin(tick * 0.04) + (Math.random() - 0.5) * 4;

        // Engine temp hovers around 85–95°C
        const newTemp = 90 + 5 * Math.sin(tick * 0.02) + (Math.random() - 0.5) * 2;

        // Cabin moves toward the target while A/C runs (faster with more A/C
        // and fan), and back toward ambient when it is off.
        const ambient = 14;
        const running = s.acLevel > 0;
        const goal = running ? s.targetTemp : ambient;
        const rate = running ? 0.02 + s.acLevel * 0.02 + s.fanSpeed * 0.02 : 0.02;
        const newCabin = s.cabinTemp + (goal - s.cabinTemp) * rate;

        return {
          speed: Math.max(0, newSpeed),
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
