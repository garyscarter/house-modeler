import { useMemo, useRef, useState } from "react";
import { ask } from "./Dialogs";
import { useSite, useStore } from "../store";
import { SiteVariantNote } from "./SiteVariantNote";
import { freshSiteFor, hasPlotEdits, isListingPlot, isStaleSite } from "../lib/sitePreset";
import { siteSource } from "../lib/sites";
import { updateSitePreset } from "../lib/presetActions";
import { confirmBoundaryUpdates } from "./startupDialog";
import type { HouseModel, Neighbour, Site, VariantKey } from "../types";
import { useCurrentHouse } from "../lib/house";
import { compassPoint } from "../lib/sun";
import { areaOf, defaultDepths, gardenArea, houseOutlines, sideClearances, simpleSite, type PlotDepths } from "../lib/site";
import { useSiteView } from "../three/siteView";
import { Info } from "./Info";
import { Section } from "./Section";
import "./SitePanel.css";

const fmtArea = (a: number) => `${a.toFixed(a < 100 ? 1 : 0)} m²`;
const num = (v: string, fallback: number) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Plot, orientation, location, neighbours and garden surfaces. */
export function SitePanel() {
  const site = useSite();
  const setSite = useStore((s) => s.setSite);
  const updateSite = useStore((s) => s.updateSite);
  const model = useStore((s) => s.variants[s.activeVariant]);
  const setUi = useStore((s) => s.setUi);
  const tab = useStore((s) => s.tab);
  const setMode = useStore((s) => s.setMode);
  const ghost = useSiteView((s) => s.ghostNeighbours);
  const trueColours = useSiteView((s) => s.trueNeighbourColours);
  const setSiteView = useSiteView((s) => s.setSiteView);
  const house = useCurrentHouse();

  const loadListing = async () => {
    if (!site || (await ask(`Replace the current site with the one for ${house.name}?`, { ok: "Replace" }))) setSite(house.sitePresets[house.site].build());
  };

  return (
    <div className="panel site-panel">
      <h3 className="with-info">
        Site
        <Info>
          The site holds the plot boundary, garden, neighbouring buildings and which way the house faces. It drives the sun study and the boundary distances in
          the site plan.
        </Info>
      </h3>
      <SiteVariantNote />
      <StalePlotNote />
      {!site ? (
        <>
          <button onClick={loadListing}>Load site for {house.name}</button>
          {model && <SimpleSiteForm model={model} site={site} />}
        </>
      ) : (
        <>
          <div className="row">
            {tab !== "plan" && (
              <button onClick={() => {
                  setUi({ tab: "plan" });
                  setMode("plot");
                }}>Edit the site plan</button>
            )}
            <label className="check site-inline">
              <input type="checkbox" checked={ghost} onChange={(e) => setSiteView({ ghostNeighbours: e.target.checked })} /> See-through neighbours
            </label>
            <label className="check site-inline">
              <input type="checkbox" checked={trueColours} onChange={(e) => setSiteView({ trueNeighbourColours: e.target.checked })} /> Neighbours in their own colours
            </label>
          </div>

          <h4 className="with-info">
            Orientation
            <Info>Drag the dial or type a bearing. North is up on the dial and the arrow is the front of the house.</Info>
          </h4>
          <div className="site-orient">
            <CompassDial bearing={site.frontBearing} onChange={(b) => updateSite({ frontBearing: b })} />
            <div className="site-orient-fields">
              <label>
                Front of the house faces
                <span className="site-bearing">
                  <span className="pair-input">
                    <input
                      type="number"
                      min={0}
                      max={359}
                      value={Math.round(site.frontBearing)}
                      aria-label="Bearing in degrees"
                      onChange={(e) => updateSite({ frontBearing: ((num(e.target.value, site.frontBearing) % 360) + 360) % 360 })}
                    />
                    <span className="pair-unit" aria-hidden="true">
                      °
                    </span>
                  </span>
                  <span className="compass-chip">{compassPoint(site.frontBearing)}</span>
                </span>
              </label>
            </div>
          </div>

          <Section id="plot.location" title="Location" summary={`${site.latitude.toFixed(2)}, ${site.longitude.toFixed(2)}`}>
            <div className="site-latlon">
              <label>
                Latitude
                <input type="number" step={0.01} min={-90} max={90} value={site.latitude} onChange={(e) => updateSite({ latitude: num(e.target.value, site.latitude) })} />
              </label>
              <label>
                Longitude
                <input type="number" step={0.01} min={-180} max={180} value={site.longitude} onChange={(e) => updateSite({ longitude: num(e.target.value, site.longitude) })} />
              </label>
            </div>
            <p className="muted small">The town is close enough for the location; east is positive longitude.</p>
          </Section>

          <SiteFigures site={site} model={model} />

          <h4>Neighbouring buildings</h4>
          {site.neighbours.length === 0 && <p className="muted small">None yet. Draw them in the site plan.</p>}
          {site.neighbours.map((n) => (
            <NeighbourRow key={n.id} n={n} onChange={(p) => updateSite((s) => ({ ...s, neighbours: s.neighbours.map((x) => (x.id === n.id ? { ...x, ...p } : x)) }))} onRemove={() => updateSite((s) => ({ ...s, neighbours: s.neighbours.filter((x) => x.id !== n.id) }))} />
          ))}

          <p className="muted small">Garden surfaces, planting and furniture are in Garden mode.</p>

          <h4>Start again</h4>
          <div className="row">
            <button onClick={loadListing}>Load site for {house.name}</button>
            <button
              className="danger"
              onClick={async () => {
                if (await ask("Clear the site? Undo can bring it back.", { ok: "Clear", danger: true })) setSite(undefined);
              }}
            >
              Clear site
            </button>
          </div>
          <BoundaryUpdateAction />
          {model && <SimpleSiteForm model={model} site={site} />}
        </>
      )}
    </div>
  );
}

/** Plot and garden areas and the distance from each side of the house to the boundary. */
/** Shown when the plot on screen is an older copy of the house's built-in one. */
function StalePlotNote() {
  const house = useCurrentHouse();
  const sites = useStore((s) => s.sites);
  const variants = useStore((s) => s.variants);
  const active = useStore((s) => s.activeVariant);
  // The layout whose plot is on screen: Proposed may be borrowing As listed's.
  const source = siteSource(sites, active);
  const site = source ? sites[source] : undefined;
  const model = source ? variants[source] : undefined;
  const stale = useMemo(() => isStaleSite(site, model), [site, model]);
  // A plot that differs from the built-in one beyond its fences and walls may hold edits worth keeping.
  const edited = useMemo(() => {
    const fresh = site && stale ? freshSiteFor(site) : undefined;
    return !!site && !!fresh && hasPlotEdits(site, fresh);
  }, [site, stale]);
  if (!source || !stale) return null;
  const update = async () => {
    if (await ask(`Replace this plot with the latest one for ${house.name}? Your edits to the plot are lost. You can undo it.`, { ok: "Update" })) updateSitePreset(source);
  };
  return (
    <div className="note small site-stale-note">
      <p>A newer plot for {house.name} is available.</p>
      <div className="row">
        <button onClick={update}>Update the plot</button>
        {edited && <BoundaryUpdateButton source={source} label="Update the boundaries and neighbours only (keep my edits)" />}
      </div>
    </div>
  );
}

/** Brings a plot's walls, fences, hedges and neighbouring buildings up to the latest built-in ones after showing what changes; the rest of the plot is kept. */
function BoundaryUpdateButton({ source, label }: { source: VariantKey; label: string }) {
  return (
    <button
      title="Updates the walls, fences and hedges and the neighbouring buildings' measurements, and keeps your corners, drive opening and other edits"
      onClick={async () => (await confirmBoundaryUpdates([source]))?.()}
    >
      {label}
    </button>
  );
}

/** Always-available boundary update, for a plot that is the built-in house's (or a copy of it) even when it is not flagged out of date. */
function BoundaryUpdateAction() {
  const house = useCurrentHouse();
  const sites = useStore((s) => s.sites);
  const variants = useStore((s) => s.variants);
  const active = useStore((s) => s.activeVariant);
  const source = siteSource(sites, active);
  const site = source ? sites[source] : undefined;
  const model = source ? variants[source] : undefined;
  const show = useMemo(() => isListingPlot(site, model), [site, model]);
  if (!source || !show) return null;
  return (
    <div className="site-boundary-update">
      <BoundaryUpdateButton source={source} label={`Update boundaries and neighbours from ${house.name}`} />
      <span className="muted small">Brings the walls, fences, hedges and neighbouring buildings up to date and keeps your other plot edits.</span>
    </div>
  );
}

function SiteFigures({ site, model }: { site: Site; model?: HouseModel }) {
  const figures = useMemo(() => {
    const outlines = model ? houseOutlines(model) : [];
    const ground = outlines[0]?.polys ?? [];
    const plot = site.boundary.length >= 3 ? areaOf(site.boundary) : 0;
    const garden = gardenArea(site.boundary, [...ground, ...site.neighbours.map((n) => n.polygon)]);
    return { plot, garden, sides: sideClearances(outlines, site.boundary) };
  }, [site.boundary, site.neighbours, model]);
  const order = ["front", "rear", "left", "right"] as const;
  return (
    <>
      <div className="site-figures">
        <div>
          <span className="muted">Plot</span>
          <b>{fmtArea(figures.plot)}</b>
        </div>
        <div>
          <span className="muted">Garden</span>
          <b>{fmtArea(figures.garden)}</b>
        </div>
      </div>
      <div className="site-gaps">
        <span className="muted">House to boundary</span>
        {order.map((side) => {
          const c = figures.sides.find((x) => x.side === side);
          return (
            <div key={side}>
              <span className="muted small">{side}</span>
              <b>{c ? (c.distance < 0.05 ? "0" : c.distance.toFixed(2)) : "–"}</b>
              <span className="muted gap-note">{c && c.distance < 0.05 ? "on boundary" : " "}</span>
            </div>
          );
        })}
        <span className="muted small">Shortest distance, metres</span>
      </div>
    </>
  );
}

function NeighbourRow({ n, onChange, onRemove }: { n: Neighbour; onChange: (p: Partial<Neighbour>) => void; onRemove: () => void }) {
  return (
    <div className="site-item site-neighbour">
      <input className="site-name" type="text" value={n.name} onChange={(e) => onChange({ name: e.target.value })} aria-label="Name" />
      <span className="site-unit">
        <input type="number" step={0.1} min={1} max={20} value={n.eaves} onChange={(e) => onChange({ eaves: Math.max(0.5, num(e.target.value, n.eaves)) })} aria-label="Eaves height in metres" />m
      </span>
      <select value={n.roof} onChange={(e) => onChange({ roof: e.target.value as Neighbour["roof"] })} aria-label="Roof">
        <option value="hip">Hipped</option>
        <option value="gable">Gabled</option>
        <option value="flat">Flat</option>
      </select>
      <button className="site-remove" onClick={onRemove} aria-label={`Remove ${n.name}`}>
        ✕
      </button>
    </div>
  );
}

/** A rectangular plot with editable garden depths around the active variant. */
function SimpleSiteForm({ model, site }: { model: HouseModel; site: Site | undefined }) {
  const setSite = useStore((s) => s.setSite);
  const [depths, setDepths] = useState<PlotDepths>(() => defaultDepths(model));
  const [open, setOpen] = useState(!site);
  if (!open) {
    return (
      <button className="link" onClick={() => setOpen(true)}>
        Create a simple site around the house…
      </button>
    );
  }
  const field = (k: keyof PlotDepths, label: string) => (
    <label>
      {label}
      <input type="number" step={0.5} min={0} max={100} value={depths[k]} onChange={(e) => setDepths({ ...depths, [k]: Math.max(0, num(e.target.value, depths[k])) })} />
    </label>
  );
  return (
    <div className="site-simple">
      <p className="small with-info">
        Garden depths (m)
        <Info>A rectangular plot with lawns front and back, a pavement and road. Garden depths are in metres from the house.</Info>
      </p>
      <div className="site-depths">
        {field("front", "Front")}
        {field("rear", "Rear")}
        {field("left", "Left")}
        {field("right", "Right")}
      </div>
      <button
        onClick={async () => {
          if (site && !(await ask("Replace the current site with a simple rectangular plot?", { ok: "Replace" }))) return;
          setSite(simpleSite(model, depths, site));
        }}
      >
        Create a simple site around the house
      </button>
    </div>
  );
}

/**
 * Compass dial for the way the front of the house faces: north is up, the
 * arrow is the front. Drag anywhere on it to turn (1 degree steps).
 */
function CompassDial({ bearing, onChange }: { bearing: number; onChange: (b: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const fromEvent = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    onChange((Math.round((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360);
  };
  return (
    <svg
      ref={ref}
      className="site-dial"
      viewBox="-50 -50 100 100"
      role="slider"
      aria-label="Direction the front of the house faces"
      aria-valuenow={Math.round(bearing)}
      aria-valuemin={0}
      aria-valuemax={359}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange((Math.round(bearing) + 359) % 360);
        if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange((Math.round(bearing) + 1) % 360);
      }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        fromEvent(e);
      }}
      onPointerMove={(e) => dragging.current && fromEvent(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <circle r={46} className="dial-face" />
      {Array.from({ length: 36 }, (_, i) => (
        <line key={i} y1={-46} y2={i % 9 === 0 ? -38 : -42} transform={`rotate(${i * 10})`} className="dial-tick" />
      ))}
      {(
        [
          ["N", 0, -29],
          ["E", 29, 0],
          ["S", 0, 29],
          ["W", -29, 0],
        ] as const
      ).map(([l, x, y]) => (
        <text key={l} x={x} y={y} className={l === "N" ? "dial-n" : "dial-l"} textAnchor="middle" dominantBaseline="central">
          {l}
        </text>
      ))}
      <g transform={`rotate(${bearing})`}>
        {/* House seen from above with its front towards the arrow. */}
        <rect x={-9} y={-6} width={18} height={14} rx={1.5} className="dial-house" />
        <path d="M0 -40 L7 -26 L-7 -26 Z" className="dial-arrow" />
        <line y1={-26} y2={-6} className="dial-shaft" />
      </g>
    </svg>
  );
}
