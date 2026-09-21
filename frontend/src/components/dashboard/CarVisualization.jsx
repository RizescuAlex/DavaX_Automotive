import { Lightbulb, CornerUpLeft, CornerUpRight } from "lucide-react";
import { useAppStore } from "../../store";
import carIso from "../../assets/car-iso.svg";

/**
 * Vehicle status.
 *
 * The illustration is a fixed 3/4 view, so it cannot show left and right
 * indicators the way the old overhead drawing did. The lamps below it carry
 * that state instead, which also keeps the live readouts legible at rail width.
 *
 * The stage is backed by the street scene (see `.car-viz-stage` in index.css),
 * so the contact shadow below is what keeps the car from floating above the
 * asphalt rather than sitting on it.
 */
export default function CarVisualization() {
  const headlightsOn = useAppStore((s) => s.headlightsOn);
  const leftSignal = useAppStore((s) => s.leftSignal);
  const rightSignal = useAppStore((s) => s.rightSignal);
  const speed = useAppStore((s) => s.speed);

  return (
    <div className="car-viz">
      <div className="car-viz-stage">
        <div className={`car-glow ${headlightsOn ? "on" : ""}`} aria-hidden="true" />
        <div className="car-shadow" aria-hidden="true" />
        <img src={carIso} alt="Your vehicle" className="car-photo" />
      </div>

      <div className="car-readout">
        <span className="car-speed-num">{Math.round(speed)}</span>
        <span className="car-speed-label">km/h</span>
      </div>

      <div className="car-lamps">
        <span
          className={`car-lamp ${leftSignal ? "blink" : ""}`}
          title="Left signal"
        >
          <CornerUpLeft size={16} aria-hidden="true" />
        </span>
        <span
          className={`car-lamp ${headlightsOn ? "on" : ""}`}
          title="Headlights"
        >
          <Lightbulb size={16} aria-hidden="true" />
        </span>
        <span
          className={`car-lamp ${rightSignal ? "blink" : ""}`}
          title="Right signal"
        >
          <CornerUpRight size={16} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
