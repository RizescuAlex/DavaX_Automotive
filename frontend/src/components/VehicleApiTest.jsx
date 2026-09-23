import { useState } from "react";
import { apiFetch } from "../config/api";

const initialVehicle = {
  model_year: "2020",
  make: "Toyota",
  model: "Camry",
};

export default function VehicleApiTest() {
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [specs, setSpecs] = useState([]);

  const fetchSpecs = async (selectedVehicle) => {
    const params = new URLSearchParams({
      year: String(selectedVehicle.model_year),
      make: selectedVehicle.make,
      model: selectedVehicle.model,
    });

    const data = await apiFetch(`/vehicle-specs?${params.toString()}`);
    setResult(data);
    setSpecs(Array.isArray(data) ? data : data?.specs || []);
  };

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      await fetchSpecs(vehicle);
    } catch (err) {
      setError(err.message || "Failed to fetch vehicle data.");
    } finally {
      setLoading(false);
    }
  };

  const handleSavedVehicleLookup = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const savedVehicle = await apiFetch("/vehicles/me");
      setVehicle({
        model_year: String(savedVehicle.model_year),
        make: savedVehicle.make,
        model: savedVehicle.model,
      });
      await fetchSpecs(savedVehicle);
    } catch (err) {
      setError(err.message || "Failed to load your saved vehicle.");
    } finally {
      setLoading(false);
    }
  };

  const updateVehicle = (field, value) => {
    setVehicle((current) => ({ ...current, [field]: value }));
  };

  const selectTrim = async (trimId) => {
    try {
      await apiFetch(`/vehicles/me/selected-trim?trim_id=${encodeURIComponent(trimId)}`, {
        method: "PUT",
      });
    } catch (err) {
      setError(err.message || "Failed to select vehicle trim.");
    }
  };

  return (
    <main style={{ maxWidth: "760px", margin: "2rem auto", padding: "1rem" }}>
      <h1>Vehicle API Test</h1>
      <p>Look up fuel capacity and consumption data from CarAPI.</p>

      <form onSubmit={handleManualSubmit} style={{ display: "grid", gap: "1rem" }}>
        <label>
          Model year
          <input
            type="number"
            min="2015"
            max="2020"
            value={vehicle.model_year}
            onChange={(event) => updateVehicle("model_year", event.target.value)}
            required
          />
        </label>

        <label>
          Make
          <input
            type="text"
            value={vehicle.make}
            onChange={(event) => updateVehicle("make", event.target.value)}
            required
          />
        </label>

        <label>
          Model
          <input
            type="text"
            value={vehicle.model}
            onChange={(event) => updateVehicle("model", event.target.value)}
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Loading..." : "Fetch selected vehicle"}
        </button>
      </form>

      <button
        type="button"
        onClick={handleSavedVehicleLookup}
        disabled={loading}
        style={{ marginTop: "1rem" }}
      >
        {loading ? "Loading..." : "Load my saved car and fetch specs"}
      </button>

      {error && <p role="alert">{error}</p>}

      {result && (
        <pre style={{ marginTop: "1.5rem", overflowX: "auto" }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      {specs.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <h2>Saved trims</h2>
          {specs.map((spec) => (
            <div key={spec.trim_id} style={{ display: "flex", gap: "1rem", margin: "0.5rem 0" }}>
              <span>
                {spec.trim || spec.submodel || "Unnamed trim"} — {spec.fuel_tank_capacity_gal ?? "—"} gal, {spec.combined_mpg ?? "—"} combined MPG
              </span>
              <button type="button" onClick={() => selectTrim(spec.trim_id)}>
                Use this trim
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
