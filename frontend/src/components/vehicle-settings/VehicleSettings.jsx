import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../config/api";
import { useAuth } from "../../auth/useAuth";
import { DESIGN_PREVIEW } from "../../config/devPreview";
import carIso from "../../assets/car-top-view.svg";
import TopBar from "../dashboard/TopBar";
import "./VehicleSettings.css";

const LIGHT_ZONES = [
  ["front_left_overhead", "Front-left overhead"],
  ["front_right_overhead", "Front-right overhead"],
  ["driver_leg", "Driver leg"],
  ["front_passenger_leg", "Front passenger leg"],
  ["rear_left_leg", "Rear-left leg"],
  ["rear_right_leg", "Rear-right leg"],
  ["rear_overhead", "Rear overhead"],
];

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
      LIGHT_ZONES.map(([id]) => [id, { ...DEFAULT_LIGHT_ZONE }])
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
      LIGHT_ZONES.map(([id]) => [
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

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedLight, setSelectedLight] = useState("driver_leg");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSettings() {
      if (DESIGN_PREVIEW) {
        setLoading(false);
        return;
      }

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

  const updateMirror = (mirror, field, value) => {
    setSettings((previous) => ({
      ...previous,
      [mirror]: {
        ...previous[mirror],
        [field]: Number(value),
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
      if (!DESIGN_PREVIEW) {
        await apiFetch("/vehicle-settings/me", {
          method: "PUT",
          body: JSON.stringify(settings),
        });
      }

      setMessage("Vehicle preferences saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedZone =
    settings.lighting_settings.interior[selectedLight] ||
    DEFAULT_LIGHT_ZONE;

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
                  min="15"
                  max="30"
                  step="0.5"
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
                  max="5"
                  value={settings.climate_settings.fan_speed}
                  onChange={(event) =>
                    updateNestedSetting(
                      "climate_settings",
                      "fan_speed",
                      event.target.value
                    )
                  }
                />
                <span>{settings.climate_settings.fan_speed}/5</span>
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
            </section>

            <section className="settings-section">
              <h2>Interior lighting</h2>

              <div className="lighting-layout">
                <div className="mini-car-preview">
                  <img
                    src={carIso}
                    alt="Vehicle lighting preview"
                    className="mini-car-image"
                  />

                  <div className="light-zone-map">
                    {LIGHT_ZONES.map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`light-zone light-zone-${id} ${
                          selectedLight === id ? "selected" : ""
                        } ${
                          settings.lighting_settings.interior[id].enabled
                            ? "enabled"
                            : ""
                        }`}
                        title={label}
                        aria-label={label}
                        aria-pressed={selectedLight === id}
                        onClick={() => setSelectedLight(id)}
                      />
                    ))}
                  </div>
                </div>

                <div className="light-controls">
                  <h3>
                    {LIGHT_ZONES.find(([id]) => id === selectedLight)?.[1]}
                  </h3>

                  <label className="settings-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedZone.enabled}
                      onChange={(event) =>
                        updateLightZone(
                          selectedLight,
                          "enabled",
                          event.target.checked
                        )
                      }
                    />
                    Light enabled
                  </label>

                  <label className="settings-field">
                    Color
                    <input
                      type="color"
                      value={selectedZone.color}
                      onChange={(event) =>
                        updateLightZone(
                          selectedLight,
                          "color",
                          event.target.value
                        )
                      }
                    />
                  </label>

                  <label className="settings-field">
                    Brightness
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={selectedZone.brightness}
                      onChange={(event) =>
                        updateLightZone(
                          selectedLight,
                          "brightness",
                          event.target.value
                        )
                      }
                    />
                    <span>{selectedZone.brightness}%</span>
                  </label>
                </div>
              </div>
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
                          updateMirror(
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
                          updateMirror(
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