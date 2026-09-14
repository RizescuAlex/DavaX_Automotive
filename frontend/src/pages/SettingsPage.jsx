import { ChevronRight, Gauge, Moon, ShieldCheck } from "lucide-react";
export default function SettingsPage({ gesturesEnabled, onToggleGestures }) {
  return (
    <aside className="app-panel settings-panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">System preferences</p>
          <h1>Settings</h1>
        </div>
      </div>
      <div className="settings-list">
        <div className="settings-row">
          <div className="settings-icon">
            <Gauge size={18} />
          </div>
          <div>
            <strong>Display brightness</strong>
            <span>Auto · low glare</span>
          </div>
          <ChevronRight size={17} />
        </div>
        <div className="settings-row">
          <div className="settings-icon">
            <Moon size={18} />
          </div>
          <div>
            <strong>Night mode</strong>
            <span>Always on</span>
          </div>
          <span className="setting-value">On</span>
        </div>
        <div className="settings-row settings-row--toggle">
          <div className="settings-icon">
            <ShieldCheck size={18} />
          </div>
          <div>
            <strong>Gesture controls</strong>
            <span>Steering wheel &amp; air gestures</span>
          </div>
          <button
            className={`toggle ${gesturesEnabled ? "is-on" : ""}`}
            type="button"
            role="switch"
            aria-checked={gesturesEnabled}
            onClick={onToggleGestures}
          >
            <span />
          </button>
        </div>
      </div>
      <p className="panel-note">
        Computer vision is not connected in this prototype.
      </p>
    </aside>
  );
}
