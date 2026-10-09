import { useEffect, useRef } from "react";
import { FanIcon, MinusIcon, PlusIcon, SnowflakeIcon } from "@phosphor-icons/react";
import { useAppStore, CLIMATE_LIMITS } from "../../store";

const FAN_STEPS = Array.from({ length: CLIMATE_LIMITS.FAN_MAX }, (_, i) => i + 1);

/**
 * Climate pop-up, opened from the dock temperature: fan speed and auto mode.
 * Adjusting the fan leaves auto mode, so no control is ever disabled.
 */
export default function ClimatePanel({ onClose }) {
  const targetTemp = useAppStore((s) => s.targetTemp);
  const cabinTemp = useAppStore((s) => s.cabinTemp);
  const fanSpeed = useAppStore((s) => s.fanSpeed);
  const autoMode = useAppStore((s) => s.autoMode);

  const adjustFanSpeed = useAppStore((s) => s.adjustFanSpeed);
  const toggleAutoMode = useAppStore((s) => s.toggleAutoMode);

  const panelRef = useRef(null);

  // Close on Escape or a click outside. pointerdown so it closes before the
  // control underneath reacts.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    const onDown = (e) => {
      if (!panelRef.current?.contains(e.target) && !e.target.closest(".dock-climate")) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  return (
    <div className="climate-panel" ref={panelRef} role="dialog" aria-label="Climate">
      <header className="climate-head">
        <SnowflakeIcon size={15} className="climate-head-icon" aria-hidden="true" />
        <h3 className="climate-head-title">Climate</h3>
        <button
          type="button"
          className={`climate-auto ${autoMode ? "on" : ""}`}
          aria-pressed={autoMode}
          onClick={toggleAutoMode}
        >
          Auto
        </button>
      </header>

      <p className="climate-cabin">
        Cabin now <strong>{cabinTemp.toFixed(1)}&deg;</strong>, set to{" "}
        <strong>{targetTemp.toFixed(1)}&deg;</strong>
      </p>

      <div className="climate-fan">
        <span className="climate-fan-label">
          <FanIcon size={13} aria-hidden="true" />
          Fan
        </span>
        <div className="climate-fan-row">
          <button
            type="button"
            className="climate-step"
            aria-label="Decrease fan speed"
            onClick={() => adjustFanSpeed(-1)}
          >
            <MinusIcon size={15} aria-hidden="true" />
          </button>

          <span
            className="climate-fan-bars"
            role="img"
            aria-label={`Fan speed ${fanSpeed} of ${CLIMATE_LIMITS.FAN_MAX}`}
          >
            {FAN_STEPS.map((level) => (
              <span key={level} className={`climate-fan-bar ${level <= fanSpeed ? "on" : ""}`} />
            ))}
          </span>

          <button
            type="button"
            className="climate-step"
            aria-label="Increase fan speed"
            onClick={() => adjustFanSpeed(1)}
          >
            <PlusIcon size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
