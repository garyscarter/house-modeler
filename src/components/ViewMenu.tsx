import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";
import { siteOf } from "../lib/sites";
import { defaultSection, describeSection, sectionRange, sectionStops, snapSection } from "../lib/sectionCut";
import { Icon } from "./icons";
import { usePanelPrefs } from "./panelPrefs";
import "./ViewMenu.css";

/**
 * A button that opens its children in a popover (upwards by default, for the dock). Clicking outside, Esc,
 * or picking a row marked data-pick closes it; toggles keep it open.
 */
export function Popover({
  label,
  className = "",
  title,
  disabled,
  placement = "up",
  align = "center",
  chevron = true,
  ariaLabel,
  children,
}: {
  label: ReactNode;
  className?: string;
  title?: string;
  disabled?: boolean;
  placement?: "up" | "down";
  align?: "center" | "start" | "end";
  /** Show the small chevron after the label. Off for icon-only buttons. */
  chevron?: boolean;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <div className={`popover-host ${className}`.trim()} ref={root}>
      <button className={open ? "popover-btn active" : "popover-btn"} aria-expanded={open} aria-haspopup="true" aria-label={ariaLabel} title={title} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {label}
        {chevron && <Icon name="chevronDown" size={14} />}
      </button>
      {open && (
        <div className={`popover pop-${placement} pop-${align}`} onClick={(e) => (e.target as Element).closest("[data-pick]") && setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

/** What the 3D view shows: labels, ceilings, doors, the exterior and the site. */
export function ViewToggles() {
  const showLabels = useStore((s) => s.showLabels);
  const showCeilings = useStore((s) => s.showCeilings);
  const doorsOpen = useStore((s) => s.doorsOpen);
  const showExterior = useStore((s) => s.showExterior);
  const showSite = useStore((s) => s.showSite);
  const site = useStore((s) => !!siteOf(s.sites, s.activeVariant));
  const setUi = useStore((s) => s.setUi);
  const showPins = usePanelPrefs((s) => s.showPins);
  const setPrefs = usePanelPrefs((s) => s.setPrefs);
  const hasPhotos = useStore((s) => s.photos.length > 0);
  return (
    <div className="view-toggles">
      <label className="check">
        <input type="checkbox" checked={showLabels} onChange={(e) => setUi({ showLabels: e.target.checked })} /> Labels
      </label>
      <label className="check">
        <input type="checkbox" checked={showCeilings} onChange={(e) => setUi({ showCeilings: e.target.checked })} /> Ceilings
      </label>
      <label className="check" title="Draw swing doors at their open angle. Off: every door is drawn shut.">
        <input type="checkbox" checked={doorsOpen} onChange={(e) => setUi({ doorsOpen: e.target.checked })} /> Doors open
      </label>
      <label className="check" title="Roof, canopies and exterior photos. Hidden automatically when a floor cap is set.">
        <input type="checkbox" checked={showExterior} onChange={(e) => setUi({ showExterior: e.target.checked })} /> Exterior
      </label>
      <label className="check" title="Plot, garden and neighbouring buildings (set up under Plot)">
        <input type="checkbox" checked={showSite} disabled={!site} onChange={(e) => setUi({ showSite: e.target.checked })} /> Site
      </label>
      <label className="check" title={hasPhotos ? "Camera pins on the rooms and one photo pin beside each side of the house" : "No photos in this project yet"}>
        <input type="checkbox" checked={showPins && hasPhotos} disabled={!hasPhotos} onChange={(e) => setPrefs({ showPins: e.target.checked })} /> Photos
      </label>
      <SectionCutControl />
    </div>
  );
}

/**
 * The section cut: slice the house horizontally and look down into a floor. A switch, a slider from the
 * lowest floor to over the ridge with each floor's stops as ticks (it snaps onto them), and a chip per floor.
 */
export function SectionCutControl() {
  const height = useStore((s) => s.sectionHeight);
  const model = useStore((s) => s.variants[s.activeVariant]);
  const setUi = useStore((s) => s.setUi);
  const listId = useId();
  const cut = useMemo(() => (model && model.floors.length ? { range: sectionRange(model), stops: sectionStops(model) } : null), [model]);
  if (!model || !cut) return null;
  const on = height !== null;
  const { range, stops } = cut;
  const value = on ? Math.min(range.max, Math.max(range.min, height)) : defaultSection(model);
  const floorStops = stops.filter((s) => s.kind === "floor");
  return (
    <div className="section-cut">
      <label className="check" title="Slice the house at a height and look down into the floor below the cut">
        <input type="checkbox" checked={on} onChange={(e) => setUi({ sectionHeight: e.target.checked ? defaultSection(model) : null })} /> Section cut
      </label>
      {on && (
        <div className="section-cut-body">
          <input
            type="range"
            className="section-cut-slider"
            aria-label="Section cut height"
            aria-valuetext={describeSection(value, model)}
            min={range.min}
            max={range.max}
            step={0.01}
            value={value}
            list={listId}
            onChange={(e) => setUi({ sectionHeight: snapSection(Number(e.target.value), stops, range) })}
          />
          <datalist id={listId}>
            {stops.map((s) => (
              <option key={s.id} value={s.height} label={s.label} />
            ))}
          </datalist>
          <div className="section-cut-reading">{describeSection(value, model)}</div>
          <div className="section-cut-stops">
            {floorStops.map((s) => (
              <button key={s.id} type="button" className={Math.abs(s.height - value) < 0.005 ? "section-chip active" : "section-chip"} aria-pressed={Math.abs(s.height - value) < 0.005} onClick={() => setUi({ sectionHeight: s.height })}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
