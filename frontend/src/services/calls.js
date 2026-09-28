import { apiFetch } from "../config/api";
import { useAppStore } from "../store";
import { startCallRingtone } from "./callSounds";

/** "@Alex.Pop " -> "alex.pop": what the backend stores and matches on. */
export function normalizeUsername(value) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export function createCall(calleeUsername) {
  return apiFetch("/calls", {
    method: "POST",
    body: JSON.stringify({ callee_username: normalizeUsername(calleeUsername) }),
  });
}

/**
 * Place a call and hand it to the call dialog.
 *
 * The Call panel, the Contacts panel and the assistant all start calls, and
 * all three must do the same three things in the same order, so it lives
 * here once. The backend only connects people who are in each other's
 * contacts, and says so in the error if not.
 */
export async function placeCall(username) {
  const call = await createCall(username);
  useAppStore.getState().setCall(call);
  startCallRingtone("ongoing");
  return call;
}

export function getCurrentCall() {
  return apiFetch("/calls/current");
}

export function respondToCall(callId, action) {
  return apiFetch(`/calls/${callId}/respond`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function endCall(callId) {
  return apiFetch(`/calls/${callId}/end`, { method: "POST" });
}

export function getCallToken(callId) {
  return apiFetch(`/calls/${callId}/token`, { method: "POST" });
}
