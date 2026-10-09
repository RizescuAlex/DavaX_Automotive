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
 * Assistant panel. Sends the message with a snapshot of the store (taken before
 * any actions run), applies the returned actions, then shows or speaks what was
 * done.
 */
export default function AssistantPanel() {
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

  // Escape to close, focus back to the opener. The input focuses itself on
  // open.
  usePanelFocus(panelRef, close, open);

  const say = (role, text) => setMessages((prev) => [...prev, { role, text }]);

  /**
   * @param {string} message
   * @param {boolean} spoken true when the microphone was used; only then is the
   *   reply read aloud
   */
  const send = useCallback(async (message, spoken) => {
    setBusy(true);
    say("user", message);

    try {
      // getState instead of a subscription, to avoid re-rendering on every
      // simulation tick.
      const context = buildContext(useAppStore.getState());
      const { reply, actions } = await sendAssistantMessage(message, context);

      const failures = await applyActions(actions);

      // Tool calls come back without text, so the reply is built from the
      // actions.
      const spokenReply = replyFor(reply, actions);
      say("assistant", spokenReply);
      if (spoken) speak(spokenReply);

      if (failures.length > 0) {
        // Show why a call failed (usually: not in the user's contacts).
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

    // A second press stops listening.
    if (listening) {
      listeningRef.current?.cancel();
      return;
    }

    // Stop speaking first so the mic doesn't pick it up.
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
