import { useState, useEffect } from "react";
import { Wifi } from "lucide-react";

export default function StatusBar() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedTime = time.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const formattedDate = time.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <footer className="status-bar">
      <div className="status-bar-left">
        <div className="status-indicator connected">
          <Wifi size={12} />
          <span>Connected</span>
        </div>
      </div>
      <div className="status-bar-right">
        <span className="status-date">{formattedDate}</span>
        <span className="status-time">{formattedTime}</span>
      </div>
    </footer>
  );
}
