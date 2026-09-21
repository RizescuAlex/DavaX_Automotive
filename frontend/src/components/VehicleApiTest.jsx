import { useState } from "react";
import { apiFetch } from "../config/api";

const inputStyle = {
  width: "100%",
  padding: "0.6rem 0.7rem",
  border: "1px solid #555",
  borderRadius: "6px",
  background: "transparent",
  color: "inherit",
  boxSizing: "border-box",
};

export default function VehicleApiTest() {
  const [year, setYear] = useState("2020");
  const [make, setMake] = useState("Toyota");
  const [model, setModel] = useState("Camry");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const params = new URLSearchParams({
        year,
        make,
        model,
      });

      const data = await apiFetch(`/vehicle-specs?${params.toString()}`);
      setResult(data);
    } catch (err) {
      setError(err.message || "Failed to fetch vehicle data.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: "760px", margin: "2rem auto", padding: "1rem" }}>
      <h1>Vehicle API Test</h1>
      <p>Look up fuel capacity and consumption data from CarAPI.</p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
        <label>
          Model year
          <input
            type="number"
            min="2015"
            max="2020"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            style={inputStyle}
            required
          />
        </label>

        <label>
          Make
          <input
            type="text"
            value={make}
            onChange={(event) => setMake(event.target.value)}
            style={inputStyle}
            placeholder="Toyota"
            required
          />
        </label>

        <label>
          Model
          <input
            type="text"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            style={inputStyle}
            placeholder="Camry"
            required
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Loading..." : "Fetch vehicle data"}
        </button>
      </form>

      {error && (
        <p role="alert" style={{ color: "#d9534f", marginTop: "1rem" }}>
          {error}
        </p>
      )}

      {result && (
        <pre
          style={{
            marginTop: "1.5rem",
            padding: "1rem",
            overflowX: "auto",
            borderRadius: "6px",
            background: "rgba(0, 0, 0, 0.25)",
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
