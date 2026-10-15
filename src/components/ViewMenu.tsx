import { useEffect, useRef, useState, type ReactNode } from "react";
import { SITE_EDIT_ID, useStore } from "../store";
import type { HouseModel } from "../types";
import "./ViewMenu.css";

/**
 * What the 3D view shows: compare mode, camera, floors and overlays. Rendered
 * inline in the header on wide screens and inside the View popover otherwise.
 */
export function ViewControls({ model, both }: { model: HouseModel | undefined; both: boolean }) {
  const viewMode = useStore((s) => s.viewMode);
  const cameraMode = useStore((s) => s.cameraMode);
  const walkFloorId = useStore((s) => s.walkFloorId);
  const showLabels = useStore((s) => s.showLabels);
  const showCeilings = useStore((s) => s.showCeilings);
  const maxLevel = useStore((s) => s.maxLevel);
  const showExterior = useStore((s) => s.showExterior);
  const showSite = useStore((s) => s.showSite);
  const site = useStore((s) => s.site);
  const activeVariant = useStore((s) => s.activeVariant);
  const setUi = useStore((s) => s.setUi);
  const updateModel = useStore((s) => s.updateModel);

  return (
    <>
      <div className="seg" role="group" aria-label="Compare">
        <button data-pick className={viewMode === "single" ? "active" : ""} onClick={() => setUi({ viewMode: "single" })}>
          Single
        </button>
        <button data-pick className={viewMode === "side-by-side" ? "active" : ""} disabled={!both} onClick={() => setUi({ viewMode: "side-by-side" })}>
          Side by side
        </button>
        <button data-pick className={viewMode === "overlay" ? "active" : ""} disabled={!both} onClick={() => setUi({ viewMode: "overlay" })}>
          Overlay
        </button>
      </div>
      <div className="seg" role="group" aria-label="Camera">
        <button data-pick className={cameraMode === "orbit" ? "active" : ""} onClick={() => setUi({ cameraMode: "orbit" })}>
          Orbit
        </button>
        <button data-pick className={cameraMode === "walk" ? "active" : ""} disabled={!model} onClick={() => setUi({ cameraMode: "walk", viewMode: "single" })}>
          Walk
        </button>
        {cameraMode === "walk" && model && (
          <select value={walkFloorId ?? model.floors[0]?.id} onChange={(e) => setUi({ walkFloorId: e.target.value })} aria-label="Walk on floor">
            {model.floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {model && model.floors.length > 1 && cameraMode !== "walk" && (
        <label className="check">
          Show up to
          <select value={maxLevel ?? ""} onChange={(e) => setUi({ maxLevel: e.target.value === "" ? null : parseInt(e.target.value) })}>
            <option value="">all floors</option>
            {model.floors.map((f) => (
              <option key={f.id} value={f.level}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="checks">
        <label className="check">
          <input type="checkbox" checked={showLabels} onChange={(e) => setUi({ showLabels: e.target.checked })} /> Labels
        </label>
        <label className="check">
          <input type="checkbox" checked={showCeilings} onChange={(e) => setUi({ showCeilings: e.target.checked })} /> Ceilings
        </label>
        <label className="check" title="Roof, canopies and exterior photos. Hidden automatically when a floor cap is set.">
          <input type="checkbox" checked={showExterior} onChange={(e) => setUi({ showExterior: e.target.checked })} /> Exterior
        </label>
        <label className="check" title="Plot, garden and neighbouring buildings (set up under Site)">
          <input type="checkbox" checked={showSite} disabled={!site} onChange={(e) => setUi({ showSite: e.target.checked })} /> Site
        </label>
      </div>
      {model && (
        <label className="check">
          Ceiling height
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="2"
            max="4"
            value={model.ceilingHeight}
            onChange={(e) => updateModel(activeVariant, { ceilingHeight: parseFloat(e.target.value) || 2.4 })}
            style={{ width: 64 }}
          />
          m
        </label>
      )}
    </>
  );
}

/** Which floor (or the site) the plan editor shows. */
export function PlanFloorSwitch({ model }: { model: HouseModel }) {
  const editFloorId = useStore((s) => s.editFloorId);
  const setUi = useStore((s) => s.setUi);
  const editingSite = editFloorId === SITE_EDIT_ID;
  const current = model.floors.find((f) => f.id === editFloorId) ?? model.floors[0];
  return (
    <div className="seg" role="group" aria-label="Floor">
      {model.floors.map((f) => (
        <button key={f.id} data-pick className={!editingSite && current?.id === f.id ? "active" : ""} onClick={() => setUi({ editFloorId: f.id })}>
          {f.name}
        </button>
      ))}
      <button data-pick className={editingSite ? "active" : ""} onClick={() => setUi({ editFloorId: SITE_EDIT_ID })} title="Plot boundary, garden and neighbours">
        Site
      </button>
    </div>
  );
}

/**
 * A header button that opens its children in a popover. Tapping outside, Esc,
 * or picking a mode (a button marked data-pick) closes it; toggles keep it open.
 */
export function ViewMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="view-menu" ref={root}>
      <button className={open ? "view-menu-btn active" : "view-menu-btn"} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="view-pop" onClick={(e) => (e.target as Element).closest("button[data-pick]") && setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
