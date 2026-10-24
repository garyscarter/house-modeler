import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icons";
import "./Modal.css";

/** Overlays that stack above a modal and stay live when one opens. */
const OVERLAYS = ".modal-backdrop, .dialog-backdrop, .lightbox, .cmdk-backdrop";
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A centred panel over a dimmed backdrop. Esc, the close button or a click outside closes it.
 * While open, Tab stays inside the panel, the rest of the app is inert, and focus goes back to what opened it.
 */
export function Modal({ title, onClose, width = 760, className = "", children }: { title: string; onClose: () => void; width?: number | string; className?: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus({ preventScroll: true });
    // Everything else under the same parent (the shell) stops taking focus and clicks; overlays stacked on top stay live.
    const made: Element[] = [];
    for (const el of Array.from(backdrop.current?.parentElement?.children ?? [])) {
      if (el === backdrop.current || el.matches(OVERLAYS) || el.hasAttribute("inert")) continue;
      el.setAttribute("inert", "");
      made.push(el);
    }
    const onKey = (e: KeyboardEvent) => {
      // A confirm dialog opened from here answers Esc itself.
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector(".dialog-backdrop, .lightbox")) {
        e.preventDefault();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      made.forEach((el) => el.removeAttribute("inert"));
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  /** Tab and Shift+Tab cycle inside the panel. */
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (!items.length) {
      e.preventDefault();
      panel.current.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop" ref={backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal float-card ${className}`.trim()} ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} style={{ width }} onKeyDown={trap}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
