import { LightbulbIcon } from "@phosphor-icons/react";

/**
 * Where each zone sits on the cabin plan, in percent of the stage. The car
 * points up and is left-hand drive, so the driver's footwell is front-left.
 * Overhead lamps sit at the windscreen header and above the rear bench;
 * footwells sit ahead of the seat they light.
 */
export const LIGHT_ZONES = [
  { id: "front_left_overhead", label: "Front-left overhead", x: 40, y: 27 },
  { id: "front_right_overhead", label: "Front-right overhead", x: 60, y: 27 },
  { id: "driver_leg", label: "Driver footwell", x: 37, y: 38 },
  { id: "front_passenger_leg", label: "Passenger footwell", x: 63, y: 38 },
  { id: "rear_left_leg", label: "Rear-left footwell", x: 37, y: 63 },
  { id: "rear_right_leg", label: "Rear-right footwell", x: 63, y: 63 },
  { id: "rear_overhead", label: "Rear overhead", x: 50, y: 74 },
];

/** Presets a driver picks from; the last swatch opens a free colour picker. */
const PRESETS = [
  ["#ffffff", "White"],
  ["#ffd9a8", "Warm white"],
  ["#88bdf2", "Sky"],
  ["#5ee0d0", "Teal"],
  ["#7fe08a", "Green"],
  ["#b58cff", "Violet"],
  ["#ff7ac6", "Magenta"],
  ["#ff9f5a", "Amber"],
];

/** A top-down cabin in the cockpit's own tokens, so it follows day and night. */
function CabinPlan() {
  return (
    <svg className="ambient-cabin" viewBox="0 0 200 320" aria-hidden="true">
      {/* Body */}
      <rect className="ambient-body" x="38" y="8" width="124" height="304" rx="48" />
      {/* Glass: windscreen and rear window */}
      <path className="ambient-glass" d="M56 78 Q100 58 144 78 L136 100 Q100 88 64 100 Z" />
      <path className="ambient-glass" d="M62 262 Q100 272 138 262 L144 282 Q100 296 56 282 Z" />
      {/* Dashboard */}
      <rect className="ambient-trim" x="54" y="102" width="92" height="10" rx="4" />
      {/* Front seats */}
      <rect className="ambient-seat" x="56" y="132" width="36" height="46" rx="10" />
      <rect className="ambient-seat" x="108" y="132" width="36" height="46" rx="10" />
      {/* Centre console */}
      <rect className="ambient-trim" x="95" y="120" width="10" height="64" rx="4" />
      {/* Rear bench */}
      <rect className="ambient-seat" x="56" y="214" width="88" height="40" rx="12" />
    </svg>
  );
}

export default function AmbientLighting({ interior, selected, onSelect, onChange, onApplyToAll }) {
  const zone = LIGHT_ZONES.find((z) => z.id === selected) ?? LIGHT_ZONES[0];
  const current = interior[zone.id];
  const isPreset = PRESETS.some(([hex]) => hex === current.color.toLowerCase());
  const litCount = LIGHT_ZONES.filter((z) => interior[z.id].enabled).length;

  return (
    <div className="ambient">
      <div className="ambient-stage">
        <CabinPlan />

        {/* The light itself: each lit zone washes its colour over the cabin,
            as strong as its brightness, so the plan reads as a preview rather
            than a diagram. */}
        {LIGHT_ZONES.map(({ id, x, y }) => {
          const { enabled, color, brightness } = interior[id];
          return (
            <span
              key={`glow-${id}`}
              className={`ambient-glow ${enabled ? "on" : ""}`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                "--zone-color": color,
                "--zone-strength": enabled ? brightness / 100 : 0,
              }}
              aria-hidden="true"
            />
          );
        })}

        {LIGHT_ZONES.map(({ id, label, x, y }) => {
          const { enabled, color } = interior[id];
          return (
            <button
              key={id}
              type="button"
              className={`ambient-spot ${enabled ? "on" : ""} ${selected === id ? "selected" : ""}`}
              style={{ left: `${x}%`, top: `${y}%`, "--zone-color": color }}
              aria-label={`${label}, ${enabled ? "on" : "off"}`}
              aria-pressed={selected === id}
              title={label}
              onClick={() => onSelect(id)}
            />
          );
        })}

        <span className="ambient-count">
          {litCount} of {LIGHT_ZONES.length} lit
        </span>
      </div>

      <div className="ambient-controls">
        <div className="ambient-head">
          <LightbulbIcon size={16} className="ambient-head-icon" aria-hidden="true" />
          <h3>{zone.label}</h3>
          <button
            type="button"
            className={`ambient-toggle ${current.enabled ? "on" : ""}`}
            aria-pressed={current.enabled}
            onClick={() => onChange(zone.id, "enabled", !current.enabled)}
          >
            {current.enabled ? "On" : "Off"}
          </button>
        </div>

        <div className="ambient-field">
          <span className="ambient-label">Colour</span>
          <div className="ambient-swatches" role="radiogroup" aria-label="Colour">
            {PRESETS.map(([hex, name]) => (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={current.color.toLowerCase() === hex}
                aria-label={name}
                title={name}
                className="ambient-swatch"
                style={{ "--swatch": hex }}
                onClick={() => onChange(zone.id, "color", hex)}
              />
            ))}
            <label
              className={`ambient-swatch ambient-swatch-custom ${isPreset ? "" : "custom-active"}`}
              style={isPreset ? undefined : { "--swatch": current.color }}
              title="Custom colour"
            >
              <input
                type="color"
                value={current.color}
                aria-label="Custom colour"
                onChange={(event) => onChange(zone.id, "color", event.target.value)}
              />
            </label>
          </div>
        </div>

        <label className="ambient-field">
          <span className="ambient-label">
            Brightness
            <span className="ambient-value">{current.brightness}%</span>
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={current.brightness}
            onChange={(event) => onChange(zone.id, "brightness", Number(event.target.value))}
          />
        </label>

        <button type="button" className="btn btn-secondary ambient-apply" onClick={onApplyToAll}>
          Use this colour and brightness everywhere
        </button>
      </div>
    </div>
  );
}
