import { useAppStore } from "../../store";
import { Gauge, Fuel, Thermometer } from "lucide-react";

function GaugeCard({ icon: Icon, label, value, unit, percentage, color }) {
  return (
    <div className="gauge-card">
      <div className="gauge-card-header">
        <Icon size={16} className="gauge-icon" />
        <span className="gauge-label">{label}</span>
      </div>
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

export default function VehicleGauges() {
  const speed = useAppStore((s) => s.speed);
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
        icon={Gauge}
        label="Speed"
        value={Math.round(speed)}
        unit="km/h"
        percentage={(speed / 240) * 100}
        color="var(--accent-primary)"
      />
      <GaugeCard
        icon={Fuel}
        label="Fuel Level"
        value={Math.round(fuelLevel)}
        unit="%"
        percentage={fuelLevel}
        color={fuelColor}
      />
      <GaugeCard
        icon={Thermometer}
        label="Engine Temp"
        value={Math.round(engineTemp)}
        unit="°C"
        percentage={(engineTemp / 130) * 100}
        color={tempColor}
      />
    </div>
  );
}
