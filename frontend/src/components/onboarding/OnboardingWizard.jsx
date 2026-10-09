import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../config/api";
import { useAppStore } from "../../store";
import { ROUTES } from "../../config/constants";
import { useAuth } from "../../auth/useAuth";
import "./OnboardingWizard.css";

const FUEL_TYPES = [
  { id: "gasoline", label: "Gasoline (Petrol)" },
  { id: "diesel", label: "Diesel" },
  { id: "hybrid", label: "Hybrid" },
  { id: "electric", label: "Electric (EV)" },
];

export default function OnboardingWizard({ onComplete }) {
  const navigate = useNavigate();
  const { setBackendUser, backendUser } = useAppStore();
  const { customUser, setCustomAuth, customToken } = useAppStore();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [preferences, setPreferences] = useState({
    fastest_arrival: 5,
    lowest_cost: 5,
    scenic_routes: 3,
    family_friendly: 3,
    avoid_tolls: false,
    avoid_highways: false,
    preferred_fuel_type: "gasoline",
    vehicle: {
      model_year: "2020",
      make: "Toyota",
      model: "Camry",
    },
  });

  const handleChange = (key, value) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    setError(null);
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/onboarding", {
        method: "POST",
        body: JSON.stringify(preferences),
      });

      // CarAPI returns trim-level rows. Persist them after the vehicle and
      // onboarding profile have been created; onboarding should still finish
      // if the external catalog is temporarily unavailable.
      try {
        const params = new URLSearchParams({
          year: String(preferences.vehicle.model_year),
          make: preferences.vehicle.make,
          model: preferences.vehicle.model,
        });
        await apiFetch(`/vehicle-specs?${params.toString()}`);
      } catch (specError) {
        console.warn("Vehicle created, but fuel specifications were not saved:", specError);
      }

      // Update local state to reflect completion
      if (backendUser) {
        setBackendUser({ ...backendUser, onboarding_completed: true });
      }
      if (customUser && customToken) {
        setCustomAuth(customToken, { ...customUser, onboarding_completed: true });
      }

      if (onComplete) {
        onComplete();
      } else {
        navigate(ROUTES.DASHBOARD, { replace: true });
      }
    } catch (err) {
      console.error("Onboarding failed:", err);
      setError(err.message || "Failed to save preferences. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <h2>Welcome to DavaX</h2>
          <p>Let's personalize your AI assistant.</p>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <div className="onboarding-content">
          {step === 1 && (
            <div className="step-panel animate-fade-in">
              <h3>Routing Priorities</h3>
              <p className="step-desc">How should DavaX plan your routes?</p>

              <div className="slider-group">
                <label>
                  <span>Fastest Arrival</span>
                  <span>{preferences.fastest_arrival}/10</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={preferences.fastest_arrival}
                  onChange={(e) => handleChange("fastest_arrival", parseInt(e.target.value))}
                />
              </div>

              <div className="slider-group">
                <label>
                  <span>Lowest Cost</span>
                  <span>{preferences.lowest_cost}/10</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={preferences.lowest_cost}
                  onChange={(e) => handleChange("lowest_cost", parseInt(e.target.value))}
                />
              </div>

              <div className="slider-group">
                <label>
                  <span>Scenic Routes</span>
                  <span>{preferences.scenic_routes}/10</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={preferences.scenic_routes}
                  onChange={(e) => handleChange("scenic_routes", parseInt(e.target.value))}
                />
              </div>

              <div className="slider-group">
                <label>
                  <span>Family Friendly (Stops & POIs)</span>
                  <span>{preferences.family_friendly}/10</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={preferences.family_friendly}
                  onChange={(e) => handleChange("family_friendly", parseInt(e.target.value))}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="step-panel animate-fade-in">
              <h3>Route Avoidances</h3>
              <p className="step-desc">Select elements you typically want to avoid.</p>

              <div className="toggle-group">
                <label className="toggle-label">
                  <div>
                    <strong>Avoid Tolls</strong>
                    <span className="hint">Minimize routes with toll roads</span>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-input"
                    checked={preferences.avoid_tolls}
                    onChange={(e) => handleChange("avoid_tolls", e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="toggle-group">
                <label className="toggle-label">
                  <div>
                    <strong>Avoid Highways</strong>
                    <span className="hint">Prefer local roads over highways</span>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-input"
                    checked={preferences.avoid_highways}
                    onChange={(e) => handleChange("avoid_highways", e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="step-panel animate-fade-in">
              <h3>Vehicle Profile</h3>
              <p className="step-desc">Select your primary fuel type for accurate cost and routing estimations.</p>

              <div className="fuel-grid">
                {FUEL_TYPES.map((fuel) => (
                  <button
                    key={fuel.id}
                    className={`fuel-card ${preferences.preferred_fuel_type === fuel.id ? "selected" : ""}`}
                    onClick={() => handleChange("preferred_fuel_type", fuel.id)}
                  >
                    {fuel.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="step-panel animate-fade-in">
              <h3>Your Car</h3>
              <p className="step-desc">
                Enter a demo vehicle so DavaX can retrieve its fuel specifications.
              </p>

              <div className="vehicle-input-group">
                <label htmlFor="vehicle-year">Model year</label>
                <input
                  id="vehicle-year"
                  type="number"
                  min="2015"
                  max="2020"
                  value={preferences.vehicle.model_year}
                  onChange={(e) =>
                    handleChange("vehicle", {
                      ...preferences.vehicle,
                      model_year: e.target.value,
                    })
                  }
                  required
                />
              </div>

              <div className="vehicle-input-group">
                <label htmlFor="vehicle-make">Make</label>
                <input
                  id="vehicle-make"
                  type="text"
                  value={preferences.vehicle.make}
                  onChange={(e) =>
                    handleChange("vehicle", {
                      ...preferences.vehicle,
                      make: e.target.value,
                    })
                  }
                  placeholder="Toyota"
                  required
                />
              </div>

              <div className="vehicle-input-group">
                <label htmlFor="vehicle-model">Model</label>
                <input
                  id="vehicle-model"
                  type="text"
                  value={preferences.vehicle.model}
                  onChange={(e) =>
                    handleChange("vehicle", {
                      ...preferences.vehicle,
                      model: e.target.value,
                    })
                  }
                  placeholder="Camry"
                  required
                />
              </div>
            </div>
          )}
        </div>

        <div className="onboarding-footer">
          {step > 1 ? (
            <button className="btn btn-secondary" onClick={handleBack} disabled={loading}>
              Back
            </button>
          ) : (
            <div></div> // Spacer
          )}

          {step < 4 ? (
            <button className="btn btn-primary" onClick={handleNext}>
              Next Step
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? "Saving..." : "Complete Setup"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
