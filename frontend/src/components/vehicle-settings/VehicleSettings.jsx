import { useEffect, useState } from "react";
import { apiFetch } from "../../config/api";

const DEFAULT_SETTINGS = {
  profile_name: "default",
  climate_settings: { target_temperature: 21.5 },
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

  if (loading) {
    return <p>Loading vehicle preferences...</p>;
  }

  return (
    <main>
      <h1>Vehicle Preferences</h1>

      {error && <p role="alert">{error}</p>}
      {message && <p>{message}</p>}

      <form onSubmit={handleSave}>
        <h2>Climate</h2>

        <label>
          Target temperature
          <input
            type="number"
            min="15"
            max="30"
            step="0.5"
            value={settings.climate_settings.target_temperature}
            onChange={(event) =>
              updateSetting(
                "climate_settings",
                "target_temperature",
                event.target.value
              )
            }
          />
        </label>

        <h2>Seat position</h2>

        <label>
          Height
          <input
            type="number"
            value={settings.seat_position.height}
            onChange={(event) =>
              updateSetting("seat_position", "height", event.target.value)
            }
          />
        </label>

        <label>
          Distance
          <input
            type="number"
            value={settings.seat_position.distance}
            onChange={(event) =>
              updateSetting("seat_position", "distance", event.target.value)
            }
          />
        </label>

        <label>
          Recline
          <input
            type="number"
            value={settings.seat_position.recline}
            onChange={(event) =>
              updateSetting("seat_position", "recline", event.target.value)
            }
          />
        </label>

        <h2>Steering wheel</h2>

        <label>
          Height
          <input
            type="number"
            value={settings.steering_position.height}
            onChange={(event) =>
              updateSetting("steering_position", "height", event.target.value)
            }
          />
        </label>

        <label>
          Depth
          <input
            type="number"
            value={settings.steering_position.depth}
            onChange={(event) =>
              updateSetting("steering_position", "depth", event.target.value)
            }
          />
        </label>

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save preferences"}
        </button>
      </form>
    </main>
  );
}