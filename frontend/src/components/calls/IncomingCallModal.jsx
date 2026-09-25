import { Phone, PhoneOff } from "lucide-react";

export default function IncomingCallModal({ call, isIncoming, loading, onRespond, onEnd }) {
  if (!call) return null;

  const contactName = isIncoming
    ? call.caller_name || "DavaX user"
    : call.callee_name || "DavaX user";
  const incomingAndRinging = isIncoming && call.status === "ringing";
  const callIsAccepted = call.status === "accepted";

  return (
    <div className="call-modal-backdrop" role="dialog" aria-modal="true" aria-label="Call dialog">
      <div className="call-modal-card">
        <div className="call-modal-info">
          <div className="call-modal-icon" aria-hidden="true">
            <Phone size={22} strokeWidth={2.5} />
          </div>
          <div className="call-modal-copy">
            <span className="call-modal-label">
              {incomingAndRinging ? "Incoming call" : "Calling"}
            </span>
            <strong>{contactName}</strong>
            <span className="call-modal-status">
              {incomingAndRinging
                ? "DavaX voice call"
                : callIsAccepted
                  ? "Call connected"
                  : "Waiting for answer..."}
            </span>
          </div>
        </div>

        {incomingAndRinging ? (
          <div className="call-modal-actions">
            <button className="call-action-button call-action-decline" type="button" disabled={loading} onClick={() => onRespond("decline")} aria-label="Decline call" title="Decline">
              <PhoneOff size={21} />
            </button>
            <button className="call-action-button call-action-accept" type="button" disabled={loading} onClick={() => onRespond("accept")} aria-label="Accept call" title="Accept">
              <Phone size={21} />
            </button>
          </div>
        ) : (
          <button className="call-action-button call-action-decline" type="button" disabled={loading} onClick={onEnd} aria-label="End call" title="End call">
            <PhoneOff size={21} />
          </button>
        )}

        {incomingAndRinging && <span className="call-modal-hint">Thumbs up to accept · thumbs down to decline</span>}
      </div>
    </div>
  );
}
