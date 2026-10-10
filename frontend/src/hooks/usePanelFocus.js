import { useEffect, useLayoutEffect, useRef } from "react";

const FIELDS = "input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled)";

/**
 * Keyboard behaviour for the panels over the map: focus moves into the panel on
 * open (its first field, or the panel itself, which then needs tabIndex={-1}),
 * Escape closes it, and focus returns to the opener on close unless it has
 * moved elsewhere. The opener is captured in a layout effect because layout
 * effects run before any passive effect, including a child that focuses its own
 * input on mount (CallLauncher).
 * @param {React.RefObject<HTMLElement>} panelRef
 * @param {() => void} onClose
 * @param {boolean} [open=true] for panels that stay mounted while closed
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
