import { useEffect, useRef, useState } from "react";
import { CATEGORIES, filterCatalogue, type CatalogueItem } from "../lib/catalogue";
import { usePanelPrefs } from "../components/panelPrefs";

/**
 * The Add furniture popover: a search box and category chips in a card that opens to the right of its anchor
 * (the rail's Add button, which wraps it in a `.rail-slot`). Closes on an outside click or Esc.
 */
export function AddPopover({
  activeId,
  onPick,
  open,
  onOpenChange,
}: {
  activeId?: string | null;
  onPick: (item: CatalogueItem) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      // The anchor (the slot holding the button and this popover) counts as inside, so its button can toggle.
      if (!pop.current?.parentElement?.contains(e.target as Node)) onOpenChange(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open, onOpenChange]);
  if (!open) return null;
  return (
    // Keys pressed on a chip or row must not reach the plan's shortcuts (Backspace would delete the selection).
    <div
      className="add-pop popover"
      ref={pop}
      onKeyDown={(e) => {
        if (e.key !== "Escape") e.stopPropagation();
      }}
    >
      <CataloguePicker
        activeId={activeId}
        onPick={(item) => {
          onOpenChange(false);
          onPick(item);
        }}
      />
    </div>
  );
}

/** Search box, category chips and the matching rows. */
export function CataloguePicker({ activeId, onPick }: { activeId?: string | null; onPick: (item: CatalogueItem) => void }) {
  const category = usePanelPrefs((s) => s.addCategory);
  const setPrefs = usePanelPrefs((s) => s.setPrefs);
  const [query, setQuery] = useState("");
  const cat = category === "All" || CATEGORIES.includes(category) ? category : "All";
  const items = filterCatalogue(query, cat);
  return (
    <div className="catalogue-picker">
      <input type="search" autoFocus placeholder="Search furniture" aria-label="Search furniture" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips" role="group" aria-label="Category">
        {["All", ...CATEGORIES].map((c) => (
          <button key={c} className={c === cat ? "chip active" : "chip"} aria-pressed={c === cat} onClick={() => setPrefs({ addCategory: c })}>
            {c}
          </button>
        ))}
      </div>
      <div className="picker-rows">
        {items.map((c) => (
          <button key={c.id} className={activeId === c.id ? "active" : ""} title={c.note ?? ""} onClick={() => onPick(c)}>
            <span>{c.name}</span>
            <span className="muted">
              {c.w.toFixed(2)} × {c.d.toFixed(2)} m
            </span>
          </button>
        ))}
        {items.length === 0 && <p className="muted small">Nothing matches.</p>}
      </div>
    </div>
  );
}
