import { useEffect, useState } from "react";
import { LogOut, User, X } from "lucide-react";
import { useAuth } from "../../auth/useAuth";
import { apiFetch } from "../../config/api";
import { DESIGN_PREVIEW } from "../../config/devPreview";
import { useAppStore } from "../../store";
import "../vehicle-settings/VehiclePreferencesPanel.css";
import "./UserSettingsPanel.css";

/** The onboarding wizard's routing questions, asked again here. */
const PRIORITIES = [
  ["fastest_arrival", "Fastest arrival"],
  ["lowest_cost", "Lowest cost"],
  ["scenic_routes", "Scenic routes"],
  ["family_friendly", "Family friendly"],
];

const FUEL_TYPES = [
  ["gasoline", "Gasoline (Petrol)"],
  ["diesel", "Diesel"],
  ["hybrid", "Hybrid"],
  ["electric", "Electric (EV)"],
];

/**
 * User Settings, opened from the person icon in the top bar — a panel over
 * the map like the assistant and Vehicle Preferences.
 *
 * Profile comes from /users/me and route preferences from /preferences/me,
 * the answers the onboarding wizard collected. A driver who skipped onboarding
 * has no preferences record (the endpoint 404s), so that section says so
 * instead of offering a form that could not save.
 *
 * Sign out sits in the footer, on the opposite side from Save, so the two are
 * never a mis-tap apart.
 */
export default function UserSettingsPanel() {
  const open = useAppStore((s) => s.userSettingsOpen);
  const setUserSettingsOpen = useAppStore((s) => s.setUserSettingsOpen);

  if (!open) return null;
  return <UserSettingsContent onClose={() => setUserSettingsOpen(false)} />;
}

function UserSettingsContent({ onClose }) {
  const { logout } = useAuth();
  const backendUser = useAppStore((s) => s.backendUser);
  const customUser = useAppStore((s) => s.customUser);
  const customToken = useAppStore((s) => s.customToken);
  const setBackendUser = useAppStore((s) => s.setBackendUser);
  const setCustomAuth = useAppStore((s) => s.setCustomAuth);

  // Google sign-ins carry backendUser; email/password sign-ins carry customUser.
  const profile = backendUser ?? customUser ?? {};
  const savedName = profile.display_name ?? profile.displayName ?? "";

  const [displayName, setDisplayName] = useState(savedName);
  const [preferences, setPreferences] = useState(null);
  const [savedPreferences, setSavedPreferences] = useState(null);
  const [preferencesNote, setPreferencesNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // No session in preview mode, and a 401 would bounce to /login.
      if (DESIGN_PREVIEW) {
        setPreferencesNote("Route preferences load once you are signed in.");
        setLoading(false);
        return;
      }
      try {
        const data = await apiFetch("/preferences/me");
        if (!cancelled) {
          setPreferences(data);
          setSavedPreferences(data);
        }
      } catch (err) {
        if (!cancelled) {
          setPreferencesNote(
            /not found/i.test(err.message)
              ? "Finish onboarding to set your route preferences."
              : `Route preferences could not be loaded: ${err.message}`
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape closes, as it does the other panels.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setPreference = (field, value) =>
    setPreferences((previous) => ({ ...previous, [field]: value }));

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const name = displayName.trim();
      if (name && name !== savedName && !DESIGN_PREVIEW) {
        const updated = await apiFetch("/users/me", {
          method: "PUT",
          body: JSON.stringify({ display_name: name }),
        });
        // The greeting in the top bar reads these, so update whichever
        // sign-in this driver used.
        if (backendUser) setBackendUser({ ...backendUser, display_name: updated.display_name });
        if (customUser) setCustomAuth(customToken, { ...customUser, display_name: updated.display_name });
      }

      if (preferences && JSON.stringify(preferences) !== JSON.stringify(savedPreferences)) {
        const saved = await apiFetch("/preferences/me", {
          method: "PATCH",
          body: JSON.stringify(preferences),
        });
        setPreferences(saved);
        setSavedPreferences(saved);
      }

      setMessage("Settings saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="prefs-panel user-panel" aria-label="User Settings">
      <header className="prefs-head">
        <User size={16} className="prefs-head-icon" aria-hidden="true" />
        <h2 className="prefs-head-title">User Settings</h2>
        <button
          type="button"
          className="prefs-close"
          onClick={onClose}
          aria-label="Close user settings"
        >
          <X size={18} />
        </button>
      </header>

      <div className="prefs-body">
        <form id="user-settings-form" className="vehicle-settings-form" onSubmit={handleSave}>
          <section className="settings-section">
            <h2>Profile</h2>

            <div className="user-identity">
              <div className="user-identity-avatar">
                {profile.avatar_url || profile.photoURL ? (
                  <img src={profile.avatar_url || profile.photoURL} alt="" />
                ) : (
                  <User size={26} aria-hidden="true" />
                )}
              </div>
              <div className="user-identity-text">
                <strong>{savedName || "Driver"}</strong>
                <span>{profile.email || "No email on file"}</span>
              </div>
            </div>

            <label className="settings-field">
              Display name
              <input
                type="text"
                value={displayName}
                maxLength={100}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="How DavaX greets you"
              />
            </label>
          </section>

          <section className="settings-section">
            <h2>Route preferences</h2>

            {loading ? (
              <p className="user-note">Loading…</p>
            ) : preferences ? (
              <>
                {PRIORITIES.map(([field, label]) => (
                  <label key={field} className="settings-field">
                    <span className="user-slider-label">
                      {label}
                      <span>{preferences[field]}/10</span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={preferences[field]}
                      onChange={(event) => setPreference(field, Number(event.target.value))}
                    />
                  </label>
                ))}

                <div className="settings-checks">
                  <label className="settings-checkbox">
                    <input
                      type="checkbox"
                      checked={preferences.avoid_tolls}
                      onChange={(event) => setPreference("avoid_tolls", event.target.checked)}
                    />
                    Avoid tolls
                  </label>
                  <label className="settings-checkbox">
                    <input
                      type="checkbox"
                      checked={preferences.avoid_highways}
                      onChange={(event) => setPreference("avoid_highways", event.target.checked)}
                    />
                    Avoid highways
                  </label>
                </div>

                <label className="settings-field user-fuel">
                  Preferred fuel
                  <select
                    value={preferences.preferred_fuel_type ?? "gasoline"}
                    onChange={(event) => setPreference("preferred_fuel_type", event.target.value)}
                  >
                    {FUEL_TYPES.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <p className="user-note">{preferencesNote}</p>
            )}
          </section>
        </form>
      </div>

      <footer className="prefs-foot">
        <button type="button" className="btn btn-secondary user-signout" onClick={logout}>
          <LogOut size={15} aria-hidden="true" />
          Sign out
        </button>
        <span className={`prefs-status ${error ? "error" : ""}`} role="status">
          {error || message}
        </span>
        <button
          className="btn btn-primary prefs-save"
          type="submit"
          form="user-settings-form"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </footer>
    </section>
  );
}
