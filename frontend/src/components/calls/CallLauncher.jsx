import { useEffect, useRef, useState } from "react";
import { placeCall } from "../../services/calls";

/**
 * @param {() => void} [onCalled]  runs once the call is placed, so the panel
 *                                 around this can step aside for the call dialog
 */
export default function CallLauncher({ onCalled }) {
  const [username, setUsername] = useState("");
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      await placeCall(username);
      setMessage("Calling...");
      setUsername("");
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
        type="text"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        placeholder="@username"
        aria-label="Username of the person to call"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
      />
      <button className="call-launcher-button" type="submit" disabled={loading}>
        {loading ? "Calling..." : "Call user"}
      </button>
      {message && <small className="call-launcher-message">{message}</small>}
    </form>
  );
}
