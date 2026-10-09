import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneIcon, UserMinusIcon, UserPlusIcon, UsersIcon, XIcon } from "@phosphor-icons/react";
import { DESIGN_PREVIEW } from "../../config/devPreview";
import { placeCall } from "../../services/calls";
import { addContact, listContacts, removeContact } from "../../services/contacts";
import { useAppStore } from "../../store";
import { usePanelFocus } from "../../hooks/usePanelFocus";
import "../vehicle-settings/VehiclePreferencesPanel.css";
import "./ContactsPanel.css";

/** How long a Remove tap waits for its confirming second tap. */
const CONFIRM_WINDOW_MS = 3000;

/**
 * Contacts, opened from the top bar — a panel over the map like the others.
 *
 * The backend only lets a driver call people in their contacts, so this is
 * where a call usually starts: add someone by username once, then call them
 * with one tap. Removing takes a second tap to confirm, because a mis-tap on a
 * moving car should not quietly cost the driver a contact.
 */
export default function ContactsPanel() {
  const open = useAppStore((s) => s.contactsOpen);
  const setContactsOpen = useAppStore((s) => s.setContactsOpen);

  if (!open) return null;
  return <ContactsContent onClose={() => setContactsOpen(false)} />;
}

function ContactsContent({ onClose }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  // Which row is mid-action, so only its buttons show as busy.
  const [busyId, setBusyId] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const confirmTimer = useRef(null);

  // Focus in on open, Escape closes, focus back to the opener on close.
  usePanelFocus(panelRef, onClose);

  const load = useCallback(async () => {
    // No session in preview mode, and a 401 would bounce to /login.
    if (DESIGN_PREVIEW) {
      setLoading(false);
      return;
    }
    try {
      setContacts(await listContacts());
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    inputRef.current?.focus();
    return () => clearTimeout(confirmTimer.current);
  }, [load]);

  const say = (text, isError = false) => {
    setMessage(isError ? "" : text);
    setError(isError ? text : "");
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    if (!draft.trim() || adding) return;
    setAdding(true);
    try {
      const added = await addContact(draft);
      setContacts((previous) =>
        [...previous, added].sort((a, b) => a.username.localeCompare(b.username))
      );
      setDraft("");
      say(`Added @${added.username}.`);
    } catch (err) {
      say(err.message, true);
    } finally {
      setAdding(false);
    }
  };

  const handleCall = async (contact) => {
    setBusyId(contact.id);
    try {
      await placeCall(contact.username);
      // The call dialog takes over from here.
      onClose();
    } catch (err) {
      say(err.message, true);
      setBusyId(null);
    }
  };

  const handleRemove = async (contact) => {
    // First tap arms the button; the second, within the window, removes.
    if (confirmingId !== contact.id) {
      setConfirmingId(contact.id);
      clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmingId(null), CONFIRM_WINDOW_MS);
      return;
    }

    clearTimeout(confirmTimer.current);
    setConfirmingId(null);
    setBusyId(contact.id);
    try {
      await removeContact(contact.id);
      setContacts((previous) => previous.filter((c) => c.id !== contact.id));
      say(`Removed @${contact.username}.`);
    } catch (err) {
      say(err.message, true);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section ref={panelRef} tabIndex={-1} className="prefs-panel contacts-panel" aria-label="Contacts">
      <header className="prefs-head">
        <UsersIcon size={16} className="prefs-head-icon" aria-hidden="true" />
        <h2 className="prefs-head-title">Contacts</h2>
        <button
          type="button"
          className="prefs-close"
          onClick={onClose}
          aria-label="Close contacts"
        >
          <XIcon size={18} />
        </button>
      </header>

      <form className="contacts-add" onSubmit={handleAdd}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add by @username"
          aria-label="Username to add as a contact"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="submit" className="contacts-add-btn" disabled={adding || !draft.trim()}>
          <UserPlusIcon size={16} aria-hidden="true" />
          {adding ? "Adding…" : "Add"}
        </button>
      </form>

      {(message || error) && (
        <p className={`contacts-status ${error ? "error" : ""}`} role="status">
          {error || message}
        </p>
      )}

      <div className="contacts-list">
        {loading ? (
          <p className="contacts-empty">Loading contacts…</p>
        ) : contacts.length === 0 ? (
          <p className="contacts-empty">
            No contacts yet. Add someone by their username to be able to call them.
          </p>
        ) : (
          <ul>
            {contacts.map((contact) => {
              const name = contact.display_name || contact.username;
              const busy = busyId === contact.id;
              const confirming = confirmingId === contact.id;
              return (
                <li key={contact.id} className="contact-row">
                  <span className="contact-avatar" aria-hidden="true">
                    {contact.avatar_url ? (
                      <img src={contact.avatar_url} alt="" />
                    ) : (
                      name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="contact-text">
                    <strong>{name}</strong>
                    <span>@{contact.username}</span>
                  </span>
                  <button
                    type="button"
                    className="contact-call"
                    onClick={() => handleCall(contact)}
                    disabled={busy}
                    aria-label={`Call ${name}`}
                    title={`Call ${name}`}
                  >
                    <PhoneIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className={`contact-remove ${confirming ? "confirming" : ""}`}
                    onClick={() => handleRemove(contact)}
                    disabled={busy}
                    aria-label={confirming ? `Confirm removing ${name}` : `Remove ${name}`}
                    title={confirming ? "Tap again to remove" : "Remove contact"}
                  >
                    <UserMinusIcon size={16} aria-hidden="true" />
                    {confirming && <span>Remove?</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
