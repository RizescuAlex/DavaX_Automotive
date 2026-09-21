import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { LogOut, Sun, Cloud, CloudRain, User, Moon, Settings } from "lucide-react";
import { APP_NAME } from "../../config/constants";
import { useAppStore } from "../../store";

/**
 * Day/night switch.
 *
 * Labelled by the mode it switches TO, since that is the question the driver
 * is actually asking — the icon shows the destination, not the current state.
 */
function ThemeToggle() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const goingToDark = theme === "light";

  return (
    <button
      type="button"
      id="theme-toggle-btn"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={goingToDark ? "Switch to night mode" : "Switch to day mode"}
      title={goingToDark ? "Night mode" : "Day mode"}
    >
      {goingToDark ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
    </button>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function WeatherBadge() {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_OPENWEATHERMAP_API_KEY;
    if (!apiKey || apiKey === "dev_test_key_replace_me") return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const resp = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${apiKey}`
          );
          if (resp.ok) {
            const data = await resp.json();
            setWeather({
              temp: Math.round(data.main.temp),
              desc: data.weather[0]?.main || "Clear",
            });
          }
        } catch {
          /* silent fail — weather is cosmetic */
        }
      },
      () => { /* geolocation denied — skip weather */ }
    );
  }, []);

  if (!weather) return null;

  const Icon =
    weather.desc === "Rain" ? CloudRain
    : weather.desc === "Clouds" ? Cloud
    : Sun;

  return (
    <div className="weather-badge">
      <Icon size={16} />
      <span>{weather.temp}°C</span>
    </div>
  );
}

export default function TopBar({ user, onLogout }) {
  const displayName = user?.displayName || user?.display_name || user?.email?.split("@")[0] || "Driver";

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <div className="top-bar-logo">
          {APP_NAME}<span>.</span>
        </div>
        <div className="top-bar-greeting">
          {getGreeting()}, <strong>{displayName}</strong>
        </div>
      </div>
      <div className="top-bar-right">
        <Link to="/vehicle-settings" className="btn btn-secondary btn-sm">
          <Settings size={14} />
           Vehicle Preferences
        </Link>
        <WeatherBadge />
        <ThemeToggle />
        <div className="top-bar-user">
          <div className="avatar">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="avatar-img" />
            ) : (
              <User size={18} />
            )}
          </div>
          <button
            id="sign-out-btn"
            className="btn btn-secondary btn-sm"
            onClick={onLogout}
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
