import { useEffect, useRef, useState } from "react";
import { CATEGORIES, filterCatalogue, MINE, type CatalogueItem } from "../lib/catalogue";
import { pieceItem } from "../lib/myFurniture";
import { useStore } from "../store";
import { PieceForm } from "./MyFurniture";
import { usePanelPrefs } from "../components/panelPrefs";
import { OPEN_ADD_EVENT, takePendingAdd } from "./addPicker";
import { filterGarden, GARDEN_CATEGORIES, type GardenCategory, type GardenDef } from "../lib/gardenCatalogue";
import { GardenThumb } from "./GardenSymbol";
import { FixtureSymbol } from "./FixtureSymbol";

/**
 * The Add furniture popover: a search box and category chips in a card that opens to the right of its anchor
 * (the rail's Add button, which wraps it in a `.rail-slot`). Closes on an outside click or Esc.
 */
export function AddPopover({
  activeId,
  onPick,
  open,
  onOpenChange,
  children,
}: {
  activeId?: string | null;
  onPick?: (item: CatalogueItem) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Another picker (the garden's) in the same popover shell; then `onPick` and `activeId` are not used. */
  children?: React.ReactNode;
}) {
  const pop = useRef<HTMLDivElement>(null);
  // 3D's "Add furniture" switches to the plan and asks for the picker: open it on mount, or on the event if the plan is already up.
  useEffect(() => {
    if (takePendingAdd()) onOpenChange(true);
    const openIt = () => {
      takePendingAdd();
      onOpenChange(true);
    };
    window.addEventListener(OPEN_ADD_EVENT, openIt);
    return () => window.removeEventListener(OPEN_ADD_EVENT, openIt);
  }, [onOpenChange]);
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
      {children ?? (
        <CataloguePicker
          activeId={activeId}
          onPick={(item) => {
            onOpenChange(false);
            onPick?.(item);
          }}
        />
      )}
    </div>
  );
}

/** A 36 px plan symbol of a catalogue item, scaled to fit its footprint with 8 % padding; same tile as the garden's. */
function FixtureThumb({ item, size = 36 }: { item: CatalogueItem; size?: number }) {
  const s = (size * 0.92) / Math.max(item.w, item.d, 0.05);
  return (
    <svg className="garden-thumb" width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true" focusable="false">
      <FixtureSymbol item={item} w={item.w * s} d={item.d * s} m={s} stroke={0.8} />
    </svg>
  );
}

/** Search box, category chips and the matching rows. */
export function CataloguePicker({ activeId, onPick }: { activeId?: string | null; onPick: (item: CatalogueItem) => void }) {
  const category = usePanelPrefs((s) => s.addCategory);
  const setPrefs = usePanelPrefs((s) => s.setPrefs);
  const [query, setQuery] = useState("");
  const pieces = useStore((s) => s.pieces);
  const addPiece = useStore((s) => s.addPiece);
  const [adding, setAdding] = useState(false);
  const cat = category === "All" || category === MINE || CATEGORIES.includes(category) ? category : "All";
  const items = filterCatalogue(query, cat, pieces.map(pieceItem));
  return (
    <div className="catalogue-picker furniture-picker">
      <input type="search" autoFocus placeholder="Search furniture" aria-label="Search furniture" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips" role="group" aria-label="Category">
        {["All", MINE, ...CATEGORIES].map((c) => (
          <button key={c} className={c === cat ? "chip active" : "chip"} aria-pressed={c === cat} onClick={() => setPrefs({ addCategory: c })}>
            {c}
          </button>
        ))}
      </div>
      <div className="picker-rows">
        {items.map((c) => (
          <button key={c.id} className={activeId === (c.piece ?? c.id) ? "active" : ""} title={c.note ?? ""} onClick={() => onPick(c)}>
            <FixtureThumb item={c} />
            <span className="garden-row-name">{c.name}</span>
            <span className="muted">
              {c.piece ? "Yours · " : ""}
              {c.w.toFixed(2)} × {c.d.toFixed(2)} m
            </span>
          </button>
        ))}
        {items.length === 0 && cat !== MINE && <p className="muted small">Nothing matches.</p>}
        {items.length === 0 && cat === MINE && !adding && <p className="muted small">Furniture you already own, with its real sizes, shows here.</p>}
      </div>
      {cat === MINE &&
        (adding ? (
          <PieceForm
            onCancel={() => setAdding(false)}
            onSave={(p) => {
              const id = addPiece(p);
              setAdding(false);
              onPick(pieceItem({ ...p, id }));
            }}
          />
        ) : (
          <div className="picker-foot">
            <button onClick={() => setAdding(true)}>Add my own piece…</button>
          </div>
        ))}
    </div>
  );
}

/** The garden's picker: search box, category chips and a thumbnail row per entry (a normal entry or a run). */
export function GardenPicker({ onPick, activeId }: { onPick: (def: GardenDef) => void; activeId?: string | null }) {
  const [category, setCategory] = useState<GardenCategory | "All">("All");
  const [query, setQuery] = useState("");
  const items = filterGarden(query, category);
  return (
    <div className="catalogue-picker garden-picker">
      <input type="search" autoFocus placeholder="Search the garden" aria-label="Search the garden" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips" role="group" aria-label="Category">
        {(["All", ...GARDEN_CATEGORIES] as const).map((c) => (
          <button key={c} className={c === category ? "chip active" : "chip"} aria-pressed={c === category} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="picker-rows">
        {items.map((g) => (
          <button key={g.id} data-garden-id={g.id} className={activeId === g.id ? "active" : ""} title={g.note ?? ""} onClick={() => onPick(g)}>
            <GardenThumb def={g} />
            <span className="garden-row-name">{g.name}</span>
            <span className="muted">{g.run ? "Click two ends" : g.kind === "plant" ? `${g.w.toFixed(1)} m spread` : `${g.w.toFixed(2)} × ${g.d.toFixed(2)} m`}</span>
          </button>
        ))}
        {items.length === 0 && <p className="muted small">Nothing matches.</p>}
      </div>
    </div>
  );
}
