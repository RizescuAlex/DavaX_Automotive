import { apiFetch } from "../config/api";
import { DESIGN_PREVIEW } from "../config/devPreview";

/**
 * Vehicle settings, against the shared /vehicle-settings/me endpoint.
 *
 * Two things about that endpoint shape the code here:
 *
 * 1. GET returns null for a user who has never saved anything, rather than
 *    creating a row, so callers fall back to their own defaults.
 * 2. PUT replaces every field — it setattrs the whole VehicleSettingsBase —
 *    so writing climate alone would null out seat, mirror and steering. We
 *    keep the last full record and send it back with only climate changed.
 *
 * Every call is a no-op under DESIGN_PREVIEW. There is no session in preview
 * mode, so apiFetch would get a 401 and its handler would hard-redirect to
 * /login — which preview mode bounces straight back to /dashboard, producing a
 * redirect loop.
 */

const PATH = "/vehicle-settings/me";

/** The last full record seen, so a climate write can preserve the rest. */
let lastSettings = null;

/**
 * Writes run one at a time.
 *
 * Every PUT is built from lastSettings, so two in flight at once would each
 * send the other's section back as it was — an assistant reply that sets the
 * temperature and the fog lights together would keep only one of them.
 * Queueing means each write starts from the record the previous one returned.
 */
let writeQueue = Promise.resolve();

function queueWrite(write) {
  const result = writeQueue.then(write);
  // A failed write must not jam the queue for the ones behind it.
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
 * Replace the whole record — the Vehicle Preferences page's save.
 *
 * It has to come through here rather than calling apiFetch directly: a write
 * that skips lastSettings leaves the cockpit holding the old record, and the
 * next climate tap sends that back, undoing every lighting and mirror change
 * the driver just saved.
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

/** The record as it stands, ready to send back with one section changed. */
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
 * Replace the exterior half of lighting_settings, keeping the interior zones
 * the Vehicle Preferences panel owns.
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
