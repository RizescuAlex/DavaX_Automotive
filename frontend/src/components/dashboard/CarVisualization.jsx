import { useAppStore } from "../../store";

export default function CarVisualization() {
  const headlightsOn = useAppStore((s) => s.headlightsOn);
  const leftSignal = useAppStore((s) => s.leftSignal);
  const rightSignal = useAppStore((s) => s.rightSignal);
  const speed = useAppStore((s) => s.speed);

  return (
    <div className="car-viz">
      <h3 className="car-viz-title">Vehicle Status</h3>
      <div className="car-viz-container">
        <svg
          viewBox="0 0 200 400"
          className="car-svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Car body */}
          <rect
            x="40" y="60" width="120" height="280"
            rx="30" ry="40"
            className="car-body"
          />

          {/* Windshield */}
          <rect
            x="55" y="100" width="90" height="60"
            rx="10" ry="8"
            className="car-windshield"
          />

          {/* Rear window */}
          <rect
            x="55" y="260" width="90" height="50"
            rx="10" ry="8"
            className="car-windshield"
          />

          {/* Left wheels */}
          <rect x="28" y="95" width="16" height="45" rx="6" className="car-wheel" />
          <rect x="28" y="265" width="16" height="45" rx="6" className="car-wheel" />

          {/* Right wheels */}
          <rect x="156" y="95" width="16" height="45" rx="6" className="car-wheel" />
          <rect x="156" y="265" width="16" height="45" rx="6" className="car-wheel" />

          {/* Headlights */}
          <ellipse
            cx="65" cy="68" rx="12" ry="8"
            className={`car-headlight ${headlightsOn ? "on" : ""}`}
          />
          <ellipse
            cx="135" cy="68" rx="12" ry="8"
            className={`car-headlight ${headlightsOn ? "on" : ""}`}
          />

          {/* Headlight beams */}
          {headlightsOn && (
            <>
              <ellipse cx="65" cy="38" rx="18" ry="20" className="car-headlight-beam" />
              <ellipse cx="135" cy="38" rx="18" ry="20" className="car-headlight-beam" />
            </>
          )}

          {/* Tail lights */}
          <ellipse cx="65" cy="332" rx="10" ry="6" className="car-taillight" />
          <ellipse cx="135" cy="332" rx="10" ry="6" className="car-taillight" />

          {/* Left turn signal */}
          <rect
            x="38" y="70" width="6" height="16" rx="3"
            className={`car-signal ${leftSignal ? "blink" : ""}`}
          />
          <rect
            x="38" y="320" width="6" height="16" rx="3"
            className={`car-signal ${leftSignal ? "blink" : ""}`}
          />

          {/* Right turn signal */}
          <rect
            x="156" y="70" width="6" height="16" rx="3"
            className={`car-signal ${rightSignal ? "blink" : ""}`}
          />
          <rect
            x="156" y="320" width="6" height="16" rx="3"
            className={`car-signal ${rightSignal ? "blink" : ""}`}
          />

          {/* Door lines */}
          <line x1="40" y1="150" x2="40" y2="250" className="car-door-line" />
          <line x1="160" y1="150" x2="160" y2="250" className="car-door-line" />

          {/* Side mirrors */}
          <ellipse cx="30" cy="130" rx="8" ry="5" className="car-mirror" />
          <ellipse cx="170" cy="130" rx="8" ry="5" className="car-mirror" />
        </svg>

        {/* Speed overlay */}
        <div className="car-viz-speed">
          <span className="car-viz-speed-value">{Math.round(speed)}</span>
          <span className="car-viz-speed-unit">km/h</span>
        </div>
      </div>

      {/* Control toggles */}
      <div className="car-controls">
        <CarControl
          label="Headlights"
          active={headlightsOn}
          onClick={() => useAppStore.getState().toggleHeadlights()}
        />
        <CarControl
          label="Left Signal"
          active={leftSignal}
          onClick={() => useAppStore.getState().toggleLeftSignal()}
        />
        <CarControl
          label="Right Signal"
          active={rightSignal}
          onClick={() => useAppStore.getState().toggleRightSignal()}
        />
      </div>
    </div>
  );
}

function CarControl({ label, active, onClick }) {
  return (
    <button
      className={`car-control-btn ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
