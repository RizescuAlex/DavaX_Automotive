import { ArrowBendUpLeftIcon, ArrowBendUpRightIcon, HeadlightsIcon } from "@phosphor-icons/react";
import { useAppStore } from "../../store";
import carIso from "../../assets/car-iso.svg";
import { FrontFogIcon, RearFogIcon } from "./CarIcons";

/**
 * Speed, telltales and the car on its street scene. The car is a fixed 3/4
 * view, so turn signals are shown by the telltales.
 */
export default function CarVisualization() {
  const headlightsOn = useAppStore((s) => s.headlightsOn);
  const leftSignal = useAppStore((s) => s.leftSignal);
  const rightSignal = useAppStore((s) => s.rightSignal);
  const automaticTurnSignal = useAppStore((s) => s.automaticTurnSignal);
  const hazardsOn = useAppStore((s) => s.hazardsOn);
  const speed = useAppStore((s) => s.speed);
  const { headlights, rear_lights: rearLights } = useAppStore((s) => s.exteriorLights);
  const headlightsAuto = useAppStore(
    (s) => s.exteriorLights.headlights.automatic && s.headlightsOverride === null
  );

  // An automatic (route) signal takes priority over the manual ones while
  // active.
  const leftBlinking = automaticTurnSignal
    ? automaticTurnSignal === "left"
    : leftSignal || hazardsOn;
  const rightBlinking = automaticTurnSignal
    ? automaticTurnSignal === "right"
    : rightSignal || hazardsOn;

  // Headlight pool scales with brightness; daytime running lights give a faint
  // one.
  const drlOnly = !headlightsOn && headlights.daytime_running;
  const glowStrength = headlightsOn ? headlights.brightness / 100 : drlOnly ? 0.3 : 0;

  return (
    <div className="car-viz">
      <div className="car-readout">
        <span className="car-speed-num">{Math.round(speed)}</span>
        <span className="car-speed-label">km/h</span>
      </div>

      <div className="car-lamps">
        <span
          className={`car-lamp ${leftBlinking ? "blink" : ""}`}
          role="img"
          aria-label={leftBlinking ? "Left turn signal active" : "Left turn signal inactive"}
          title={leftBlinking ? "Left turn signal active" : "Left signal"}
        >
          <ArrowBendUpLeftIcon size={16} weight={leftBlinking ? "fill" : "regular"} aria-hidden="true" />
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
          <HeadlightsIcon size={16} weight={headlightsOn ? "fill" : "regular"} aria-hidden="true" />
          {headlightsAuto && <span className="car-lamp-auto" aria-hidden="true">A</span>}
        </span>
        {rearLights.rear_fog_lights && (
          <span className="car-lamp fog rear" title="Rear fog light on">
            <RearFogIcon size={16} />
          </span>
        )}
        <span
          className={`car-lamp ${rightBlinking ? "blink" : ""}`}
          role="img"
          aria-label={rightBlinking ? "Right turn signal active" : "Right turn signal inactive"}
          title={rightBlinking ? "Right turn signal active" : "Right signal"}
        >
          <ArrowBendUpRightIcon size={16} weight={rightBlinking ? "fill" : "regular"} aria-hidden="true" />
        </span>
      </div>

      <div className="car-viz-stage">
        <div
          className="car-glow"
          style={{ opacity: glowStrength }}
          aria-hidden="true"
        />
        <div className="car-shadow" aria-hidden="true" />
        <img src={carIso} alt="Your vehicle" className="car-photo" />
      </div>
    </div>
  );
}
