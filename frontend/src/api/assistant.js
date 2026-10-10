import { apiFetch } from "../config/api";
import { DESIGN_PREVIEW } from "../config/devPreview";

/**
 * Client for POST /assistant/message. Returns a reply and a list of actions;
 * see assistant/dispatch.js. No-op under DESIGN_PREVIEW (see api/vehicle.js).
 */

const PATH = "/assistant/message";

const REQUEST_TIMEOUT_MS = 30000;

/**
 * @param {string} message
 * @param {object} context dashboard snapshot (see buildContext)
 * @returns {Promise<{reply: string, actions: Array<{tool: string, args:
 *   object}>}>}
 */
export async function sendAssistantMessage(message, context) {
  if (DESIGN_PREVIEW) {
    return { reply: "The assistant is unavailable in design preview.", actions: [] };
  }

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
 * Snapshot of the store for the model. Keys must match the backend's
 * VehicleContext exactly: pydantic silently drops unknown fields.
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
