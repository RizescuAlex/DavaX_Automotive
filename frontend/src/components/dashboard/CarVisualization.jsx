import { Lightbulb, CornerUpLeft, CornerUpRight } from "lucide-react";
import { useAppStore } from "../../store";
import carIso from "../../assets/car-iso.svg";
import { FrontFogIcon, RearFogIcon } from "./CarIcons";

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
  const hazardsOn = useAppStore((s) => s.hazardsOn);
  const speed = useAppStore((s) => s.speed);
  const { headlights, rear_lights: rearLights } = useAppStore((s) => s.exteriorLights);
  const headlightsAuto = useAppStore(
    (s) => s.exteriorLights.headlights.automatic && s.headlightsOverride === null
  );

  // Hazards drive both indicators, so each lamp blinks on its own signal or on
  // hazards.
  const leftBlinking = leftSignal || hazardsOn;
  const rightBlinking = rightSignal || hazardsOn;

  // Headlights throw a pool as strong as their brightness setting; with them
  // off, daytime running lights still leave a faint one.
  const drlOnly = !headlightsOn && headlights.daytime_running;
  const glowStrength = headlightsOn ? headlights.brightness / 100 : drlOnly ? 0.3 : 0;

  return (
    <div className="car-viz">
      <div className="car-viz-stage">
        <div
          className="car-glow"
          style={{ opacity: glowStrength }}
          aria-hidden="true"
        />
        <div className="car-shadow" aria-hidden="true" />
        <img src={carIso} alt="Your vehicle" className="car-photo" />
      </div>

      <div className="car-readout">
        <span className="car-speed-num">{Math.round(speed)}</span>
        <span className="car-speed-label">km/h</span>
      </div>

      <div className="car-lamps">
        <span
          className={`car-lamp ${leftBlinking ? "blink" : ""}`}
          title="Left signal"
        >
          <CornerUpLeft size={16} aria-hidden="true" />
        </span>
        {headlights.fog_lights && (
          <span className="car-lamp fog" title="Front fog lights on">
            <FrontFogIcon size={16} />
          </span>
        )}
        <span
          className={`car-lamp ${headlightsOn ? "on" : ""}`}
          title={headlightsAuto ? "Headlights, automatic" : "Headlights"}
        >
          <Lightbulb size={16} aria-hidden="true" />
          {headlightsAuto && <span className="car-lamp-auto" aria-hidden="true">A</span>}
        </span>
        {rearLights.rear_fog_lights && (
          <span className="car-lamp fog rear" title="Rear fog light on">
            <RearFogIcon size={16} />
          </span>
        )}
        <span
          className={`car-lamp ${rightBlinking ? "blink" : ""}`}
          title="Right signal"
        >
          <CornerUpRight size={16} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
