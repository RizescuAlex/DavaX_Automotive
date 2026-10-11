import { useAppStore } from "../../store";

function formatFuelAmount(amount) {
  return Number(amount.toFixed(1)).toString();
}

function GaugeCard({ label, value, unit, percentage, color }) {
  return (
    <div className="gauge-card">
      <span className="gauge-label">{label}</span>
      <div className="gauge-value">
        <span className="gauge-number">{value}</span>
        <span className="gauge-unit">{unit}</span>
      </div>
      <div className="gauge-bar-track">
        <div
          className="gauge-bar-fill"
          style={{
            width: `${Math.min(percentage, 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

/** Fuel and engine temperature for the rail. */
export default function VehicleGauges() {
  const fuelLevel = useAppStore((s) => s.fuelLevel);
  const fuelCapacity = useAppStore((s) => s.fuelCapacity);
  const fuelCapacityUnit = useAppStore((s) => s.fuelCapacityUnit);
  const engineTemp = useAppStore((s) => s.engineTemp);
  const currentFuelAmount = Math.max(0, fuelCapacity * fuelLevel / 100);

  const fuelColor =
    fuelLevel > 50 ? "var(--color-success)"
    : fuelLevel > 20 ? "var(--color-warning)"
    : "var(--color-error)";

  const tempColor =
    engineTemp < 100 ? "var(--color-success)"
    : engineTemp < 110 ? "var(--color-warning)"
    : "var(--color-error)";
  return (
    <div className="vehicle-gauges">
      <div className="gauge-card fuel-gauge">
        <span className="gauge-label">Fuel</span>
        <div className="fuel-gauge-reading">
          <div className="gauge-value">
            <span className="gauge-number">{Math.round(fuelLevel)}</span>
            <span className="gauge-unit">%</span>
          </div>
          <div className="fuel-gauge-amount">
            <strong>{`${formatFuelAmount(currentFuelAmount)}${fuelCapacityUnit}/${formatFuelAmount(fuelCapacity)}${fuelCapacityUnit}`}</strong>
          </div>
        </div>
        <div
          className="gauge-bar-track fuel-gauge-track"
          role="progressbar"
          aria-label="Fuel level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fuelLevel)}
        >
          <div
            className="gauge-bar-fill"
            style={{
              width: `${Math.min(fuelLevel, 100)}%`,
              backgroundColor: fuelColor,
            }}
          />
        </div>
      </div>
      <GaugeCard
        label="Engine"
        value={Math.round(engineTemp)}
        unit="°C"
        percentage={(engineTemp / 130) * 100}
        color={tempColor}
      />
    </div>
  );
}
