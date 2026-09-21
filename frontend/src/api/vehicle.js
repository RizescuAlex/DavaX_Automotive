import { apiFetch } from "../config/api";
import { DESIGN_PREVIEW } from "../config/devPreview";

/**
 * Vehicle settings (currently just climate).
 *
 * Both calls are no-ops under DESIGN_PREVIEW. There is no session in preview
 * mode, so apiFetch would get a 401 and its handler would hard-redirect to
 * /login — which preview mode bounces straight back to /dashboard, producing a
 * redirect loop. Returning null instead lets the card fall back to defaults.
 */

export async function getVehicleSettings() {
  if (DESIGN_PREVIEW) return null;
  return apiFetch("/vehicle/settings");
}

export async function saveClimateSettings(climate) {
  if (DESIGN_PREVIEW) return null;
  return apiFetch("/vehicle/settings", {
    method: "PATCH",
    body: JSON.stringify({ climate_settings: climate }),
  });
}
