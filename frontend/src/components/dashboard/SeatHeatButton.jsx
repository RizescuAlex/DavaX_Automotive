import { useAppStore, CLIMATE_LIMITS } from "../../store";
import { SeatSideIcon } from "./CarIcons";
import { DOCK_ICON } from "../../config/constants";
import LevelMeter from "./LevelMeter";

/**
 * Seat heating for one seat: the icon shows which seat, the meter shows the
 * level (0–3).
 */
export default function SeatHeatButton({ side }) {
  const level = useAppStore((s) => (side === "left" ? s.seatHeatLeft : s.seatHeatRight));
  const cycleSeatHeat = useAppStore((s) => s.cycleSeatHeat);

  const seat = side === "left" ? "Driver" : "Passenger";
  const state = level === 0 ? "off" : `level ${level} of ${CLIMATE_LIMITS.SEAT_HEAT_MAX}`;

  return (
    <button
      type="button"
      className={`dock-seat ${level > 0 ? "on" : ""}`}
      aria-label={`${seat} seat heating, ${state}. Tap to change.`}
      title={`${seat} seat heating`}
      onClick={() => cycleSeatHeat(side)}
    >
      <SeatSideIcon side={side} size={DOCK_ICON} />
      <LevelMeter level={level} max={CLIMATE_LIMITS.SEAT_HEAT_MAX} />
      <span className="dock-label" aria-hidden="true">{side === "left" ? "Driver" : "Pass."}</span>
    </button>
  );
}
