import { useAppStore } from "../store";
import {
  nextSpotifyTrack,
  pauseMusic,
  playMusic,
  previousSpotifyTrack,
} from "../api/spotify";
import { placeCall } from "../services/calls";

/**
 * Applies the {tool, args} actions the assistant backend returns (the backend
 * executes nothing). Unknown tools are ignored, and one failing action doesn't
 * stop the rest.
 */

/** Tool arg name -> store key. Other args are ignored. */
const CLIMATE_KEYS = {
  target_temperature: "targetTemp",
  fan_speed: "fanSpeed",
  ac_level: "acLevel",
  auto_mode: "autoMode",
  seat_heat_left: "seatHeatLeft",
  seat_heat_right: "seatHeatRight",
  front_defrost: "frontDefrost",
  rear_defrost: "rearDefrost",
};

function applyClimate(args) {
  const patch = {};
  for (const [argName, storeKey] of Object.entries(CLIMATE_KEYS)) {
    if (args[argName] !== undefined && args[argName] !== null) {
      patch[storeKey] = args[argName];
    }
  }
  // setClimate clamps the values.
  if (Object.keys(patch).length > 0) useAppStore.getState().setClimate(patch);
}

function applyVehicleControls(args) {
  const state = useAppStore.getState();

  // If the model sends both auto and an explicit on/off, the explicit one wins.
  if (typeof args.headlights_auto === "boolean") state.setHeadlightsAuto(args.headlights_auto);
  if (typeof args.headlights === "boolean") state.setHeadlights(args.headlights);
  if (typeof args.wipers === "boolean") state.setWipers(args.wipers);

  // Fog lights are saved preferences, so they go through setExteriorLight.
  if (typeof args.fog_lights === "boolean") {
    state.setExteriorLight("headlights", "fog_lights", args.fog_lights);
  }
  if (typeof args.rear_fog_lights === "boolean") {
    state.setExteriorLight("rear_lights", "rear_fog_lights", args.rear_fog_lights);
  }

  // The signal setters clear each other, so apply order decides conflicts:
  // signals first, hazards last, so hazards win.
  if (typeof args.left_signal === "boolean") state.setLeftSignal(args.left_signal);
  if (typeof args.right_signal === "boolean") state.setRightSignal(args.right_signal);
  if (typeof args.hazards === "boolean") state.setHazards(args.hazards);
}

function applyDisplay(args) {
  const state = useAppStore.getState();
  if (args.mode === "dark" || args.mode === "light") state.setTheme(args.mode);
  if (args.preferences_panel === "open") state.setPreferencesOpen(true);
  if (args.preferences_panel === "closed") state.setPreferencesOpen(false);
}

const MUSIC_ACTIONS = {
  play: playMusic,
  pause: pauseMusic,
  next: nextSpotifyTrack,
  previous: previousSpotifyTrack,
};

/**
 * Spotify playback is a network call and needs a Premium account, so failures
 * are returned to the caller.
 */
function applyMusic(args) {
  const call = MUSIC_ACTIONS[args.action];
  if (!call) return Promise.resolve();
  return call();
}

/** Network call; fails unless the callee is in the user's contacts. */
function applyCall(args) {
  if (typeof args.username !== "string" || !args.username.trim()) {
    return Promise.resolve();
  }
  return placeCall(args.username);
}

const HANDLERS = {
  set_climate: applyClimate,
  set_vehicle_controls: applyVehicleControls,
  set_display: applyDisplay,
  control_music: applyMusic,
  call_user: applyCall,
};

/**
 * @param {Array<{tool: string, args: object}>} actions
 * @returns {Promise<Array<{tool: string, error: Error}>>} the actions that
 *   failed
 */
export async function applyActions(actions) {
  const failures = [];

  for (const action of actions ?? []) {
    const handler = HANDLERS[action?.tool];
    if (!handler) {
      console.warn("[assistant] ignoring unknown tool:", action?.tool);
      continue;
    }

    try {
      await handler(action.args ?? {});
    } catch (error) {
      console.error(`[assistant] ${action.tool} failed`, error);
      failures.push({ tool: action.tool, error });
    }
  }

  return failures;
}
