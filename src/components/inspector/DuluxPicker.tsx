import { useEffect, useMemo, useRef, useState } from "react";
import { DULUX_FAMILIES, POPULAR_DULUX, duluxByHex, duluxColours, duluxName, searchDulux, type DuluxColour } from "../../lib/dulux";
import { Icon } from "../icons";
import { ColourWell } from "./SwatchField";

function Row({ c, current, onPick }: { c: DuluxColour; current: boolean; onPick: (hex: string) => void }) {
  return (
    <button type="button" className="dulux-item" aria-pressed={current} title={`${c.name} ${c.hex}`} onClick={() => onPick(c.hex)}>
      <span className="dulux-chip" style={{ background: c.hex }} />
      <span className="dulux-name">{c.name}</span>
    </button>
  );
}

/** A popover of the Dulux range: search, popular colours, then families; plus a custom well. */
export function DuluxPicker({ label, value, onPick, onClose }: { label: string; value: string; onPick: (hex: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const v = value.toLowerCase();
  const name = duluxName(v);
  const exact = duluxByHex(v);

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) root.current?.querySelector("input")?.focus();
    const down = (e: PointerEvent) => {
      const field = root.current?.parentElement;
      if (field && !field.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key, true);
    };
  }, [onClose]);

  const popular = useMemo(() => POPULAR_DULUX.map((n) => duluxColours().find((c) => c.name === n)).filter((c): c is DuluxColour => !!c), []);
  const families = useMemo(() => DULUX_FAMILIES.map((f) => ({ f, items: duluxColours().filter((c) => c.family === f) })), []);
  const results = query.trim() ? searchDulux(query) : null;
  const pick = (hex: string) => {
    onPick(hex);
    onClose();
  };

  return (
    <div className="dulux-picker" ref={root} role="dialog" aria-label={`${label}: Dulux colours`}>
      <div className="dulux-top">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Dulux colours" aria-label="Search Dulux colours" />
        <button type="button" className="icon-btn" title="Close" aria-label="Close colour picker" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="dulux-body">
        {name && (
          <div className="dulux-grid dulux-current">
            <button type="button" className="dulux-item" aria-pressed="true" onClick={() => pick(v)}>
              <span className="dulux-chip" style={{ background: v }} />
              <span className="dulux-name">Current: {name}</span>
            </button>
          </div>
        )}
        {results ? (
          results.length ? (
            <div className="dulux-grid">{results.map((c) => <Row key={c.name + c.hex} c={c} current={c.hex === v} onPick={pick} />)}</div>
          ) : (
            <p className="muted small">No Dulux colour matches "{query}".</p>
          )
        ) : (
          <>
            <h5 className="dulux-h">Popular</h5>
            <div className="dulux-grid">{popular.map((c) => <Row key={c.name} c={c} current={c.hex === v} onPick={pick} />)}</div>
            {families.map(({ f, items }) => (
              <div key={f}>
                <button type="button" className="dulux-family" aria-expanded={open === f} onClick={() => setOpen(open === f ? null : f)}>
                  <span>{f}</span>
                  <span className="muted">{items.length}</span>
                </button>
                {open === f && <div className="dulux-grid">{items.map((c) => <Row key={c.name + c.hex} c={c} current={c.hex === v} onPick={pick} />)}</div>}
              </div>
            ))}
          </>
        )}
      </div>
      <div className="dulux-custom">
        <ColourWell value={value} onChange={onPick} label={`${label} custom`} custom={!exact} size={28} />
        <span>Custom…</span>
      </div>
    </div>
  );
}
