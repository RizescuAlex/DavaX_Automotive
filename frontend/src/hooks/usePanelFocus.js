import { useEffect, useLayoutEffect, useRef } from "react";

const FIELDS = "input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled)";

/**
 * Keyboard behaviour shared by the panels over the map.
 *
 * - Opening moves focus into the panel: its first field if it has one when it
 *   opens, otherwise the panel itself (which needs tabIndex={-1}), so a screen
 *   reader announces the panel and Tab continues inside it.
 * - Escape closes it.
 * - Closing hands focus back to whatever had it before — normally the top-bar
 *   button that opened the panel — instead of dropping it to the top of the
 *   page, unless the driver has already moved focus somewhere else.
 *
 * The opener is captured in a layout effect: every layout effect in the tree
 * runs before any passive one, so it still sees the opener even when a child
 * focuses its own input from a useEffect on mount (CallLauncher does).
 *
 * @param {React.RefObject<HTMLElement>} panelRef  the panel's root element
 * @param {() => void} onClose
 * @param {boolean} [open=true]  for panels that stay mounted while closed
 */
export function usePanelFocus(panelRef, onClose, open = true) {
  const openerRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    if (open) openerRef.current = document.activeElement;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    const opener = openerRef.current;

    if (panel && !panel.contains(document.activeElement)) {
      (panel.querySelector(FIELDS) || panel).focus({ preventScroll: true });
    }

    const onKey = (event) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const now = document.activeElement;
      const focusWasHere = !now || now === document.body || !now.isConnected || panel?.contains(now);
      if (focusWasHere && opener?.isConnected && opener !== document.body) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open, panelRef]);
}
