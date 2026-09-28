import { useState, useEffect } from "react";
import { Bot, Sun, Cloud, CloudRain, User, Moon, Settings, Phone, Users } from "lucide-react";
import { APP_NAME } from "../../config/constants";
import { useAppStore } from "../../store";

/**
 * Opens the assistant.
 *
 * It lives up here beside Vehicle Preferences rather than floating over the
 * map, where as a round button in the bottom-right corner it sat on top of
 * Google's zoom controls and swallowed the clicks meant for them.
 */
function AssistantButton() {
  const open = useAppStore((s) => s.assistantOpen);
  const toggleAssistant = useAppStore((s) => s.toggleAssistant);

  return (
    <button
      type="button"
      className={`btn btn-secondary btn-sm ${open ? "is-on" : ""}`}
      onClick={toggleAssistant}
      aria-pressed={open}
      aria-label={open ? "Close the AI assistant" : "Open the AI assistant"}
    >
      <Bot size={14} />
      AI Assistant
    </button>
  );
}

/** Opens the Call panel, where a call to another driver starts. */
function CallButton() {
  const open = useAppStore((s) => s.callOpen);
  const toggleCall = useAppStore((s) => s.toggleCall);

  return (
    <button
      type="button"
      className={`btn btn-secondary btn-sm ${open ? "is-on" : ""}`}
      onClick={toggleCall}
      aria-pressed={open}
      aria-label={open ? "Close the call panel" : "Open the call panel"}
    >
      <Phone size={14} />
      Call
    </button>
  );
}

/** Opens Contacts, where drivers are added and called by username. */
function ContactsButton() {
  const open = useAppStore((s) => s.contactsOpen);
  const toggleContacts = useAppStore((s) => s.toggleContacts);

  return (
    <button
      type="button"
      className={`btn btn-secondary btn-sm ${open ? "is-on" : ""}`}
      onClick={toggleContacts}
      aria-pressed={open}
      aria-label={open ? "Close contacts" : "Open contacts"}
    >
      <Users size={14} />
      Contacts
    </button>
  );
}

/**
 * The avatar, doubling as the way into User Settings. A button rather than a
 * picture, so it is reachable by keyboard and says what it does.
 */
function UserSettingsButton({ photoURL }) {
  const open = useAppStore((s) => s.userSettingsOpen);
  const toggleUserSettings = useAppStore((s) => s.toggleUserSettings);

  return (
    <button
      type="button"
      className={`avatar avatar-btn ${open ? "is-on" : ""}`}
      onClick={toggleUserSettings}
      aria-pressed={open}
      aria-label={open ? "Close user settings" : "Open user settings"}
      title="User settings"
    >
      {photoURL ? <img src={photoURL} alt="" className="avatar-img" /> : <User size={18} />}
    </button>
  );
}

/** Opens Vehicle Preferences over the map, the way the assistant opens. */
function PreferencesButton() {
  const open = useAppStore((s) => s.preferencesOpen);
  const togglePreferences = useAppStore((s) => s.togglePreferences);

  return (
    <button
      type="button"
      className={`btn btn-secondary btn-sm ${open ? "is-on" : ""}`}
      onClick={togglePreferences}
      aria-pressed={open}
      aria-label={open ? "Close vehicle preferences" : "Open vehicle preferences"}
    >
      <Settings size={14} />
      Vehicle Preferences
    </button>
  );
}

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

export default function TopBar({ user }) {
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
        <AssistantButton />
        <CallButton />
        <ContactsButton />
        <PreferencesButton />
        <WeatherBadge />
        <ThemeToggle />
        <div className="top-bar-user">
          {/* Sign out lives in the User Settings panel this opens */}
          <UserSettingsButton photoURL={user?.photoURL || user?.avatar_url} />
        </div>
      </div>
    </header>
  );
}
