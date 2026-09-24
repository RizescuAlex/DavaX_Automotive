import { apiFetch } from "../config/api";
import { DESIGN_PREVIEW } from "../config/devPreview";

/**
 * The in-car assistant, against POST /assistant/message.
 *
 * The backend executes nothing: it returns a spoken reply plus a list of
 * actions, and the dispatcher applies those to the store. See
 * src/assistant/dispatch.js.
 *
 * No-ops under DESIGN_PREVIEW for the same reason as the vehicle client —
 * there is no session in preview mode, so apiFetch would take a 401 and
 * hard-redirect to /login, which preview bounces back to /dashboard.
 */

const PATH = "/assistant/message";

/** Generous: a cold model call runs a few seconds, but never half a minute. */
const REQUEST_TIMEOUT_MS = 30000;

/**
 * @param {string} message      what the driver said
 * @param {object} context      the dashboard snapshot (see buildContext)
 * @returns {Promise<{reply: string, actions: Array<{tool: string, args: object}>}>}
 */
export async function sendAssistantMessage(message, context) {
  if (DESIGN_PREVIEW) {
    return { reply: "The assistant is unavailable in design preview.", actions: [] };
  }

  // A hung request would otherwise leave the panel spinning with no way out,
  // which is worse in a car than a plain failure.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await apiFetch(PATH, {
      method: "POST",
      body: JSON.stringify({ message, context }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError" || controller.signal.aborted) {
      throw new Error("The assistant took too long to answer.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Snapshot the store for the model.
 *
 * Names are the backend's (snake_case, and target_temperature rather than the
 * store's targetTemp) because they have to match VehicleContext field for
 * field — anything unrecognised is dropped by pydantic without complaint, so a
 * typo here would silently leave the model blind to one reading.
 */
export function buildContext(state) {
  return {
    speed: Math.round(state.speed),
    fuel_level: state.fuelLevel,
    engine_temp: state.engineTemp,
    cabin_temp: state.cabinTemp,

    target_temperature: state.targetTemp,
    fan_speed: state.fanSpeed,
    ac_level: state.acLevel,
    auto_mode: state.autoMode,
    seat_heat_left: state.seatHeatLeft,
    seat_heat_right: state.seatHeatRight,
    front_defrost: state.frontDefrost,
    rear_defrost: state.rearDefrost,

    headlights: state.headlightsOn,
    hazards: state.hazardsOn,
    left_signal: state.leftSignal,
    right_signal: state.rightSignal,
    wipers: state.wipersOn,
    headlights_auto:
      state.exteriorLights.headlights.automatic && state.headlightsOverride === null,
    fog_lights: state.exteriorLights.headlights.fog_lights,
    rear_fog_lights: state.exteriorLights.rear_lights.rear_fog_lights,

    theme: state.theme,
    preferences_open: state.preferencesOpen,
  };
}
