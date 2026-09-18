import { useEffect, useState } from "react";
import { apiFetch } from "../../config/api";
import { useAuth } from "../../auth/useAuth";
import TopBar from "../dashboard/TopBar";
import "./VehicleSettings.css";

const DEFAULT_SETTINGS = {
  profile_name: "default",
  climate_settings: {
    target_temperature: 21.5,
  },
  seat_position: {
    height: 0,
    distance: 0,
    recline: 0,
  },
  steering_position: {
    height: 0,
    depth: 0,
  },
  is_active: true,
};

export default function VehicleSettings() {
  const { user, logout } = useAuth();

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await apiFetch("/vehicle-settings/me");

        if (data) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...data,
            climate_settings: {
              ...DEFAULT_SETTINGS.climate_settings,
              ...(data.climate_settings || {}),
            },
            seat_position: {
              ...DEFAULT_SETTINGS.seat_position,
              ...(data.seat_position || {}),
            },
            steering_position: {
              ...DEFAULT_SETTINGS.steering_position,
              ...(data.steering_position || {}),
            },
          });
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const updateSetting = (section, field, value) => {
    setSettings((previous) => ({
      ...previous,
      [section]: {
        ...previous[section],
        [field]: Number(value),
      },
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await apiFetch("/vehicle-settings/me", {
        method: "PUT",
        body: JSON.stringify(settings),
      });

      setMessage("Vehicle preferences saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="vehicle-settings-shell">
      <TopBar user={user} onLogout={logout} />

      <main className="vehicle-settings-page">
        <div className="vehicle-settings-card">
          <div className="vehicle-settings-header">
            <h1>Vehicle Preferences</h1>
            <p>Personalize your comfort and driving position.</p>
          </div>

          {loading ? (
            <p>Loading vehicle preferences...</p>
          ) : (
            <>
              {error && <div className="settings-error">{error}</div>}
              {message && <div className="settings-success">{message}</div>}

              <form
                className="vehicle-settings-form"
                onSubmit={handleSave}
              >
                <section className="settings-section">
                  <h2>Climate</h2>

                  <label className="settings-field">
                    Target temperature
                    <input
                      type="number"
                      min="15"
                      max="30"
                      step="0.5"
                      value={
                        settings.climate_settings.target_temperature
                      }
                      onChange={(event) =>
                        updateSetting(
                          "climate_settings",
                          "target_temperature",
                          event.target.value
                        )
                      }
                    />
                  </label>
                </section>

                <section className="settings-section">
                  <h2>Seat position</h2>

                  <div className="settings-grid">
                    <label className="settings-field">
                      Height
                      <input
                        type="number"
                        value={settings.seat_position.height}
                        onChange={(event) =>
                          updateSetting(
                            "seat_position",
                            "height",
                            event.target.value
                          )
                        }
                      />
                    </label>

                    <label className="settings-field">
                      Distance
                      <input
                        type="number"
                        value={settings.seat_position.distance}
                        onChange={(event) =>
                          updateSetting(
                            "seat_position",
                            "distance",
                            event.target.value
                          )
                        }
                      />
                    </label>

                    <label className="settings-field">
                      Recline
                      <input
                        type="number"
                        value={settings.seat_position.recline}
                        onChange={(event) =>
                          updateSetting(
                            "seat_position",
                            "recline",
                            event.target.value
                          )
                        }
                      />
                    </label>
                  </div>
                </section>

                <section className="settings-section">
                  <h2>Steering wheel</h2>

                  <div className="settings-grid">
                    <label className="settings-field">
                      Height
                      <input
                        type="number"
                        value={settings.steering_position.height}
                        onChange={(event) =>
                          updateSetting(
                            "steering_position",
                            "height",
                            event.target.value
                          )
                        }
                      />
                    </label>

                    <label className="settings-field">
                      Depth
                      <input
                        type="number"
                        value={settings.steering_position.depth}
                        onChange={(event) =>
                          updateSetting(
                            "steering_position",
                            "depth",
                            event.target.value
                          )
                        }
                      />
                    </label>
                  </div>
                </section>

                <button
                  className="settings-save-button"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save preferences"}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}