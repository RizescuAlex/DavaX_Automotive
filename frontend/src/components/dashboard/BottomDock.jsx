import { useState, useEffect } from "react";
import { ArrowBendUpLeftIcon, ArrowBendUpRightIcon, HeadlightsIcon, MinusIcon, PlusIcon, SnowflakeIcon, WifiHighIcon } from "@phosphor-icons/react";
import { useAppStore, CLIMATE_LIMITS } from "../../store";
import { DOCK_ICON } from "../../config/constants";
import ClimatePanel from "./ClimatePanel";
import SeatHeatButton from "./SeatHeatButton";
import { FrontDefogIcon, HazardIcon, RearDefogIcon, WiperIcon } from "./CarIcons";

/**
 * Persistent control strip, in four groups: lights and signals, visibility,
 * comfort, temperature. Grouping is what lets a driver find a control by
 * position; the word under each icon is what confirms it without guessing
 * at a glyph. Speed is not repeated here: the rail already leads with it.
 *
 * Every button drives real state rather than standing in for hardware this app
 * cannot reach. Lights, signals and wipers are live simulation and are not
 * remembered between sessions; seat heat, A/C level, the defoggers and the
 * temperature persist to climate_settings.
 *
 * The temperature doubles as the opener for the climate panel, which holds the
 * settings you adjust once — fan and auto — so the strip carries only what you
 * reach for while moving.
 */
export default function BottomDock() {
  const [now, setNow] = useState(new Date());
  const [climateOpen, setClimateOpen] = useState(false);

  const headlightsOn = useAppStore((s) => s.headlightsOn);
  const headlightsAuto = useAppStore(
    (s) => s.exteriorLights.headlights.automatic && s.headlightsOverride === null
  );
  const leftSignal = useAppStore((s) => s.leftSignal);
  const rightSignal = useAppStore((s) => s.rightSignal);
  const hazardsOn = useAppStore((s) => s.hazardsOn);
  const wipersOn = useAppStore((s) => s.wipersOn);
  const targetTemp = useAppStore((s) => s.targetTemp);
  const acLevel = useAppStore((s) => s.acLevel);
  const frontDefrost = useAppStore((s) => s.frontDefrost);
  const rearDefrost = useAppStore((s) => s.rearDefrost);

  const toggleHeadlights = useAppStore((s) => s.toggleHeadlights);
  const toggleLeftSignal = useAppStore((s) => s.toggleLeftSignal);
  const toggleRightSignal = useAppStore((s) => s.toggleRightSignal);
  const toggleHazards = useAppStore((s) => s.toggleHazards);
  const toggleWipers = useAppStore((s) => s.toggleWipers);
  const adjustTargetTemp = useAppStore((s) => s.adjustTargetTemp);
  const cycleAcLevel = useAppStore((s) => s.cycleAcLevel);
  const toggleFrontDefrost = useAppStore((s) => s.toggleFrontDefrost);
  const toggleRearDefrost = useAppStore((s) => s.toggleRearDefrost);
  const loadVehicleSettings = useAppStore((s) => s.loadVehicleSettings);

  useEffect(() => {
    loadVehicleSettings();
  }, [loadVehicleSettings]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  return (
    <footer className="dock">
      <div className="dock-section dock-left">
        <span className="dock-status">
          <WifiHighIcon size={13} aria-hidden="true" />
          Connected
        </span>
      </div>

      <div className="dock-section dock-center">
        {/* Lighting and signals — live vehicle state */}
        <div className="dock-group" role="group" aria-label="Lights and signals">
          <button
            type="button"
            className={`dock-btn ${headlightsOn ? "on" : ""}`}
            aria-pressed={headlightsOn}
            aria-label={`Headlights${headlightsAuto ? ", automatic" : ""}`}
            title={headlightsAuto ? "Headlights (automatic)" : "Headlights"}
            onClick={toggleHeadlights}
          >
            <HeadlightsIcon size={DOCK_ICON} weight={headlightsOn ? "fill" : "regular"} />
            <span className="dock-label" aria-hidden="true">{headlightsAuto ? "Auto" : "Lights"}</span>
          </button>
          <button
            type="button"
            className={`dock-btn ${hazardsOn ? "alert" : ""}`}
            aria-pressed={hazardsOn}
            aria-label="Hazard lights"
            title="Hazard lights"
            onClick={toggleHazards}
          >
            <HazardIcon size={DOCK_ICON} />
            <span className="dock-label" aria-hidden="true">Hazard</span>
          </button>
          <button
            type="button"
            className={`dock-btn ${leftSignal ? "on" : ""}`}
            aria-pressed={leftSignal}
            aria-label="Manual left signal"
            title="Manual left signal"
            onClick={toggleLeftSignal}
          >
            <ArrowBendUpLeftIcon size={DOCK_ICON} weight={leftSignal ? "fill" : "regular"} />
            <span className="dock-label" aria-hidden="true">Left</span>
          </button>
          <button
            type="button"
            className={`dock-btn ${rightSignal ? "on" : ""}`}
            aria-pressed={rightSignal}
            aria-label="Manual right signal"
            title="Manual right signal"
            onClick={toggleRightSignal}
          >
            <ArrowBendUpRightIcon size={DOCK_ICON} weight={rightSignal ? "fill" : "regular"} />
            <span className="dock-label" aria-hidden="true">Right</span>
          </button>
        </div>

        {/* Visibility — wipers are live state, defoggers persist */}
        <div className="dock-group" role="group" aria-label="Visibility">
          <button
            type="button"
            className={`dock-btn ${wipersOn ? "on" : ""}`}
            aria-pressed={wipersOn}
            aria-label="Windscreen wipers"
            title="Windscreen wipers"
            onClick={toggleWipers}
          >
            <WiperIcon size={DOCK_ICON} />
            <span className="dock-label" aria-hidden="true">Wipers</span>
          </button>
          <button
            type="button"
            className={`dock-btn ${frontDefrost ? "on" : ""}`}
            aria-pressed={frontDefrost}
            aria-label="Front windscreen defogger"
            title="Front defogger"
            onClick={toggleFrontDefrost}
          >
            <FrontDefogIcon size={DOCK_ICON} />
            <span className="dock-label" aria-hidden="true">Front</span>
          </button>
          <button
            type="button"
            className={`dock-btn ${rearDefrost ? "on" : ""}`}
            aria-pressed={rearDefrost}
            aria-label="Rear window defogger"
            title="Rear defogger"
            onClick={toggleRearDefrost}
          >
            <RearDefogIcon size={DOCK_ICON} />
            <span className="dock-label" aria-hidden="true">Rear</span>
          </button>
        </div>

        {/* Comfort — persists to climate_settings */}
        <div className="dock-group" role="group" aria-label="Comfort">
          <SeatHeatButton side="left" />
          <SeatHeatButton side="right" />
          <button
            type="button"
            className={`dock-btn ac ${acLevel > 0 ? "on" : ""}`}
            aria-label={`Air conditioning, ${acLevel === 0 ? "off" : `level ${acLevel} of ${CLIMATE_LIMITS.AC_MAX}`}. Tap to change.`}
            title="Air conditioning"
            onClick={cycleAcLevel}
          >
            <SnowflakeIcon size={DOCK_ICON} weight={acLevel > 0 ? "fill" : "regular"} />
            <span className="dock-ac-bars" aria-hidden="true">
              {[1, 2, 3].map((step) => (
                <span key={step} className={step <= acLevel ? "lit" : ""} />
              ))}
            </span>
          </button>
        </div>

        {/* Temperature, and the way into the rest of climate */}
        <div className="dock-climate">
          <button
            type="button"
            className="dock-btn"
            aria-label="Decrease target temperature"
            onClick={() => adjustTargetTemp(-CLIMATE_LIMITS.TEMP_STEP)}
          >
            <MinusIcon size={DOCK_ICON - 2} />
          </button>
          <button
            type="button"
            className={`dock-temp ${climateOpen ? "open" : ""}`}
            aria-expanded={climateOpen}
            aria-haspopup="dialog"
            title="Climate settings"
            onClick={() => setClimateOpen((open) => !open)}
          >
            {targetTemp.toFixed(1)}<span>&deg;</span>
          </button>
          <button
            type="button"
            className="dock-btn"
            aria-label="Increase target temperature"
            onClick={() => adjustTargetTemp(CLIMATE_LIMITS.TEMP_STEP)}
          >
            <PlusIcon size={DOCK_ICON - 2} />
          </button>

          {climateOpen && <ClimatePanel onClose={() => setClimateOpen(false)} />}
        </div>
      </div>

      <div className="dock-section dock-right">
        <span className="dock-date">{date}</span>
        <span className="dock-time">{time}</span>
      </div>
    </footer>
  );
}
