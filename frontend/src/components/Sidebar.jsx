import { Map, Music, Settings } from "lucide-react";
import { navItems } from "../data/cockpitData";
const icons = { map: Map, music: Music, settings: Settings };
export default function Sidebar({ activeApp, onSelect }) {
  return (
    <nav className="cockpit-sidebar" aria-label="Cockpit apps">
      <div className="cockpit-brand" aria-label="DavaX Cockpit">
        DX
      </div>
      <div className="cockpit-nav-list">
        {navItems.map((item) => {
          const Icon = icons[item.icon];
          const isActive = activeApp === item.id;
          return (
            <button
              className={`cockpit-nav-button ${isActive ? "is-active" : ""}`}
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              aria-label={item.label}
              aria-pressed={isActive}
            >
              <Icon size={21} strokeWidth={1.8} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="cockpit-status-dot" aria-label="System ready" />
    </nav>
  );
}
