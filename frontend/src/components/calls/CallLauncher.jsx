import { useState } from "react";
import { createCall } from "../../services/calls";
import { startCallRingtone } from "../../services/callSounds";
import { useAppStore } from "../../store";

export default function CallLauncher() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const setCall = useAppStore((state) => state.setCall);

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
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="call-launcher" onSubmit={handleSubmit}>
      <input
        className="call-launcher-input"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Connected user's email"
        required
      />
      <button className="call-launcher-button" type="submit" disabled={loading}>
        {loading ? "Calling..." : "Call user"}
      </button>
      {message && <small className="call-launcher-message">{message}</small>}
    </form>
  );
}
