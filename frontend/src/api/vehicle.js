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
 * Both calls are no-ops under DESIGN_PREVIEW. There is no session in preview
 * mode, so apiFetch would get a 401 and its handler would hard-redirect to
 * /login — which preview mode bounces straight back to /dashboard, producing a
 * redirect loop.
 */

const PATH = "/vehicle-settings/me";

/** The last full record seen, so a climate write can preserve the rest. */
let lastSettings = null;

export async function getVehicleSettings() {
  if (DESIGN_PREVIEW) return null;
  const settings = await apiFetch(PATH);
  lastSettings = settings;
  return settings;
}

export async function saveClimateSettings(climate) {
  if (DESIGN_PREVIEW) return null;

  const saved = await apiFetch(PATH, {
    method: "PUT",
    body: JSON.stringify({
      profile_name: lastSettings?.profile_name ?? "default",
      seat_position: lastSettings?.seat_position ?? null,
      mirror_left: lastSettings?.mirror_left ?? null,
      mirror_right: lastSettings?.mirror_right ?? null,
      steering_position: lastSettings?.steering_position ?? null,
      lighting_settings: lastSettings?.lighting_settings ?? null,
      is_active: lastSettings?.is_active ?? true,
      climate_settings: climate,
    }),
  });

  lastSettings = saved;
  return saved;
}
