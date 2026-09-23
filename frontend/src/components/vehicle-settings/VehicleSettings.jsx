import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/useAuth";
import { getVehicleSettings, saveVehicleSettings } from "../../api/vehicle";
import { useAppStore, CLIMATE_LIMITS } from "../../store";
import TopBar from "../dashboard/TopBar";
import AmbientLighting, { LIGHT_ZONES } from "./AmbientLighting";
import "./VehicleSettings.css";

const DEFAULT_LIGHT_ZONE = {
  enabled: false,
  color: "#ffffff",
  brightness: 70,
};

const DEFAULT_SETTINGS = {
  profile_name: "default",

  climate_settings: {
    target_temperature: 21.5,
    fan_speed: 2,
    ac_level: 2,
    auto_mode: true,
    seat_heat_left: 0,
    seat_heat_right: 0,
    front_defrost: false,
    rear_defrost: false,
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

  mirror_left: {
    horizontal_angle: 0,
    vertical_angle: 0,
  },

  mirror_right: {
    horizontal_angle: 0,
    vertical_angle: 0,
  },

  mirror_rear: {
    horizontal_angle: 0,
    vertical_angle: 0,
  },

  lighting_settings: {
    interior: Object.fromEntries(
      LIGHT_ZONES.map(({ id }) => [id, { ...DEFAULT_LIGHT_ZONE }])
    ),

    exterior: {
      headlights: {
        brightness: 80,
        automatic: true,
        daytime_running: true,
        follow_me_home: false,
        fog_lights: false,
      },

      rear_lights: {
        brightness: 80,
        automatic: true,
        rear_fog_lights: false,
      },
    },
  },

  is_active: true,
};

function mergeLightingSettings(data) {
  const savedLighting = data?.lighting_settings || {};
  const savedInterior = savedLighting.interior || {};
  const savedExterior = savedLighting.exterior || {};

  return {
    ...DEFAULT_SETTINGS.lighting_settings,
    ...savedLighting,

    interior: Object.fromEntries(
      LIGHT_ZONES.map(({ id }) => [
        id,
        {
          ...DEFAULT_LIGHT_ZONE,
          ...(savedInterior[id] || {}),
        },
      ])
    ),

    exterior: {
      ...DEFAULT_SETTINGS.lighting_settings.exterior,
      ...savedExterior,

      headlights: {
        ...DEFAULT_SETTINGS.lighting_settings.exterior.headlights,
        ...(savedExterior.headlights || {}),
      },

      rear_lights: {
        ...DEFAULT_SETTINGS.lighting_settings.exterior.rear_lights,
        ...(savedExterior.rear_lights || {}),
      },
    },
  };
}

export default function VehicleSettings() {
  const { user, logout } = useAuth();
  const applyClimateSettings = useAppStore((s) => s.applyClimateSettings);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedLight, setSelectedLight] = useState("driver_leg");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await getVehicleSettings();

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

            mirror_left: {
              ...DEFAULT_SETTINGS.mirror_left,
              ...(data.mirror_left || {}),
            },

            mirror_right: {
              ...DEFAULT_SETTINGS.mirror_right,
              ...(data.mirror_right || {}),
            },

            mirror_rear: {
              ...DEFAULT_SETTINGS.mirror_rear,
              ...(data.mirror_rear || {}),
            },

            lighting_settings: mergeLightingSettings(data),
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

  const updateNestedSetting = (section, field, value) => {
    setSettings((previous) => ({
      ...previous,
      [section]: {
        ...previous[section],
        [field]: Number(value),
      },
    }));
  };

  const updateClimateFlag = (field, value) => {
    setSettings((previous) => ({
      ...previous,
      climate_settings: {
        ...previous.climate_settings,
        [field]: value,
      },
    }));
  };

  const updateLightZone = (zone, field, value) => {
    setSettings((previous) => ({
      ...previous,
      lighting_settings: {
        ...previous.lighting_settings,
        interior: {
          ...previous.lighting_settings.interior,
          [zone]: {
            ...previous.lighting_settings.interior[zone],
            [field]: field === "brightness" ? Number(value) : value,
          },
        },
      },
    }));
  };

  const applyLightToAll = () => {
    setSettings((previous) => {
      const { color, brightness } = previous.lighting_settings.interior[selectedLight];
      return {
        ...previous,
        lighting_settings: {
          ...previous.lighting_settings,
          interior: Object.fromEntries(
            Object.entries(previous.lighting_settings.interior).map(([id, zone]) => [
              id,
              { ...zone, color, brightness },
            ])
          ),
        },
      };
    });
  };

  const updateExteriorLight = (group, field, value) => {
    setSettings((previous) => ({
      ...previous,
      lighting_settings: {
        ...previous.lighting_settings,
        exterior: {
          ...previous.lighting_settings.exterior,
          [group]: {
            ...previous.lighting_settings.exterior[group],
            [field]: value,
          },
        },
      },
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const saved = await saveVehicleSettings(settings);
      // The dock holds its own copy of climate; hand it the saved one so it
      // does not keep showing, and later re-save, what was there before.
      applyClimateSettings(saved?.climate_settings ?? settings.climate_settings);

      setMessage("Vehicle preferences saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="vehicle-settings-shell">
        <TopBar user={user} onLogout={logout} />

        <main className="vehicle-settings-page">
          <div className="vehicle-settings-card">
            <p>Loading vehicle preferences...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="vehicle-settings-shell">
      <TopBar user={user} onLogout={logout} />

      <main className="vehicle-settings-page">
        <div className="vehicle-settings-card">
          <Link to="/dashboard" className="settings-back-button">
            <ArrowLeft size={17} />
            Back to dashboard
          </Link>

          <div className="vehicle-settings-header">
            <h1>Vehicle Preferences</h1>
            <p>
              Personalize your comfort, lighting, mirrors, and driving
              position.
            </p>
          </div>

          {error && <div className="settings-error">{error}</div>}
          {message && <div className="settings-success">{message}</div>}

          <form className="vehicle-settings-form" onSubmit={handleSave}>
            <section className="settings-section">
              <h2>Climate</h2>

              <label className="settings-field">
                Target temperature
                <input
                  type="number"
                  min={CLIMATE_LIMITS.TEMP_MIN}
                  max={CLIMATE_LIMITS.TEMP_MAX}
                  step={CLIMATE_LIMITS.TEMP_STEP}
                  value={settings.climate_settings.target_temperature}
                  onChange={(event) =>
                    updateNestedSetting(
                      "climate_settings",
                      "target_temperature",
                      event.target.value
                    )
                  }
                />
              </label>

              <label className="settings-field">
                Fan speed
                <input
                  type="range"
                  min="0"
                  max={CLIMATE_LIMITS.FAN_MAX}
                  value={settings.climate_settings.fan_speed}
                  onChange={(event) =>
                    updateNestedSetting(
                      "climate_settings",
                      "fan_speed",
                      event.target.value
                    )
                  }
                />
                <span>{settings.climate_settings.fan_speed}/{CLIMATE_LIMITS.FAN_MAX}</span>
              </label>

              <div className="settings-grid">
                <label className="settings-field">
                  Driver seat heating
                  <select
                    value={settings.climate_settings.seat_heat_left}
                    onChange={(event) =>
                      updateNestedSetting(
                        "climate_settings",
                        "seat_heat_left",
                        event.target.value
                      )
                    }
                  >
                    <option value="0">Off</option>
                    <option value="1">Level 1</option>
                    <option value="2">Level 2</option>
                    <option value="3">Level 3</option>
                  </select>
                </label>

                <label className="settings-field">
                  Passenger seat heating
                  <select
                    value={settings.climate_settings.seat_heat_right}
                    onChange={(event) =>
                      updateNestedSetting(
                        "climate_settings",
                        "seat_heat_right",
                        event.target.value
                      )
                    }
                  >
                    <option value="0">Off</option>
                    <option value="1">Level 1</option>
                    <option value="2">Level 2</option>
                    <option value="3">Level 3</option>
                  </select>
                </label>
              </div>

              {/* The dock's own settings. They live in the same
                  climate_settings record, so they belong here too. */}
              <div className="settings-grid">
                <label className="settings-field">
                  Air conditioning
                  <select
                    value={settings.climate_settings.ac_level}
                    onChange={(event) =>
                      updateNestedSetting(
                        "climate_settings",
                        "ac_level",
                        event.target.value
                      )
                    }
                  >
                    <option value="0">Off</option>
                    <option value="1">Level 1</option>
                    <option value="2">Level 2</option>
                    <option value="3">Level 3</option>
                  </select>
                </label>

                <div className="settings-checks">
                  {[
                    ["auto_mode", "Automatic climate"],
                    ["front_defrost", "Front defogger"],
                    ["rear_defrost", "Rear defogger"],
                  ].map(([field, label]) => (
                    <label key={field} className="settings-checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(settings.climate_settings[field])}
                        onChange={(event) =>
                          updateClimateFlag(field, event.target.checked)
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </section>

            <section className="settings-section">
              <h2>Ambient lighting</h2>

              <AmbientLighting
                interior={settings.lighting_settings.interior}
                selected={selectedLight}
                onSelect={setSelectedLight}
                onChange={updateLightZone}
                onApplyToAll={applyLightToAll}
              />
            </section>

            <section className="settings-section">
              <h2>Exterior lights</h2>

              <h3>Headlights</h3>

              <label className="settings-field">
                Brightness
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={
                    settings.lighting_settings.exterior.headlights.brightness
                  }
                  onChange={(event) =>
                    updateExteriorLight(
                      "headlights",
                      "brightness",
                      Number(event.target.value)
                    )
                  }
                />
                <span>
                  {settings.lighting_settings.exterior.headlights.brightness}%
                </span>
              </label>

              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={
                    settings.lighting_settings.exterior.headlights.automatic
                  }
                  onChange={(event) =>
                    updateExteriorLight(
                      "headlights",
                      "automatic",
                      event.target.checked
                    )
                  }
                />
                Automatic headlights
              </label>

              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={
                    settings.lighting_settings.exterior.headlights
                      .daytime_running
                  }
                  onChange={(event) =>
                    updateExteriorLight(
                      "headlights",
                      "daytime_running",
                      event.target.checked
                    )
                  }
                />
                Daytime running lights
              </label>

              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={
                    settings.lighting_settings.exterior.headlights
                      .follow_me_home
                  }
                  onChange={(event) =>
                    updateExteriorLight(
                      "headlights",
                      "follow_me_home",
                      event.target.checked
                    )
                  }
                />
                Follow-me-home lighting
              </label>

              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={
                    settings.lighting_settings.exterior.headlights.fog_lights
                  }
                  onChange={(event) =>
                    updateExteriorLight(
                      "headlights",
                      "fog_lights",
                      event.target.checked
                    )
                  }
                />
                Fog lights
              </label>

              <h3>Rear lights</h3>

              <label className="settings-field">
                Brightness
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={
                    settings.lighting_settings.exterior.rear_lights.brightness
                  }
                  onChange={(event) =>
                    updateExteriorLight(
                      "rear_lights",
                      "brightness",
                      Number(event.target.value)
                    )
                  }
                />
                <span>
                  {settings.lighting_settings.exterior.rear_lights.brightness}%
                </span>
              </label>

              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={
                    settings.lighting_settings.exterior.rear_lights.automatic
                  }
                  onChange={(event) =>
                    updateExteriorLight(
                      "rear_lights",
                      "automatic",
                      event.target.checked
                    )
                  }
                />
                Automatic rear lights
              </label>

              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={
                    settings.lighting_settings.exterior.rear_lights
                      .rear_fog_lights
                  }
                  onChange={(event) =>
                    updateExteriorLight(
                      "rear_lights",
                      "rear_fog_lights",
                      event.target.checked
                    )
                  }
                />
                Rear fog lights
              </label>
            </section>

            <section className="settings-section">
              <h2>Mirrors</h2>

              <div className="settings-grid">
                {[
                  ["mirror_left", "Left mirror"],
                  ["mirror_right", "Right mirror"],
                  ["mirror_rear", "Rearview mirror"],
                ].map(([mirror, label]) => (
                  <div key={mirror} className="mirror-card">
                    <h3>{label}</h3>

                    <label className="settings-field">
                      Horizontal angle
                      <input
                        type="range"
                        min="-30"
                        max="30"
                        value={settings[mirror].horizontal_angle}
                        onChange={(event) =>
                          updateNestedSetting(
                            mirror,
                            "horizontal_angle",
                            event.target.value
                          )
                        }
                      />
                      <span>{settings[mirror].horizontal_angle}°</span>
                    </label>

                    <label className="settings-field">
                      Vertical angle
                      <input
                        type="range"
                        min="-20"
                        max="20"
                        value={settings[mirror].vertical_angle}
                        onChange={(event) =>
                          updateNestedSetting(
                            mirror,
                            "vertical_angle",
                            event.target.value
                          )
                        }
                      />
                      <span>{settings[mirror].vertical_angle}°</span>
                    </label>
                  </div>
                ))}
              </div>
            </section>

            <section className="settings-section">
              <h2>Seat position</h2>

              <div className="settings-grid">
                {["height", "distance", "recline"].map((field) => (
                  <label key={field} className="settings-field">
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                    <input
                      type="number"
                      value={settings.seat_position[field]}
                      onChange={(event) =>
                        updateNestedSetting(
                          "seat_position",
                          field,
                          event.target.value
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="settings-section">
              <h2>Steering wheel position</h2>

              <div className="settings-grid">
                {["height", "depth"].map((field) => (
                  <label key={field} className="settings-field">
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                    <input
                      type="number"
                      value={settings.steering_position[field]}
                      onChange={(event) =>
                        updateNestedSetting(
                          "steering_position",
                          field,
                          event.target.value
                        )
                      }
                    />
                  </label>
                ))}
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
        </div>
      </main>
    </div>
  );
}