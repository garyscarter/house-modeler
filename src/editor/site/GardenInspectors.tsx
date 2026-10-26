import { useStore, useSite } from "../../store";
import { SURFACE_LABEL, type GardenItem, type SiteSurface, type SurfaceKind } from "../../types";
import { SlopeFields } from "../../components/SlopeFields";
import { SurfaceFinishField } from "../../components/SurfaceFinishField";
import { KerbFields } from "../../components/KerbFields";
import { gardenDef, isPlant, itemSize } from "../../lib/gardenCatalogue";
import { copyItems, itemsOf, runLength } from "../../lib/siteItems";
import { canRotate, patchItem, removeItems, rotateItems } from "./gardenEdit";

const num = (v: string): number | undefined => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Colours for frames, foliage and cushions: garden-ish, plain names. */
const GARDEN_COLOURS: { name: string; hex: string }[] = [
  { name: "Black", hex: "#1d1f22" },
  { name: "Charcoal", hex: "#2f3236" },
  { name: "Grey", hex: "#8c8f91" },
  { name: "Stone", hex: "#d8d3c8" },
  { name: "Oak", hex: "#8b6a46" },
  { name: "Terracotta", hex: "#b8693f" },
  { name: "Deep green", hex: "#2e4a2c" },
  { name: "Leaf green", hex: "#5f8a3a" },
  { name: "Sage", hex: "#8a9a73" },
  { name: "Autumn red", hex: "#a3322b" },
  { name: "Blue", hex: "#3d6fb0" },
  { name: "Lilac", hex: "#8b7ac0" },
];

function Swatches({ value, onPick, label }: { value: string; onPick: (hex: string) => void; label: string }) {
  const v = value.toLowerCase();
  return (
    <div className="swatches" role="group" aria-label={label}>
      {GARDEN_COLOURS.map((s) => (
        <button key={s.hex} type="button" className="swatch" style={{ background: s.hex }} title={s.name} aria-label={`${label}: ${s.name}`} aria-pressed={v === s.hex} onClick={() => onPick(s.hex)} />
      ))}
    </div>
  );
}

/** Centimetres in, metres out: a number box for a size. */
function Cm({ label, value, min = 5, max = 1500, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (m: number) => void }) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={5}
        aria-label={label}
        value={Math.round(value * 100)}
        onChange={(e) => {
          const v = num(e.target.value);
          if (v !== undefined) onChange(Math.min(max, Math.max(min, v)) / 100);
        }}
      />
    </label>
  );
}

/** Fields shared by the surface inspector in the site editor and the Garden panel's surface rows. */
export function SurfaceFields({ surface }: { surface: SiteSurface }) {
  const updateSite = useStore((s) => s.updateSite);
  const set = (p: Partial<SiteSurface>) => updateSite((st) => ({ ...st, surfaces: st.surfaces.map((x) => (x.id === surface.id ? { ...x, ...p } : x)) }));
  return (
    <>
      <label>
        Surface
        <select value={surface.kind} onChange={(e) => set({ kind: e.target.value as SurfaceKind })}>
          {(Object.keys(SURFACE_LABEL) as SurfaceKind[]).map((k) => (
            <option key={k} value={k}>
              {SURFACE_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <SurfaceFinishField surface={surface} onChange={(finish) => set({ finish })} />
      <SlopeFields surface={surface} onChange={(slope) => set({ slope })} />
      <label className="check">
        <input type="checkbox" checked={!!surface.smooth} onChange={(e) => set({ smooth: e.target.checked })} /> Curved edges
      </label>
      <KerbFields surface={surface} onChange={(p) => set(p)} />
    </>
  );
}

/** The selected garden item or items: size, turn, colours, seats, mount, festoon heights, Duplicate and Delete. */
export function ItemInspector({ ids }: { ids: string[] }) {
  const site = useSite();
  const updateSite = useStore((s) => s.updateSite);
  const setUi = useStore((s) => s.setUi);
  const items = site ? itemsOf(site).filter((it) => ids.includes(it.id)) : [];
  if (!site || !items.length) return null;

  const duplicate = () => {
    const r = copyItems(site, items.map((i) => i.id));
    updateSite(() => r.site);
    setUi({ gardenSel: r.ids });
  };
  const remove = () => {
    updateSite((st) => removeItems(st, items.map((i) => i.id)));
    setUi({ gardenSel: [] });
  };
  const buttons = (
    <div className="row garden-item-actions">
      <button onClick={duplicate}>Duplicate</button>
      <button className="danger" onClick={remove}>
        {items.length > 1 ? `Delete ${items.length} items` : "Delete"}
      </button>
    </div>
  );

  if (items.length > 1) {
    return (
      <div className="inspector garden-inspector" data-garden-inspector="multi">
        <h4>{items.length} items selected</h4>
        <p className="muted small">Drag to move them together. Arrows nudge, Q and E turn.</p>
        <div className="row">
          <button onClick={() => updateSite((st) => rotateItems(st, ids, -15))}>Turn −15°</button>
          <button onClick={() => updateSite((st) => rotateItems(st, ids, 15))}>Turn +15°</button>
        </div>
        {buttons}
      </div>
    );
  }

  const item = items[0];
  const def = gardenDef(item.type);
  if (!def) return null;
  const size = itemSize(item);
  const plant = isPlant(def);
  const set = (p: Partial<GardenItem>) => updateSite((st) => patchItem(st, item.id, p));
  const run = !!item.to;
  const rotatable = canRotate(item);

  return (
    <div className="inspector garden-inspector" data-garden-inspector="item">
      <h4>{def.name}</h4>
      {run && <p className="muted small">Run length {runLength(item).toFixed(2)} m. Drag an end to move it.</p>}
      {def.note && !run && <p className="muted small">{def.note}</p>}

      {!run && !plant && (
        <div className="row garden-sizes">
          <Cm label="Width (cm)" value={size.w} onChange={(w) => set({ w })} />
          <Cm label="Depth (cm)" value={size.d} onChange={(d) => set({ d })} />
        </div>
      )}
      {plant && !run && (
        <div className="row garden-sizes">
          <Cm label="Spread (cm)" value={size.w} onChange={(w) => set({ w, d: w })} />
          <Cm label="Height (cm)" value={size.h} onChange={(h) => set({ h })} />
        </div>
      )}
      {plant && run && (
        <div className="row garden-sizes">
          <Cm label="Width (cm)" value={size.w} onChange={(w) => set({ w, d: w })} />
          <Cm label="Height (cm)" value={size.h} onChange={(h) => set({ h })} />
        </div>
      )}
      {!plant && !run && (
        <div className="row garden-sizes">
          <Cm label="Height (cm)" value={size.h} onChange={(h) => set({ h })} />
          {def.seats !== undefined && (
            <label>
              Seats
              <input type="number" min={1} max={12} step={1} aria-label="Seats" value={item.seats ?? def.seats} onChange={(e) => {
                const v = num(e.target.value);
                if (v !== undefined) set({ seats: Math.min(12, Math.max(1, Math.round(v))) });
              }} />
            </label>
          )}
        </div>
      )}

      {def.shape === "festoon" && (
        <>
          <div className="row garden-sizes">
            <Cm label="Height at start (cm)" value={size.h} min={50} max={600} onChange={(h) => set({ h })} />
            <Cm label="Height at end (cm)" value={item.toH ?? size.h} min={50} max={600} onChange={(toH) => set({ toH })} />
          </div>
          <Cm label="Sag at mid-span (cm)" value={item.sag ?? 0.3} min={0} max={150} onChange={(sag) => set({ sag })} />
        </>
      )}
      {def.shape === "wall-light" && <Cm label="Height above ground (cm)" value={item.mount ?? def.mount ?? 1.7} min={0} max={500} onChange={(mount) => set({ mount })} />}
      {rotatable && (
        <div className="garden-turn">
          <label>
            Turn (°)
            <input type="number" min={0} max={359} step={15} aria-label="Rotation in degrees" value={Math.round(item.rot)} onChange={(e) => {
              const v = num(e.target.value);
              if (v !== undefined) set({ rot: ((Math.round(v) % 360) + 360) % 360 });
            }} />
          </label>
          <div className="row">
            <button onClick={() => updateSite((st) => rotateItems(st, [item.id], -15))} aria-label="Turn 15 degrees anticlockwise">
              −15°
            </button>
            <button onClick={() => updateSite((st) => rotateItems(st, [item.id], 15))} aria-label="Turn 15 degrees clockwise">
              +15°
            </button>
          </div>
        </div>
      )}

      <span className="swatch-label">{plant ? "Foliage" : "Main colour"}</span>
      <Swatches value={item.color ?? def.color} label="Colour" onPick={(color) => set({ color })} />
      {def.accent && (
        <>
          <span className="swatch-label">{plant ? "Flowers or fruit" : "Cushions or canopy"}</span>
          <Swatches value={item.accent ?? def.accent} label="Accent colour" onPick={(accent) => set({ accent })} />
        </>
      )}
      {(item.color || item.accent || item.w || item.d || item.h) && (
        <button className="link" onClick={() => set({ color: undefined, accent: undefined, w: undefined, d: undefined, h: undefined, toH: undefined })}>
          Back to the catalogue size and colours
        </button>
      )}
      {buttons}
    </div>
  );
}
