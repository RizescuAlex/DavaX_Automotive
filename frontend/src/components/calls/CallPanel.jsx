import { Phone, X } from "lucide-react";
import { useAppStore } from "../../store";
import CallLauncher from "./CallLauncher";
import "../vehicle-settings/VehiclePreferencesPanel.css";

/**
 * Starting a call, as a panel over the map opened from the top bar's Call
 * button — the same family as the assistant and preferences panels.
 *
 * Once the call is placed the panel closes: the call dialog takes over from
 * there, and an open launcher behind it would only invite a second call.
 */
export default function CallPanel() {
  const open = useAppStore((s) => s.callOpen);
  const setCallOpen = useAppStore((s) => s.setCallOpen);

  if (!open) return null;

  const close = () => setCallOpen(false);

  return (
    <section className="prefs-panel call-panel" aria-label="Call">
      <header className="prefs-head">
        <Phone size={16} className="prefs-head-icon" aria-hidden="true" />
        <h2 className="prefs-head-title">Call</h2>
        <button
          type="button"
          className="prefs-close"
          onClick={close}
          aria-label="Close the call panel"
        >
          <X size={18} />
        </button>
      </header>

      <div className="call-panel-body">
        <p className="call-panel-hint">
          Call another DavaX driver who is signed in right now.
        </p>
        <CallLauncher onCalled={close} />
      </div>
    </section>
  );
}
