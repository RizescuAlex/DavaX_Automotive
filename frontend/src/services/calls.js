import { apiFetch } from "../config/api";

export function createCall(calleeEmail) {
  return apiFetch("/calls", {
    method: "POST",
    body: JSON.stringify({ callee_email: calleeEmail }),
  });
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
