import { apiFetch } from "../config/api";
import { DESIGN_PREVIEW } from "../config/devPreview";

/**
 * Client for /vehicle-settings/me. GET returns null until the user saves
 * something. PUT replaces every field, so partial writes resend the last full
 * record with one section changed. All calls are no-ops under DESIGN_PREVIEW:
 * with no session, a 401 would redirect to /login and loop back.
 */

const PATH = "/vehicle-settings/me";

/** Last full record, so a partial write can preserve the rest. */
let lastSettings = null;

/**
 * Writes are queued: each PUT is built from lastSettings, so two in flight
 * would overwrite each other's changes.
 */
let writeQueue = Promise.resolve();

function queueWrite(write) {
  const result = writeQueue.then(write);
  // Don't let a failed write block the queue.
  writeQueue = result.catch(() => {});
  return result;
}

export async function getVehicleSettings() {
  if (DESIGN_PREVIEW) return null;
  const settings = await apiFetch(PATH);
  lastSettings = settings;
  return settings;
}

/**
 * Full save from Vehicle Preferences. Goes through here so lastSettings stays
 * current.
 */
export async function saveVehicleSettings(settings) {
  if (DESIGN_PREVIEW) return null;

  return queueWrite(async () => {
    const saved = await apiFetch(PATH, {
      method: "PUT",
      body: JSON.stringify(settings),
    });
    lastSettings = saved;
    return saved;
  });
}

function currentRecord() {
  return {
    profile_name: lastSettings?.profile_name ?? "default",
    seat_position: lastSettings?.seat_position ?? null,
    mirror_left: lastSettings?.mirror_left ?? null,
    mirror_right: lastSettings?.mirror_right ?? null,
    mirror_rear: lastSettings?.mirror_rear ?? null,
    steering_position: lastSettings?.steering_position ?? null,
    climate_settings: lastSettings?.climate_settings ?? null,
    lighting_settings: lastSettings?.lighting_settings ?? null,
    is_active: lastSettings?.is_active ?? true,
  };
}

/**
 * Replace the exterior part of lighting_settings, keeping the interior zones.
 */
export async function saveExteriorLights(exterior) {
  if (DESIGN_PREVIEW) return null;

  return queueWrite(async () => {
    const record = currentRecord();
    const saved = await apiFetch(PATH, {
      method: "PUT",
      body: JSON.stringify({
        ...record,
        lighting_settings: { ...(record.lighting_settings ?? {}), exterior },
      }),
    });
    lastSettings = saved;
    return saved;
  });
}

export async function saveClimateSettings(climate) {
  if (DESIGN_PREVIEW) return null;

  return queueWrite(async () => {
    const saved = await apiFetch(PATH, {
      method: "PUT",
      body: JSON.stringify({ ...currentRecord(), climate_settings: climate }),
    });
    lastSettings = saved;
    return saved;
  });
}
