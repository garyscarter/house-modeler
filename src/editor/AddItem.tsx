import { useEffect, useRef, useState } from "react";
import { CATEGORIES, filterCatalogue, type CatalogueItem } from "../lib/catalogue";
import { usePanelPrefs } from "../components/panelPrefs";

/**
 * Furnish's Add button: opens a popover (320 px wide, 60vh tall) with a search
 * box and category chips. Closes on an outside click or Esc, as ViewMenu does.
 * `open` / `onOpenChange` let a caller (the Add furniture button in the side
 * panel) open the same popover.
 */
export function AddItemButton({
  activeId,
  onPick,
  label = "Add",
  open: openProp,
  onOpenChange,
}: {
  activeId?: string | null;
  onPick: (item: CatalogueItem) => void;
  label?: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [openLocal, setOpenLocal] = useState(false);
  const open = openProp ?? openLocal;
  const setOpen = (v: boolean) => {
    setOpenLocal(v);
    onOpenChange?.(v);
  };
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        setOpenLocal(false);
        onOpenChange?.(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpenLocal(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open, onOpenChange]);
  return (
    <div className="add-item" ref={root}>
      <button className={open ? "active" : ""} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && (
        <div className="add-pop">
          <CataloguePicker
            activeId={activeId}
            onPick={(item) => {
              setOpen(false);
              onPick(item);
            }}
          />
        </div>
      )}
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
