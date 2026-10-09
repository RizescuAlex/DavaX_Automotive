import { apiFetch } from "../config/api";
import { useAppStore } from "../store";
import { startCallRingtone } from "./callSounds";

/** "@Alex.Pop " -> "alex.pop", the form the backend stores. */
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
 * Place a call and open the call dialog. Used by the Call panel, Contacts and
 * the assistant. The backend rejects callees who aren't in the user's contacts.
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
