import { useEffect, useRef, useState } from "react";
import { createCall } from "../../services/calls";
import { startCallRingtone } from "../../services/callSounds";
import { useAppStore } from "../../store";

/**
 * @param {() => void} [onCalled]  runs once the call is placed, so the panel
 *                                 around this can step aside for the call dialog
 */
export default function CallLauncher({ onCalled }) {
  const [email, setEmail] = useState("");
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const setCall = useAppStore((state) => state.setCall);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const call = await createCall(email);
      setCall(call);
      startCallRingtone("ongoing");
      setMessage("Calling...");
      setEmail("");
      onCalled?.();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="call-launcher" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        className="call-launcher-input"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Their email address"
        aria-label="Email address of the person to call"
        required
      />
      <button className="call-launcher-button" type="submit" disabled={loading}>
        {loading ? "Calling..." : "Call user"}
      </button>
      {message && <small className="call-launcher-message">{message}</small>}
    </form>
  );
}
