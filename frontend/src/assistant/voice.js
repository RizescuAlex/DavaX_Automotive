/**
 * Push-to-talk and spoken replies via the Web Speech API (Chrome; needs https
 * or localhost). Everything is a no-op where unsupported.
 */

const Recognition =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined;

export const SPEECH_INPUT_SUPPORTED = Boolean(Recognition);

export const SPEECH_OUTPUT_SUPPORTED =
  typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Listen for one utterance. Resolves with the transcript, or "" if nothing was
 * said; rejects on a real error (no support, mic denied).
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
      // "no-speech" and "aborted" are not errors.
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
      // Also fires after result/error; only matters if neither did.
      if (settled) return;
      settled = true;
      resolve("");
    };
  });

  recognition.start();

  return { promise, cancel: () => recognition.abort() };
}

/** Speak a reply, cancelling anything still being spoken. */
export function speak(text) {
  if (!SPEECH_OUTPUT_SUPPORTED || !text) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  } catch {
    // The reply is already on screen.
  }
}

/** Stop speaking (used when the panel closes). */
export function stopSpeaking() {
  if (!SPEECH_OUTPUT_SUPPORTED) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Nothing to stop.
  }
}
