export default function IncomingCallModal({ call, isIncoming, loading, onRespond, onEnd }) {
  if (!call) return null;

  const caller = call.caller_name || "DavaX user";

  return (
    <div style={styles.backdrop} role="dialog" aria-modal="true" aria-label="Call dialog">
      <div style={styles.card}>
        <div style={styles.icon}>☎</div>
        <h2>{isIncoming ? "Incoming call" : "Calling..."}</h2>
        <p>{isIncoming ? caller : call.callee_name || "DavaX user"}</p>

        {isIncoming && call.status === "ringing" ? (
          <div style={styles.actions}>
            <button type="button" disabled={loading} onClick={() => onRespond("accept")}>
              Accept
            </button>
            <button type="button" disabled={loading} onClick={() => onRespond("decline")}>
              Decline
            </button>
          </div>
        ) : (
          <button type="button" disabled={loading} onClick={onEnd}>
            End call
          </button>
        )}

        <small>Thumbs up accepts; thumbs down declines.</small>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "grid",
    placeItems: "center",
    background: "rgba(0, 0, 0, 0.65)",
  },
  card: {
    minWidth: 280,
    padding: "2rem",
    textAlign: "center",
    borderRadius: 16,
    background: "var(--surface-primary, #1b1f2a)",
    color: "var(--text-primary, white)",
  },
  icon: { fontSize: "2.5rem" },
  actions: { display: "flex", justifyContent: "center", gap: "1rem", margin: "1.5rem 0" },
};
