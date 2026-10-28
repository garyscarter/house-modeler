import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { houseList } from "../houses";
import { chooseHouse } from "../lib/house";
import { BrandMark } from "./BrandMark";
import { Loader } from "./Loader";
import "./Dialogs.css";
import "./HousePicker.css";

/**
 * "Which house?": one tile per house in this build. Choosing one remembers it on this device and reloads, so every
 * part of the app starts again on that house. Shown before the app when no house is chosen yet, and from the House
 * menu's "Switch house…" (with `onClose`) as a modal.
 */
export function HousePicker({ current, onClose }: { current?: string; onClose?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  const houses = houseList();

  useEffect(() => first.current?.focus(), []);
  useEffect(() => {
    if (!onClose) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose, busy]);

  const pick = (id: string) => {
    if (busy) return;
    if (id === current) return onClose?.();
    setBusy(id);
    chooseHouse(id);
  };

  const card = (
    <section className="house-picker" role={onClose ? "dialog" : undefined} aria-modal={onClose ? true : undefined} aria-labelledby="house-picker-title">
      <BrandMark outline size={56} />
      <h1 id="house-picker-title">Which house?</h1>
      <p className="house-picker-lede">Each house keeps its own layouts, plot and photos on this device.</p>
      <div className="house-picker-tiles">
        {houses.map((h, i) => (
          <button
            key={h.id}
            ref={i === 0 ? first : undefined}
            className={h.id === current ? "house-picker-tile current" : "house-picker-tile"}
            onClick={() => pick(h.id)}
            disabled={!!busy}
            aria-busy={busy === h.id}
            aria-current={h.id === current ? "true" : undefined}
          >
            <span className="house-picker-name">{h.name}</span>
            <span className="house-picker-id">{h.id}</span>
            {busy === h.id && (
              <span className="house-picker-busy" role="status">
                <Loader kind="lift" size={18} />
                Opening {h.name}
              </span>
            )}
            {h.id === current && !busy && <span className="house-picker-here">Open now</span>}
          </button>
        ))}
      </div>
      {onClose && (
        <button className="link house-picker-cancel" onClick={onClose} disabled={!!busy}>
          Cancel
        </button>
      )}
    </section>
  );

  if (!onClose) return <div className="house-picker-page">{card}</div>;
  // Portalled to the body: the top bar's glass blur would otherwise trap a fixed backdrop inside it.
  return createPortal(
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      {card}
    </div>,
    document.body,
  );
}
