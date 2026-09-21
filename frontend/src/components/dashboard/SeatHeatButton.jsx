import { Flame } from "lucide-react";
import { useAppStore, CLIMATE_LIMITS } from "../../store";
import { SeatSideIcon } from "./CarIcons";

const LEVELS = Array.from({ length: CLIMATE_LIMITS.SEAT_HEAT_MAX }, (_, i) => i + 1);

/**
 * Seat heating for one seat.
 *
 * Two things have to be readable without stopping to think: which seat this
 * is, and how hot it is set. The pictogram answers the first by filling the
 * cushion this button controls; the flames answer the second by count, so the
 * level is legible without reading a numeral.
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
      <SeatSideIcon side={side} size={17} />
      <span className="dock-seat-flames" aria-hidden="true">
        {LEVELS.map((step) => (
          <Flame key={step} size={9} className={step <= level ? "lit" : ""} />
        ))}
      </span>
    </button>
  );
}
