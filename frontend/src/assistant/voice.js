/**
 * Push-to-talk and spoken replies, on the browser's own Web Speech API.
 *
 * Both halves are Chrome-only in practice and need a secure context — https,
 * or localhost, which is how this app is served in development. Everything
 * here degrades to a no-op rather than throwing, so the panel can call it
 * unconditionally and simply hide the microphone where it is unsupported.
 */

const Recognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined;

export const SPEECH_INPUT_SUPPORTED = Boolean(Recognition);

export const SPEECH_OUTPUT_SUPPORTED =
  typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Listen for one utterance.
 *
 * Resolves with the transcript, or "" if the driver said nothing. Rejects only
 * on a real fault — a denied microphone, or no support at all — so the caller
 * can tell "heard nothing" apart from "cannot listen".
 *
 * @returns {{ promise: Promise<string>, cancel: () => void }}
 */
export function listenOnce() {
  if (!Recognition) {
    return {
      promise: Promise.reject(new Error("This browser cannot listen.")),
      cancel: () => {},
    };
  }

  const recognition = new Recognition();
  recognition.lang = "en-US";
  // One phrase, then stop: this is push-to-talk, not dictation.
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let settled = false;

  const promise = new Promise((resolve, reject) => {
    recognition.onresult = (event) => {
      settled = true;
      resolve(event.results[0]?.[0]?.transcript?.trim() ?? "");
    };

    recognition.onerror = (event) => {
      if (settled) return;
      settled = true;
      // "no-speech" and "aborted" are ordinary outcomes, not faults: the
      // driver pressed the button and thought better of it.
      if (event.error === "no-speech" || event.error === "aborted") {
        resolve("");
        return;
      }
      reject(
        new Error(
          event.error === "not-allowed"
            ? "The microphone is blocked. Allow it in the address bar."
            : `Could not listen (${event.error}).`
        )
      );
    };

    recognition.onend = () => {
      // Fires after result/error too; only meaningful if nothing else landed.
      if (settled) return;
      settled = true;
      resolve("");
    };
  });

  recognition.start();

  return { promise, cancel: () => recognition.abort() };
}

/**
 * Speak a reply.
 *
 * Cancels anything still being said first: a driver who asks two things in
 * quick succession should hear the answer to the second, not both at once.
 */
export function speak(text) {
  if (!SPEECH_OUTPUT_SUPPORTED || !text) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech is a nicety; the reply is already on screen.
  }
}

/** Stop mid-sentence — used when the panel closes. */
export function stopSpeaking() {
  if (!SPEECH_OUTPUT_SUPPORTED) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Nothing to stop.
  }
}
