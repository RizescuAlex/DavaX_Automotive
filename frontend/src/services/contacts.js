import { apiFetch } from "../config/api";
import { normalizeUsername } from "./calls";

export function listContacts() {
  return apiFetch("/users/me/contacts");
}

export function addContact(username) {
  return apiFetch("/users/me/contacts", {
    method: "POST",
    body: JSON.stringify({ username: normalizeUsername(username) }),
  });
}

/** contactId is the contact's user id, as listContacts returns it. */
export function removeContact(contactId) {
  return apiFetch(`/users/me/contacts/${contactId}`, { method: "DELETE" });
}
