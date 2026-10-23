import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";
import { siteOf } from "../lib/sites";
import { Icon } from "./icons";
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
  children,
}: {
  label: ReactNode;
  className?: string;
  title?: string;
  disabled?: boolean;
  placement?: "up" | "down";
  align?: "center" | "start" | "end";
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
      if (e.key === "Escape") {
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
      <button className={open ? "popover-btn active" : "popover-btn"} aria-expanded={open} aria-haspopup="true" title={title} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        {label}
        <Icon name="chevronDown" size={14} />
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
    </div>
  );
}
