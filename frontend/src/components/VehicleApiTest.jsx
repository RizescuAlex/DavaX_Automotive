import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../config/api";
import "./VehicleApiTest.css";

const GALLONS_TO_LITERS = 3.785411784;
const MPG_TO_L_PER_100_KM = 235.214583;
const MPGE_TO_KWH_PER_100_KM = 2093;

function formatNumber(value, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toFixed(digits) : null;
}

function getTrimName(spec) {
  return spec.trim || spec.submodel || "Unnamed configuration";
}

function getEfficiency(spec, fuelType) {
  const mpg = Number(spec.combined_mpg);
  if (!Number.isFinite(mpg) || mpg <= 0) return null;

  const isElectric = String(fuelType || "").toLowerCase().includes("electric");
  return {
    primary: `${(isElectric ? MPGE_TO_KWH_PER_100_KM : MPG_TO_L_PER_100_KM) / mpg}`,
    unit: isElectric ? "kWh/100 km" : "L/100 km",
    source: isElectric ? "combined MPGe" : "combined MPG",
  };
}

function TrimCard({ spec, fuelType, selected, saving, pending, onSelect }) {
  const efficiency = getEfficiency(spec, fuelType);
  const capacityLiters = formatNumber(Number(spec.fuel_tank_capacity_gal) * GALLONS_TO_LITERS);
  const efficiencyValue = efficiency ? Number(efficiency.primary).toFixed(1) : null;
  const description = [spec.submodel, spec.trim_description]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(" · ");

  return (
    <button
      type="button"
      className={`trim-option${selected ? " is-selected" : ""}`}
      onClick={() => onSelect(spec.trim_id)}
      disabled={pending || selected}
      aria-pressed={selected}
    >
      <span className="trim-option-topline">
        <span className="trim-option-radio" aria-hidden="true">
          {selected && <span />}
        </span>
        <span className={`trim-option-state${selected ? " is-selected" : ""}`}>
          {saving ? "Saving…" : selected ? "Current configuration" : "Choose configuration"}
        </span>
      </span>

      <span className="trim-option-title">{getTrimName(spec)}</span>
      {description && <span className="trim-option-description">{description}</span>}

      <span className="trim-option-metrics">
        <span className="trim-metric">
          <span className="trim-metric-label">Tank capacity</span>
          <strong>{capacityLiters ? `${capacityLiters} L` : "Not listed"}</strong>
          {capacityLiters && (
            <span className="trim-metric-detail">
              {formatNumber(spec.fuel_tank_capacity_gal)} US gal
            </span>
          )}
        </span>
        <span className="trim-metric">
          <span className="trim-metric-label">Combined efficiency</span>
          <strong>{efficiencyValue ? `${efficiencyValue} ${efficiency.unit}` : "Not listed"}</strong>
          {efficiency && (
            <span className="trim-metric-detail">
              {formatNumber(spec.combined_mpg)} {efficiency.source}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export default function VehicleApiTest() {
  const [vehicle, setVehicle] = useState(null);
  const [specs, setSpecs] = useState([]);
  const [selectedTrimId, setSelectedTrimId] = useState(null);
  const [query, setQuery] = useState("");
  const [loadingVehicle, setLoadingVehicle] = useState(true);
  const [loadingSpecs, setLoadingSpecs] = useState(false);
  const [savingTrimId, setSavingTrimId] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    const loadSavedVehicle = async () => {
      setLoadingVehicle(true);
      setError(null);
      try {
        const savedVehicle = await apiFetch("/vehicles/me");
        if (!active) return;
        setVehicle(savedVehicle);
        setSelectedTrimId(savedVehicle.selected_trim_id ?? null);

        try {
          const savedSpecs = await apiFetch("/vehicles/me/fuel-specs");
          if (active) setSpecs(Array.isArray(savedSpecs) ? savedSpecs : []);
        } catch (specError) {
          if (active) setError(specError.message || "Could not load saved vehicle configuration data.");
        }
      } catch (loadError) {
        if (active) setError(loadError.message || "Could not load your saved vehicle.");
      } finally {
        if (active) setLoadingVehicle(false);
      }
    };

    loadSavedVehicle();
    return () => { active = false; };
  }, []);

  const visibleSpecs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return specs;
    return specs.filter((spec) => [spec.trim, spec.submodel, spec.trim_description]
      .some((value) => String(value || "").toLowerCase().includes(normalizedQuery)));
  }, [query, specs]);

  const fetchSpecs = async () => {
    if (!vehicle) return;
    const params = new URLSearchParams({
      year: String(vehicle.model_year),
      make: vehicle.make,
      model: vehicle.model,
    });

    setLoadingSpecs(true);
    setError(null);
    setMessage("");
    try {
      const freshSpecs = await apiFetch(`/vehicle-specs?${params.toString()}`);
      setSpecs(Array.isArray(freshSpecs) ? freshSpecs : []);
      setMessage(freshSpecs.length
        ? `Found ${freshSpecs.length} ${freshSpecs.length === 1 ? "configuration" : "configurations"} for your vehicle.`
        : "CarAPI did not return any configurations for this vehicle.");
    } catch (fetchError) {
      setError(fetchError.message || "Could not fetch vehicle configurations from CarAPI.");
    } finally {
      setLoadingSpecs(false);
    }
  };

  const selectTrim = async (trimId) => {
    setSavingTrimId(trimId);
    setError(null);
    setMessage("");
    try {
      await apiFetch(`/vehicles/me/selected-trim?trim_id=${encodeURIComponent(trimId)}`, {
        method: "PUT",
      });
      setSelectedTrimId(trimId);
      const selected = specs.find((spec) => String(spec.trim_id) === String(trimId));
      setMessage(`${getTrimName(selected || {})} is now your selected vehicle configuration. Fuel estimates use its CarAPI data when available.`);
    } catch (saveError) {
      setError(saveError.message || "Could not save this vehicle configuration.");
    } finally {
      setSavingTrimId(null);
    }
  };

  const isElectric = String(vehicle?.fuel_type || "").toLowerCase().includes("electric");

  return (
    <main className="vehicle-trim-page">
      <div className="vehicle-trim-shell">
        <header className="vehicle-trim-nav">
          <Link className="vehicle-trim-back" to="/dashboard">
            <span aria-hidden="true">←</span> Dashboard
          </Link>
          <span className="vehicle-trim-nav-label">Vehicle setup</span>
        </header>

        <section className="vehicle-trim-hero">
          <span className="vehicle-trim-eyebrow"><span /> CAR DATA · CARAPI</span>
          <h1>Choose your vehicle configuration.</h1>
          <p>Match the configuration to your car so DavaX can use the available specifications for fuel and range estimates.</p>
        </section>

        <section className="vehicle-trim-car-card" aria-label="Saved vehicle">
          <div className="vehicle-trim-car-icon" aria-hidden="true">▰</div>
          <div className="vehicle-trim-car-copy">
            <span className="vehicle-trim-kicker">YOUR SAVED VEHICLE</span>
            {loadingVehicle ? (
              <strong className="vehicle-trim-loading-copy">Loading vehicle…</strong>
            ) : vehicle ? (
              <>
                <strong>{vehicle.model_year} {vehicle.make} {vehicle.model}</strong>
                <span>{vehicle.fuel_type || "Fuel type not specified"}</span>
              </>
            ) : (
              <strong>Vehicle details unavailable</strong>
            )}
          </div>
          <button
            type="button"
            className="vehicle-trim-refresh"
            onClick={fetchSpecs}
            disabled={!vehicle || loadingVehicle || loadingSpecs}
          >
            {loadingSpecs ? <><span className="trim-spinner" /> Fetching configurations</> : "Refresh configuration data"}
          </button>
        </section>

        {(error || message) && (
          <div className={`vehicle-trim-notice${error ? " is-error" : " is-success"}`} role={error ? "alert" : "status"}>
            <span className="vehicle-trim-notice-mark" aria-hidden="true">{error ? "!" : "✓"}</span>
            <span>{error || message}</span>
          </div>
        )}

        <section className="vehicle-trim-results" aria-labelledby="trim-results-title">
          <div className="vehicle-trim-results-heading">
            <div>
              <span className="vehicle-trim-kicker">MATCHING CONFIGURATIONS</span>
              <h2 id="trim-results-title">Available configurations</h2>
            </div>
            {specs.length > 0 && (
              <span className="vehicle-trim-count">{specs.length} {specs.length === 1 ? "option" : "options"}</span>
            )}
          </div>

          {specs.length > 1 && (
            <label className="vehicle-trim-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by configuration or description"
                aria-label="Filter vehicle configurations"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear configuration filter">×</button>
              )}
            </label>
          )}

          {loadingVehicle ? (
            <div className="trim-empty-state" aria-live="polite">
              <span className="trim-spinner large" />
              <strong>Loading your vehicle</strong>
              <p>Checking for saved vehicle configuration information.</p>
            </div>
          ) : !vehicle ? (
            <div className="trim-empty-state">
              <span className="trim-empty-symbol" aria-hidden="true">⌁</span>
              <strong>Add your vehicle first</strong>
              <p>Choose a vehicle during setup before loading matching CarAPI configurations.</p>
              <Link className="vehicle-trim-primary-link" to="/onboarding">Go to vehicle setup</Link>
            </div>
          ) : loadingSpecs && specs.length === 0 ? (
            <div className="trim-empty-state" aria-live="polite">
              <span className="trim-spinner large" />
              <strong>Finding your vehicle configurations</strong>
              <p>CarAPI data will appear here when it is ready.</p>
            </div>
          ) : specs.length === 0 ? (
            <div className="trim-empty-state">
              <span className="trim-empty-symbol" aria-hidden="true">⌁</span>
              <strong>No configuration data loaded yet</strong>
              <p>Fetch matching specifications for your saved vehicle to choose the right configuration.</p>
              <button type="button" className="vehicle-trim-primary-link" onClick={fetchSpecs} disabled={loadingSpecs}>
                {loadingSpecs ? "Fetching configurations…" : "Find configurations with CarAPI"}
              </button>
            </div>
          ) : visibleSpecs.length === 0 ? (
            <div className="trim-empty-state trim-empty-compact">
              <strong>No configurations match “{query}”</strong>
              <button type="button" className="vehicle-trim-text-button" onClick={() => setQuery("")}>Clear filter</button>
            </div>
          ) : (
            <div className="vehicle-trim-grid" role="group" aria-label="Choose a vehicle configuration">
              {visibleSpecs.map((spec) => (
                <TrimCard
                  key={spec.trim_id}
                  spec={spec}
                  fuelType={vehicle.fuel_type}
                  selected={String(selectedTrimId) === String(spec.trim_id)}
                  saving={String(savingTrimId) === String(spec.trim_id)}
                  pending={savingTrimId !== null}
                  onSelect={selectTrim}
                />
              ))}
            </div>
          )}

          {specs.length > 0 && (
            <p className="vehicle-trim-footnote">
              {isElectric
                ? "Efficiency is converted from CarAPI combined MPGe. Battery capacity is not provided by this data source."
                : "Efficiency and tank size are shown in familiar units and converted from CarAPI values."}
            </p>
          )}
        </section>

        <footer className="vehicle-trim-footer">
          <span>Vehicle configuration data is used to refine fuel level and range estimates.</span>
          <Link to="/dashboard">Back to dashboard <span aria-hidden="true">→</span></Link>
        </footer>
      </div>
    </main>
  );
}
