import { useRef } from "react";
import { PhoneIcon, XIcon } from "@phosphor-icons/react";
import { useAppStore } from "../../store";
import { usePanelFocus } from "../../hooks/usePanelFocus";
import CallLauncher from "./CallLauncher";
import "../vehicle-settings/VehiclePreferencesPanel.css";

/** Call panel. Closes once the call is placed; the call dialog takes over. */
export default function CallPanel() {
  const open = useAppStore((s) => s.callOpen);
  const setCallOpen = useAppStore((s) => s.setCallOpen);

  if (!open) return null;
  return <CallContent close={() => setCallOpen(false)} />;
}

function CallContent({ close }) {
  // Focus in on open, Escape to close, focus back to the opener.
  const panelRef = useRef(null);
  usePanelFocus(panelRef, close);

  return (
    <section ref={panelRef} tabIndex={-1} className="prefs-panel call-panel" aria-label="Call">
      <header className="prefs-head">
        <PhoneIcon size={16} className="prefs-head-icon" aria-hidden="true" />
        <h2 className="prefs-head-title">Call</h2>
        <button
          type="button"
          className="prefs-close"
          onClick={close}
          aria-label="Close the call panel"
        >
          <XIcon size={18} />
        </button>
      </header>

      <div className="call-panel-body">
        <p className="call-panel-hint">
          Call a driver from your contacts by their username. They have to be
          signed in to answer.
        </p>
        <CallLauncher onCalled={close} />
      </div>
    </section>
  );
}
