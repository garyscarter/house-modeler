import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icons";
import "./Modal.css";

/** A centred panel over a dimmed backdrop. Esc, the close button or a click outside closes it. */
export function Modal({ title, onClose, width = 760, className = "", children }: { title: string; onClose: () => void; width?: number | string; className?: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // A confirm dialog opened from here answers Esc itself.
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector(".dialog-backdrop, .lightbox")) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal float-card ${className}`.trim()} ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
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
