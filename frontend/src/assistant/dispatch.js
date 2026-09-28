import { useAppStore } from "../store";
import {
  nextSpotifyTrack,
  pauseMusic,
  playMusic,
  previousSpotifyTrack,
} from "../api/spotify";
import { placeCall } from "../services/calls";

/**
 * Applies the actions the assistant returns.
 *
 * The backend executes nothing — it hands back {tool, args} and this is where
 * they become real. Three of the four tools write to the Zustand store; only
 * control_music leaves the browser, because Spotify playback is the one piece
 * of dashboard state the store does not own.
 *
 * Nothing here trusts the model: names are checked against the table, unknown
 * tools are dropped rather than thrown, and one failing action never stops the
 * rest. The driver has already been told what was going to happen, so a silent
 * no-op is worse than a partial apply.
 */

/** Tool arg name -> store key. Only these are applied; anything else is ignored. */
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
  // setClimate clamps; it is the only absolute climate write in the store.
  if (Object.keys(patch).length > 0) useAppStore.getState().setClimate(patch);
}

function applyVehicleControls(args) {
  const state = useAppStore.getState();

  // Auto before an explicit on/off: the tool description forbids sending
  // both, but if the model does, the explicit command is what the driver said
  // last and wins as an override.
  if (typeof args.headlights_auto === "boolean") state.setHeadlightsAuto(args.headlights_auto);
  if (typeof args.headlights === "boolean") state.setHeadlights(args.headlights);
  if (typeof args.wipers === "boolean") state.setWipers(args.wipers);

  // Fog lights are saved preferences, not live switches, so they go through
  // setExteriorLight, which persists them.
  if (typeof args.fog_lights === "boolean") {
    state.setExteriorLight("headlights", "fog_lights", args.fog_lights);
  }
  if (typeof args.rear_fog_lights === "boolean") {
    state.setExteriorLight("rear_lights", "rear_fog_lights", args.rear_fog_lights);
  }

  // Left, right and hazards are mutually exclusive, and each setter clears the
  // other two. Order therefore decides the winner when the model sends a
  // contradictory combination, so it is fixed rather than left to key order:
  // signals first, hazards last. Hazards win because they are the safety
  // signal — a driver who asked for both should end up flashing both corners,
  // not indicating a turn.
  if (typeof args.left_signal === "boolean") state.setLeftSignal(args.left_signal);
  if (typeof args.right_signal === "boolean") state.setRightSignal(args.right_signal);
  if (typeof args.hazards === "boolean") state.setHazards(args.hazards);
}

function applyDisplay(args) {
  const state = useAppStore.getState();
  if (args.mode === "dark" || args.mode === "light") state.setTheme(args.mode);
  // Opening preferences closes the assistant panel; the reply is still read
  // aloud when the driver spoke, so nothing is lost.
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
 * The one action that is a network call rather than a store write.
 *
 * Returns a promise so the caller can surface a failure. Playback needs a
 * Spotify Premium account on the signed-in profile; without one the request
 * fails and the driver should be told, rather than left believing the music
 * changed.
 */
function applyMusic(args) {
  const call = MUSIC_ACTIONS[args.action];
  if (!call) return Promise.resolve();
  return call();
}

/**
 * Like control_music, a network call rather than a store write, and one that
 * can fail for reasons the driver should hear: the backend only connects
 * people in each other's contacts. The rejection carries its message back to
 * the panel through the failures list.
 */
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
 * Apply every action in order.
 *
 * @param {Array<{tool: string, args: object}>} actions
 * @returns {Promise<Array<{tool: string, error: Error}>>} whatever failed
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
      // Keep going: a failed Spotify call should not stop the headlights.
      console.error(`[assistant] ${action.tool} failed`, error);
      failures.push({ tool: action.tool, error });
    }
  }

  return failures;
}
