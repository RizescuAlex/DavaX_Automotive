import { useAppStore } from "../../store";

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
  const engineTemp = useAppStore((s) => s.engineTemp);

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
      <GaugeCard
        label="Fuel"
        value={Math.round(fuelLevel)}
        unit="%"
        percentage={fuelLevel}
        color={fuelColor}
      />
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
