import { useCallback, useEffect, useRef, useState } from "react";
import { ChatCircleDotsIcon, MicrophoneIcon, PaperPlaneRightIcon, XIcon } from "@phosphor-icons/react";
import { buildContext, sendAssistantMessage } from "../../api/assistant";
import { applyActions } from "../../assistant/dispatch";
import { replyFor } from "../../assistant/describe";
import {
  SPEECH_INPUT_SUPPORTED,
  listenOnce,
  speak,
  stopSpeaking,
} from "../../assistant/voice";
import { useAppStore } from "../../store";
import { usePanelFocus } from "../../hooks/usePanelFocus";

/**
 * The assistant, dropping from the top-right of the map under the top bar.
 *
 * An overlay rather than a column, so the rail's width stays with the car and
 * its gauges. It hangs from the top rather than the bottom because the
 * bottom-right corner belongs to Google's map controls, and the panel covered
 * them; it clears the centred search bar by starting below it.
 *
 * The round trip is: snapshot the store, send it with the message, apply the
 * actions that come back, then say what was done. The context is read before
 * the actions are applied, so the model sees the dashboard as it was when the
 * driver spoke rather than a state mid-change.
 */
export default function AssistantPanel() {
  // Open state lives in the store: the button that opens this sits in the top
  // bar, not here.
  const open = useAppStore((s) => s.assistantOpen);
  const setAssistantOpen = useAppStore((s) => s.setAssistantOpen);

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);

  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const listeningRef = useRef(null);

  // Follow the conversation down as it grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    listeningRef.current?.cancel();
    stopSpeaking();
    setListening(false);
    setAssistantOpen(false);
  };

  // Escape closes, and focus goes back to the opener on close. (The input
  // above takes focus on open, so the hook leaves that alone.)
  usePanelFocus(panelRef, close, open);

  const say = (role, text) => setMessages((prev) => [...prev, { role, text }]);

  /**
   * @param {string}  message
   * @param {boolean} spoken  true when the driver used the microphone, which
   *                          is the only case where the reply is read back —
   *                          somebody typing does not expect to be talked at.
   */
  const send = useCallback(async (message, spoken) => {
    setBusy(true);
    say("user", message);

    try {
      // getState rather than a subscription: this is a one-off read at send
      // time, and subscribing would re-render the panel on every simulated
      // speed tick.
      const context = buildContext(useAppStore.getState());
      const { reply, actions } = await sendAssistantMessage(message, context);

      const failures = await applyActions(actions);

      // The sentence is built from the actions, not the model — an
      // interaction that ends in a tool call comes back with no text at all.
      const spokenReply = replyFor(reply, actions);
      say("assistant", spokenReply);
      if (spoken) speak(spokenReply);

      if (failures.length > 0) {
        // A failed call says why — most often the person is not in the
        // driver's contacts — since "did not go through" alone gives the
        // driver nothing to act on.
        const failedCall = failures.find((failure) => failure.tool === "call_user");
        const trouble = failedCall
          ? `The call did not go through: ${failedCall.error.message}`
          : failures.some((failure) => failure.tool === "control_music")
            ? "The music would not respond — that needs Spotify Premium."
            : "Some of that did not go through.";
        say("assistant", trouble);
        if (spoken) speak(trouble);
      }
    } catch (error) {
      const message = error.message || "The assistant could not be reached.";
      say("assistant", message);
      if (spoken) speak(message);
    } finally {
      setBusy(false);
    }
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    setDraft("");
    send(message, false);
  };

  const talk = async () => {
    if (busy) return;

    // A second press stops it, so the button is never a one-way trip.
    if (listening) {
      listeningRef.current?.cancel();
      return;
    }

    // Anything still being read aloud would be picked straight back up by the
    // microphone, so silence it first.
    stopSpeaking();
    setListening(true);

    try {
      const session = listenOnce();
      listeningRef.current = session;
      const heard = await session.promise;
      if (heard) send(heard, true);
    } catch (error) {
      say("assistant", error.message);
    } finally {
      listeningRef.current = null;
      setListening(false);
    }
  };

  if (!open) return null;

  return (
    <section ref={panelRef} tabIndex={-1} className="assistant-panel" aria-label="Assistant">
      <header className="assistant-head">
        <ChatCircleDotsIcon size={16} className="assistant-head-icon" />
        <h2 className="assistant-head-title">AI Assistant</h2>
        <button
          type="button"
          className="assistant-close"
          onClick={close}
          aria-label="Close the assistant"
        >
          <XIcon size={16} />
        </button>
      </header>

      <div className="assistant-log" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="assistant-hint">
            Try &ldquo;I&rsquo;m cold&rdquo;, &ldquo;turn on the
            headlights&rdquo;, or &ldquo;how much fuel do I have?&rdquo;
          </p>
        )}

        {messages.map((entry, index) => (
          <p
            key={index}
            className={`assistant-line assistant-line-${entry.role}`}
          >
            {entry.text}
          </p>
        ))}

        {listening && (
          <p className="assistant-line assistant-line-busy">Listening…</p>
        )}
        {busy && <p className="assistant-line assistant-line-busy">…</p>}
      </div>

      <form className="assistant-input" onSubmit={submit}>
        {SPEECH_INPUT_SUPPORTED && (
          <button
            type="button"
            className={`assistant-mic ${listening ? "on" : ""}`}
            onClick={talk}
            disabled={busy}
            aria-label={listening ? "Stop listening" : "Speak to the assistant"}
            aria-pressed={listening}
          >
            <MicrophoneIcon size={16} />
          </button>
        )}

        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={listening ? "Listening…" : "Ask the car…"}
          disabled={busy || listening}
          aria-label="Message the assistant"
        />

        <button type="submit" disabled={busy || !draft.trim()} aria-label="Send">
          <PaperPlaneRightIcon size={16} />
        </button>
      </form>
    </section>
  );
}
