import { useState } from "react";
import { useSite, useStore } from "../store";
import { SURFACE_LABEL, type GardenItem, type SiteSurface } from "../types";
import { gardenSummary } from "../lib/modeSummary";
import { GARDEN_CATEGORIES, gardenDef, isLight, type GardenDef } from "../lib/gardenCatalogue";
import { itemsOf, placeSpot } from "../lib/siteItems";
import { surfaceArea } from "../lib/surfaceCurve";
import { addItem, newItem } from "../editor/site/gardenEdit";
import { ItemInspector, SurfaceFields } from "../editor/site/GardenInspectors";
import { GardenPicker } from "../editor/AddItem";
import { GardenThumb } from "../editor/GardenSymbol";
import { Section } from "./Section";
import { useChassis } from "./useChassis";
import "./GardenPanel.css";

const fmtArea = (a: number) => `${a.toFixed(a < 100 ? 1 : 0)} m²`;

/**
 * Garden mode's panel (sidebar, and the phone sheet): the selected item's fields, the surfaces, the items by category,
 * and an Add button that places a new item on the lawn or patio. Selection is the store's `gardenSel`, shared with the site editor.
 */
export function GardenPanel() {
  const site = useSite();
  const updateSite = useStore((s) => s.updateSite);
  const setUi = useStore((s) => s.setUi);
  const sel = useStore((s) => s.gardenSel);
  const chassis = useChassis((s) => s.chassis);
  const [picking, setPicking] = useState(false);
  if (!site) return <p className="muted small">No plot yet. Load the site in Plot mode first.</p>;

  const items = itemsOf(site);
  const placed = (def: GardenDef) => {
    const item = newItem(def, placeSpot(site));
    updateSite((st) => addItem(st, item));
    setUi({ gardenSel: [item.id] });
    setPicking(false);
  };
  const byCategory = GARDEN_CATEGORIES.map((c) => ({ c, list: items.filter((it) => gardenDef(it.type)?.category === c) })).filter((g) => g.list.length);
  const hasLights = items.some((it) => {
    const d = gardenDef(it.type);
    return !!d && isLight(d);
  });

  return (
    <div className="garden-panel">
      {sel.length > 0 && <ItemInspector ids={sel} />}

      <div className="garden-add">
        <button className={picking ? "active" : ""} aria-expanded={picking} onClick={() => setPicking(!picking)} data-garden-add>
          {picking ? "Close" : "Add to the garden"}
        </button>
        {picking && (
          <div className="garden-add-pop">
            <GardenPicker onPick={placed} />
          </div>
        )}
      </div>

      <Section id="garden.surfaces" title="Surfaces" summary={`${site.surfaces.length} · ${gardenSummary(site).split(" · ")[1]}`} defaultOpen>
        {site.surfaces.length === 0 && (
          <p className="muted small">{chassis === "phone" ? "No surfaces yet. Drawing needs a larger screen." : "None yet. Draw one in the plan: R rectangle, C circle, P polygon."}</p>
        )}
        {site.surfaces.map((s) => (
          <SurfaceRow key={s.id} surface={s} />
        ))}
      </Section>

      <Section id="garden.items" title="Items" summary={gardenSummary(site)} defaultOpen>
        {items.length === 0 && <p className="muted small">Nothing placed yet. Add furniture, plants and lights above.</p>}
        {byCategory.map(({ c, list }) => (
          <div key={c} className="garden-group">
            <h4>
              {c} <span className="muted">{list.length}</span>
            </h4>
            {list.map((it) => (
              <ItemRow key={it.id} item={it} selected={sel.includes(it.id)} onPick={() => setUi({ gardenSel: [it.id] })} />
            ))}
          </div>
        ))}
        {hasLights && <p className="muted small garden-hint">Turn on the Dusk preset in the Sun panel to see the lights glow.</p>}
      </Section>
    </div>
  );
}

function ItemRow({ item, selected, onPick }: { item: GardenItem; selected: boolean; onPick: () => void }) {
  const def = gardenDef(item.type);
  if (!def) return null;
  return (
    <button className={selected ? "garden-row active" : "garden-row"} aria-pressed={selected} data-item-row={item.id} onClick={onPick}>
      <GardenThumb def={def} size={28} />
      <span className="garden-row-name">{def.name}</span>
    </button>
  );
}

function SurfaceRow({ surface }: { surface: SiteSurface }) {
  const updateSite = useStore((s) => s.updateSite);
  return (
    <details className="garden-surface" data-surface-row={surface.id}>
      <summary>
        <span>{SURFACE_LABEL[surface.kind]}</span>
        <span className="muted small site-area">{fmtArea(surfaceArea(surface))}</span>
      </summary>
      <div className="garden-surface-body">
        <SurfaceFields surface={surface} />
        <div className="row">
          <button className="danger" onClick={() => updateSite((st) => ({ ...st, surfaces: st.surfaces.filter((x) => x.id !== surface.id) }))}>
            Remove surface
          </button>
        </div>
      </div>
    </details>
  );
}
