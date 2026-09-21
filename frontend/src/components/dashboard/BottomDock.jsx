import { useState, useEffect } from "react";
import { Wifi, Lightbulb, CornerUpLeft, CornerUpRight, Car } from "lucide-react";
import { useAppStore } from "../../store";

/**
 * Persistent dock. Mirrors the reference layout's always-available strip, but
 * every button here drives real vehicle state rather than standing in for
 * hardware this app cannot reach.
 */
export default function BottomDock() {
  const [now, setNow] = useState(new Date());
  const {
    headlightsOn, toggleHeadlights,
    leftSignal, toggleLeftSignal,
    rightSignal, toggleRightSignal,
    speed,
  } = useAppStore();

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  return (
    <footer className="dock">
      <div className="dock-section dock-left">
        <span className="dock-badge">
          <Car size={16} aria-hidden="true" />
          {Math.round(speed)} <small>km/h</small>
        </span>
        <span className="dock-status">
          <Wifi size={13} aria-hidden="true" />
          Connected
        </span>
      </div>

      <div className="dock-section dock-center">
        <button
          type="button"
          className={`dock-btn ${headlightsOn ? "on" : ""}`}
          aria-pressed={headlightsOn}
          aria-label="Headlights"
          onClick={toggleHeadlights}
        >
          <Lightbulb size={18} />
        </button>
        <button
          type="button"
          className={`dock-btn ${leftSignal ? "on" : ""}`}
          aria-pressed={leftSignal}
          aria-label="Left signal"
          onClick={toggleLeftSignal}
        >
          <CornerUpLeft size={18} />
        </button>
        <button
          type="button"
          className={`dock-btn ${rightSignal ? "on" : ""}`}
          aria-pressed={rightSignal}
          aria-label="Right signal"
          onClick={toggleRightSignal}
        >
          <CornerUpRight size={18} />
        </button>
      </div>

      <div className="dock-section dock-right">
        <span className="dock-date">{date}</span>
        <span className="dock-time">{time}</span>
      </div>
    </footer>
  );
}
