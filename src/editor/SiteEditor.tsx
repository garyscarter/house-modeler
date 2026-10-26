import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useChassis } from "../components/useChassis";
import { useSite, useStore } from "../store";
import { SurfaceFinishField } from "../components/SurfaceFinishField";
import { SURFACE_LABEL, type BoundaryEdge, type HouseModel, type Neighbour, type ScreenPanel, type Site, type SurfaceKind, type WallFollow, type WPt } from "../types";
import { listingSite } from "../lib/houses/listing91770873";
import { bbox, polygonArea } from "../lib/geometry";
import type { Rect } from "../lib/planMath";
import { siteWalls } from "../lib/siteWalls";
import { boundaryWallSegments, groundAlong, resolveFollow } from "../lib/wallSteps";
import { screenBand } from "../lib/screenBlocks";
import { bearingToWorld } from "../lib/sun";
import { areaOf, defaultDepths, edgesOf, houseOutlines, removeBoundaryVertex, sideClearances, simpleSite } from "../lib/site";
import { SlopeFields } from "../components/SlopeFields";
import { PlotPanel } from "../components/PlotPanel";
import { MIN_OPENING, defaultOpeningEnd, edgeLength, moveBoundaryCorner, neighbourEdgeOf, setOpeningWidth, slideCorner, type OpeningEnd } from "../lib/boundaryOpening";
import { arrowDelta, shiftPts } from "../lib/nudge";
import { ToolRail } from "./ToolRail";
import { InspectorCard } from "../components/InspectorCard";
import { Info } from "../components/Info";
import { Icon } from "../components/icons";
import { BrandMark } from "../components/BrandMark";
import { lowerSheet, raiseSheet, useCameraInsets, useCanvasCamera, useEditorKeys } from "./core";
import { slideFor, useSiteDrag } from "./site/useSiteDrag";
import { DraftRect, SelectionLayer, SiteWorld } from "./site/SiteLayers";
import type { Draft, Item, Sel, Tool } from "./site/types";
import "./SiteEditor.css";

const EDGE_LABEL: Record<BoundaryEdge["kind"], string> = { fence: "Close-board fence", wall: "Brick wall", hedge: "Hedge", open: "Open (no boundary)" };
const EDGE_DEFAULT_HEIGHT: Record<BoundaryEdge["kind"], number> = { fence: 1.8, wall: 1.8, hedge: 1.5, open: 0 };
const NICE = [0.5, 1, 2, 5, 10, 20, 50, 100];
const SITE_LIMITS = () => ({ minS: 1 / 400, maxS: 1 / 2 });

/** Top-down editor for the plot boundary, garden surfaces and neighbouring buildings, in world metres. */
export function SiteEditor() {
  const site = useSite();
  const model = useStore((s) => s.variants[s.activeVariant]);
  if (!site) return <NoSite model={model} />;
  return <SitePlan site={site} model={model} />;
}

function NoSite({ model }: { model?: HouseModel }) {
  const setSite = useStore((s) => s.setSite);
  return (
    <div className="empty">
      <BrandMark outline size={72} />
      <h2>No site yet</h2>
      <p>The site plan holds the plot boundary, garden surfaces and neighbouring buildings around the house.</p>
      <div className="row" style={{ justifyContent: "center" }}>
        <button onClick={() => setSite(listingSite())}>Load site for listing 91770873</button>
        {model && <button onClick={() => setSite(simpleSite(model, defaultDepths(model)))}>Create a simple site around the house</button>}
      </div>
    </div>
  );
}

function SitePlan({ site, model }: { site: Site; model?: HouseModel }) {
  const updateSite = useStore((s) => s.updateSite);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [drawKind, setDrawKind] = useState<SurfaceKind>("lawn");
  const [sel, setSel] = useState<Sel>(null);
  const [draft, setDraft] = useState<Draft>(null);

  const outlines = useMemo(() => (model ? houseOutlines(model) : []), [model]);
  // Clearances run from the outer wall faces (outlines carry them), not the wall centre lines.
  const clearances = useMemo(() => sideClearances(outlines, site.boundary), [outlines, site.boundary]);
  const walls = useMemo(() => (model ? siteWalls(model) : []), [model]);

  // Home: the plot, house and neighbours (not the long road) with a 2 m margin.
  const home = useMemo<Rect>(() => {
    const pts = [...site.boundary, ...outlines.flatMap((o) => o.polys.flat()), ...walls.flatMap((l) => l.walls.flatMap((w) => w.poly)), ...site.neighbours.flatMap((n) => n.polygon)];
    const b = pts.length ? bbox(pts) : { x0: -10, y0: -10, x1: 10, y1: 10, w: 20, h: 20 };
    return { x0: b.x0 - 2, y0: b.y0 - 2, x1: b.x1 + 2, y1: b.y1 + 2 };
  }, [site.boundary, site.neighbours, outlines, walls]);
  const touch = useChassis((s) => s.touch);
  const insets = useCameraInsets();
  const camera = useCanvasCamera(svgRef as unknown as RefObject<HTMLElement | null>, { home, fitKey: `site:${insets.fitSuffix}`, insetRight: insets.insetRight, insetBottom: insets.insetBottom, insetLeft: insets.insetLeft, unitsPerM: 1, limits: SITE_LIMITS, anchor: "centre", padFrac: 0 });
  const { cam, size } = camera;
  const px = camera.px; // one screen pixel in metres
  const peeking = useStore((s) => s.peek);

  const polyOf = (s: Item): WPt[] =>
    s.type === "boundary" ? site.boundary : s.type === "surface" ? site.surfaces.find((x) => x.id === s.id)?.polygon ?? [] : site.neighbours.find((x) => x.id === s.id)?.polygon ?? [];
  /** Change one polygon, working on the store's current copy so quick successive edits never use a stale one. */
  const editPoly = (s: Item, f: (poly: WPt[]) => WPt[]) =>
    updateSite((st) =>
      s.type === "boundary"
        ? { ...st, boundary: f(st.boundary) }
        : s.type === "surface"
          ? { ...st, surfaces: st.surfaces.map((x) => (x.id === s.id ? { ...x, polygon: f(x.polygon) } : x)) }
          : { ...st, neighbours: st.neighbours.map((x) => (x.id === s.id ? { ...x, polygon: f(x.polygon) } : x)) },
    );

  const deleteVertex = (s: Item, i: number) => {
    if (s.type === "boundary") updateSite((st) => removeBoundaryVertex(st, i));
    else editPoly(s, (poly) => (poly.length > 3 ? poly.filter((_, j) => j !== i) : poly));
    setSel({ ...s, vertex: null } as Sel);
  };
  const deleteItem = (s: Item) => {
    if (s.type === "surface") updateSite((st) => ({ ...st, surfaces: st.surfaces.filter((x) => x.id !== s.id) }));
    if (s.type === "neighbour") updateSite((st) => ({ ...st, neighbours: st.neighbours.filter((x) => x.id !== s.id) }));
    setSel(null);
  };

  /** Arrow-key nudge in metres: the selected corner, or a whole surface / building with no corner picked. */
  const nudge = (s: Item, dx: number, dy: number): boolean => {
    if (s.vertex !== null) {
      const i = s.vertex;
      if (!polyOf(s)[i]) return false;
      if (s.type === "boundary") {
        const slide = slideFor(site, s, i);
        updateSite((st) => {
          const c = st.boundary[i];
          if (!c) return st;
          const p = { x: c.x + dx, y: c.y + dy };
          return slide ? slideCorner(st, i, slide, p) : moveBoundaryCorner(st, i, p);
        });
      } else editPoly(s, (poly) => poly.map((o, j) => (j === i ? { x: o.x + dx, y: o.y + dy } : o)));
      return true;
    }
    if (s.type === "boundary") return false;
    editPoly(s, (poly) => shiftPts(poly, dx, dy));
    return true;
  };

  const { drag, itemDown, vertexDown, edgeDown, midDown } = useSiteDrag({ svgRef, camera, site, outlines, tool, drawKind, sel, setSel, setTool, setDraft, editPoly, deleteVertex });

  // Esc during a drag is the core's (it restores the snapshot); this runs when nothing is being dragged.
  useEditorKeys((e) => {
    const arrow = !e.ctrlKey && !e.metaKey && !e.altKey ? arrowDelta(e.key, e.shiftKey) : null;
    if (arrow) {
      if (sel && tool === "select" && nudge(sel, arrow.x, arrow.y)) e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      setSel(null);
      setDraft(null);
      setTool("select");
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "v" || k === "r" || k === "b") {
        setTool(k === "v" ? "select" : k === "r" ? "surface" : "neighbour");
        setDraft(null);
      } else if (k === "f") camera.fit();
      else if (k === "+" || k === "=") camera.zoomBy(1.4);
      else if (k === "-" || k === "_") camera.zoomBy(1 / 1.4);
    }
    if ((e.key === "Delete" || e.key === "Backspace") && sel) {
      e.preventDefault();
      if (sel.vertex !== null) deleteVertex(sel, sel.vertex);
      else deleteItem(sel);
    }
  });

  // On the phone a tap that selects a plot item brings the inspector sheet up; clearing the selection drops it.
  const selKey = sel ? `${sel.type}:${"id" in sel ? sel.id : ""}` : "";
  const prevSelKey = useRef(selKey);
  useEffect(() => {
    if (prevSelKey.current === selKey) return;
    prevSelKey.current = selKey;
    if (selKey) raiseSheet();
    else lowerSheet();
  }, [selKey]);

  const selPoly = sel ? polyOf(sel) : [];
  const north = bearingToWorld(site.frontBearing, 0);
  const northDeg = (Math.atan2(north.x, -north.z) * 180) / Math.PI;
  const scaleLen = NICE.find((n) => n / px >= 70) ?? 100;
  const cursor = tool === "select" ? "grab" : "crosshair";
  // The grid is three viewports wide, so a pan never shows past its edge.
  const vb = cam && size ? { x: cam.x, y: cam.y, w: size.w * cam.s, h: size.h * cam.s } : null;

  return (
    <div className="site-editor">
      <div className="site-editor-body">
        <div className="site-canvas">
          <svg ref={svgRef} viewBox={camera.viewBox} style={{ cursor }} className={peeking ? "peeking" : undefined} {...drag.svgProps}>
            {vb && (
              <g ref={camera.layerRef}>
                <defs>
                  <pattern id="site-grid" width={1} height={1} patternUnits="userSpaceOnUse">
                    <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#eef0f3" strokeWidth={px} />
                  </pattern>
                </defs>
                <rect x={vb.x - vb.w} y={vb.y - vb.h} width={3 * vb.w} height={3 * vb.h} fill="url(#site-grid)" />
                <SiteWorld site={site} sel={sel} tool={tool} px={px} outlines={outlines} walls={walls} clearances={clearances} onItemDown={itemDown} />
                {sel && selPoly.length > 0 && <SelectionLayer sel={sel} poly={selPoly} px={px} onEdgeDown={edgeDown} onMidDown={midDown} onVertexDown={vertexDown} />}
                {draft && <DraftRect draft={draft} px={px} />}
              </g>
            )}
          </svg>
          <div className="site-north" style={{ transform: `rotate(${northDeg}deg)` }} aria-label="North">
            <span>N</span>
            <svg viewBox="-10 -16 20 32" width={18} height={30}>
              <path d="M0 -16 L8 6 L0 1 L-8 6 Z" fill="#dc2626" />
            </svg>
          </div>
          <div className="site-scale">
            <div style={{ width: scaleLen / px }} />
            <span>{scaleLen} m</span>
          </div>
        </div>
      </div>

      {!peeking && (
        <ToolRail
          groups={[
            [{ id: "select", icon: "select", label: "Select / move", shortcut: "V", active: tool === "select", onClick: () => setTool("select") }],
            [
              { id: "surface", icon: "rect", label: "Draw surface", shortcut: "R", active: tool === "surface", onClick: () => setTool("surface") },
              { id: "neighbour", icon: "house", label: "Draw building", shortcut: "B", active: tool === "neighbour", onClick: () => setTool("neighbour") },
            ],
          ]}
          footer={
            <Info label="How this works">
              {touch
                ? "Tap a boundary edge, surface or building. Drag corners; + adds a corner. Drag the background to pan; pinch to zoom."
                : "Click a boundary edge, surface or building. Drag corners; + adds a corner. Drag the background or swipe with two fingers to pan; pinch or use the mouse wheel to zoom. Arrows nudge the selected corner or shape (Shift ×10)."}
            </Info>
          }
        />
      )}

      <div className="site-zoom float-card" role="group" aria-label="Zoom">
        {!touch && (
          <>
            <button type="button" className="icon-btn" onClick={() => camera.zoomBy(1.4)} aria-label="Zoom in (+)" title="Zoom in (+)">
              <Icon name="zoomIn" size={20} />
            </button>
            <button type="button" className="icon-btn" onClick={() => camera.zoomBy(1 / 1.4)} aria-label="Zoom out (−)" title="Zoom out (−)">
              <Icon name="zoomOut" size={20} />
            </button>
          </>
        )}
        <button type="button" className="icon-btn" onClick={() => camera.fit()} aria-label="Fit the plot (F)" title="Fit the plot (F)">
          <Icon name="fit" size={20} />
        </button>
      </div>

      {!peeking && tool === "select" && drag.kind === "poly-edge" && (
        <div className="site-status float-card" role="status">
          <span>{touch ? "Drag to move the edge" : "Drag to move the edge · Esc cancels"}</span>
        </div>
      )}
      {!peeking && tool !== "select" && (
        <div className="site-status float-card" role="status">
          <span>Drag out a rectangle.</span>
          {tool === "surface" && (
            <select value={drawKind} onChange={(e) => setDrawKind(e.target.value as SurfaceKind)} aria-label="Surface to draw">
              {(Object.keys(SURFACE_LABEL) as SurfaceKind[]).map((k) => (
                <option key={k} value={k}>
                  {SURFACE_LABEL[k]}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <InspectorCard className="side site-side" title="Plot">
        <Inspector site={site} sel={sel} onDeleteVertex={deleteVertex} onDeleteItem={deleteItem} clearances={clearances} />
      </InspectorCard>
    </div>
  );
}


function Inspector({
  site,
  sel,
  onDeleteVertex,
  onDeleteItem,
  clearances,
}: {
  site: Site;
  sel: Sel;
  onDeleteVertex: (s: NonNullable<Sel>, i: number) => void;
  onDeleteItem: (s: NonNullable<Sel>) => void;
  clearances: ReturnType<typeof sideClearances>;
}) {
  const updateSite = useStore((s) => s.updateSite);
  const num = (v: string, f: number) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : f);
  const corners =
    sel?.type === "boundary"
      ? site.boundary.length
      : (sel?.type === "surface" ? site.surfaces.find((x) => x.id === sel.id) : site.neighbours.find((x) => x.id === sel?.id))?.polygon.length ?? 0;
  const vertexButton = sel && sel.vertex !== null && (
    <button onClick={() => onDeleteVertex(sel, sel.vertex!)} disabled={corners <= 3}>
      Delete corner {sel.vertex + 1}
    </button>
  );

  if (sel?.type === "boundary") {
    const edges = edgesOf(site);
    const i = sel.edge;
    const setEdge = (p: Partial<BoundaryEdge>) =>
      updateSite((st) => {
        const list = edgesOf(st).map((e, j) => (j === i ? { ...e, ...p } : e));
        return { ...st, boundaryEdges: list };
      });
    return (
      <div className="inspector">
        <h4>Plot boundary</h4>
        <p className="muted small">{areaOf(site.boundary).toFixed(1)} m² inside the boundary.</p>
        {i !== null && edges[i] && (
          <>
            <p className="small">
              Edge {i + 1} of {site.boundary.length},{" "}
              {Math.hypot(site.boundary[(i + 1) % site.boundary.length].x - site.boundary[i].x, site.boundary[(i + 1) % site.boundary.length].y - site.boundary[i].y).toFixed(2)} m long
            </p>
            <label>
              Treatment
              <select
                value={edges[i].kind}
                onChange={(e) => {
                  const kind = e.target.value as BoundaryEdge["kind"];
                  setEdge({ kind, height: kind === "open" ? 0 : edges[i].height || EDGE_DEFAULT_HEIGHT[kind] });
                }}
              >
                {(Object.keys(EDGE_LABEL) as BoundaryEdge["kind"][]).map((k) => (
                  <option key={k} value={k}>
                    {EDGE_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            {edges[i].kind !== "open" && (
              <label>
                Height (m)
                <input type="number" step={0.1} min={0.3} max={4} value={edges[i].height} onChange={(e) => setEdge({ height: Math.max(0.1, num(e.target.value, edges[i].height)) })} />
              </label>
            )}
            <OpeningWidth site={site} edge={i} />
            {edges[i].kind === "open" && (
              <label>
                Wall ends beside the gap
                <select value={edges[i].endFinish ?? "plain"} onChange={(e) => setEdge({ endFinish: e.target.value as "plain" | "pier" })}>
                  <option value="plain">Plain (cut brickwork)</option>
                  <option value="pier">Brick pier at each end</option>
                </select>
              </label>
            )}
            {edges[i].kind === "wall" && (
              <>
                <label>
                  Top
                  <select value={edges[i].top ?? "coping"} onChange={(e) => setEdge({ top: e.target.value as "coping" | "brick" })}>
                    <option value="coping">Coping</option>
                    <option value="brick">Brick on edge</option>
                  </select>
                </label>
                <label className="check">
                  <input type="checkbox" checked={edges[i].piers ?? true} onChange={(e) => setEdge({ piers: e.target.checked })} />
                  Piers
                </label>
                <ScreenBlocks site={site} edge={i} setEdge={setEdge} />
              </>
            )}
            {(edges[i].kind === "wall" || edges[i].kind === "fence") && <FollowGround site={site} edge={i} setEdge={setEdge} />}
          </>
        )}
        <div className="row">{vertexButton}</div>
        <Clearances clearances={clearances} />
      </div>
    );
  }
  if (sel?.type === "surface") {
    const s = site.surfaces.find((x) => x.id === sel.id);
    if (!s) return <EmptyInspector />;
    return (
      <div className="inspector">
        <h4>Garden surface</h4>
        <label>
          Surface
          <select value={s.kind} onChange={(e) => updateSite((st) => ({ ...st, surfaces: st.surfaces.map((x) => (x.id === s.id ? { ...x, kind: e.target.value as SurfaceKind } : x)) }))}>
            {(Object.keys(SURFACE_LABEL) as SurfaceKind[]).map((k) => (
              <option key={k} value={k}>
                {SURFACE_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <SurfaceFinishField surface={s} onChange={(finish) => updateSite((st) => ({ ...st, surfaces: st.surfaces.map((x) => (x.id === s.id ? { ...x, finish } : x)) }))} />
        <SlopeFields surface={s} onChange={(slope) => updateSite((st) => ({ ...st, surfaces: st.surfaces.map((x) => (x.id === s.id ? { ...x, slope } : x)) }))} />
        <p className="muted small">{areaOf(s.polygon).toFixed(1)} m². Drag it to move it.</p>
        <div className="row">
          {vertexButton}
          <button className="danger" onClick={() => onDeleteItem(sel)}>
            Delete surface
          </button>
        </div>
      </div>
    );
  }
  if (sel?.type === "neighbour") {
    const n = site.neighbours.find((x) => x.id === sel.id);
    if (!n) return <EmptyInspector />;
    const set = (p: Partial<Neighbour>) => updateSite((st) => ({ ...st, neighbours: st.neighbours.map((x) => (x.id === n.id ? { ...x, ...p } : x)) }));
    return (
      <div className="inspector">
        <h4>Neighbouring building</h4>
        <label>
          Name
          <input type="text" value={n.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label>
          Eaves height above the ground (m)
          <input type="number" step={0.1} min={0.5} max={20} value={n.eaves} onChange={(e) => set({ eaves: Math.max(0.5, num(e.target.value, n.eaves)) })} />
        </label>
        <p className="muted small">About 2.5 m for a single storey, 5.3 m for two.</p>
        <label>
          Roof
          <select value={n.roof} onChange={(e) => set({ roof: e.target.value as Neighbour["roof"] })}>
            <option value="hip">Hipped</option>
            <option value="gable">Gabled</option>
            <option value="flat">Flat</option>
          </select>
        </label>
        {n.roof !== "flat" && (
          <>
            <label>
              Pitch (degrees)
              <input type="number" min={10} max={60} value={n.pitchDeg ?? 35} onChange={(e) => set({ pitchDeg: Math.min(60, Math.max(5, num(e.target.value, 35))) })} />
            </label>
            <label>
              Ridge runs
              <select value={n.ridgeAxis ?? "auto"} onChange={(e) => set({ ridgeAxis: e.target.value as Neighbour["ridgeAxis"] })}>
                <option value="auto">Along the longer side</option>
                <option value="x">Left–right</option>
                <option value="z">Front–back</option>
              </select>
            </label>
            <label>
              Party wall
              <select value={n.partySide ?? "none"} onChange={(e) => set({ partySide: e.target.value as Neighbour["partySide"] })}>
                <option value="none">None (detached)</option>
                <option value="left">On its left side</option>
                <option value="right">On its right side</option>
              </select>
            </label>
          </>
        )}
        <p className="muted small">{areaOf(n.polygon).toFixed(1)} m² footprint. Drag it to move it.</p>
        <div className="row">
          {vertexButton}
          <button className="danger" onClick={() => onDeleteItem(sel)}>
            Delete building
          </button>
        </div>
      </div>
    );
  }
  return <EmptyInspector />;
}

/** Typed width of the selected edge. One end slides along the wall next to it, so the boundary line holds. */
function OpeningWidth({ site, edge }: { site: Site; edge: number }) {
  const updateSite = useStore((s) => s.updateSite);
  const [pick, setPick] = useState<{ edge: number; end: OpeningEnd } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const n = site.boundary.length;
  const end = pick && pick.edge === edge ? pick.end : defaultOpeningEnd(site, edge);
  const width = edgeLength(site, edge);
  const nb = neighbourEdgeOf(site, edge, end);
  // "Left" and "right" by where the two corners sit on the plan.
  const a = site.boundary[edge];
  const b = site.boundary[(edge + 1) % n];
  const startIsLeft = a.x <= b.x;
  const endLabel = (e: OpeningEnd) => ((e === "start") === startIsLeft ? "left end" : "right end");
  const apply = (v: string, e: OpeningEnd) => {
    const w = parseFloat(v);
    if (Number.isFinite(w)) updateSite((st) => setOpeningWidth(st, edge, w, e));
  };
  return (
    <>
      <label>
        Width (m)
        <input
          type="number"
          step={0.05}
          min={MIN_OPENING}
          value={draft ?? width.toFixed(2)}
          onChange={(e) => {
            setDraft(e.target.value);
            apply(e.target.value, end);
          }}
          onBlur={() => setDraft(null)}
        />
      </label>
      <label>
        Move
        <select value={end} onChange={(e) => setPick({ edge, end: e.target.value as OpeningEnd })}>
          {(["start", "end"] as OpeningEnd[]).map((e) => (
            <option key={e} value={e}>
              {endLabel(e)}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small hint-row">
        Slides along edge {nb + 1} ({edgeLength(site, nb).toFixed(2)} m)
        <Info>
          Slides that end along edge {nb + 1}, so the boundary line stays put. Drive and lawn corners follow.
          {edgesOf(site)[edge].kind === "open" && " Dragging an end of a selected opening does the same."}
        </Info>
      </p>
    </>
  );
}

// The plot panel below already shows the variant note and the house-to-boundary distances.
function EmptyInspector() {
  return (
    <div className="inspector">
      <h4>
        Site plan
        <Info>Click a boundary edge to set its fence, wall or hedge; click a surface or building to edit it. Corners snap to the house and to each other.</Info>
      </h4>
      <PlotPanel />
    </div>
  );
}

function Clearances({ clearances }: { clearances: ReturnType<typeof sideClearances> }) {
  if (!clearances.length) return null;
  return (
    <>
      <h4>
        House to boundary
        <Info>Shortest distance from each side of the house (any floor) to the boundary.</Info>
      </h4>
      <table className="site-clear">
        <tbody>
          {clearances.map((c) => (
            <tr key={c.side}>
              <td>{c.side[0].toUpperCase() + c.side.slice(1)}</td>
              <td>{c.distance < 0.05 ? "on the boundary" : `${c.distance.toFixed(2)} m`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/**
 * Pierced screen blocks let into the top of a wall, under its top course: none,
 * one row or two, along the whole edge or a stretch of it.
 */
function ScreenBlocks({ site, edge, setEdge }: { site: Site; edge: number; setEdge: (p: Partial<BoundaryEdge>) => void }) {
  const e = edgesOf(site)[edge];
  const n = site.boundary.length;
  const a = site.boundary[edge];
  const b = site.boundary[(edge + 1) % n];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const s = e.screen;
  const num = (v: string) => (Number.isFinite(parseFloat(v)) ? Math.max(0, parseFloat(v)) : undefined);
  const set = (p: Partial<ScreenPanel>) => setEdge({ screen: s ? { ...s, ...p } : undefined });
  const whole = !s || (s.from === undefined && s.length === undefined);
  return (
    <>
      <label>
        Screen blocks in the top
        <select
          value={s ? s.rows : 0}
          onChange={(ev) => {
            const rows = parseInt(ev.target.value, 10);
            setEdge({ screen: rows === 1 || rows === 2 ? { ...(s ?? {}), rows } : undefined });
          }}
        >
          <option value={0}>None</option>
          <option value={1}>One row (290 mm)</option>
          <option value={2}>Two rows (580 mm)</option>
        </select>
      </label>
      {s && (
        <>
          <label>
            Along
            <select value={whole ? "all" : "part"} onChange={(ev) => setEdge({ screen: ev.target.value === "all" ? { rows: s.rows } : { rows: s.rows, from: 0, length: Math.min(len, 1.16) } })}>
              <option value="all">The whole edge</option>
              <option value="part">Part of the edge</option>
            </select>
          </label>
          {!whole && (
            <div className="row">
              <label>
                From (m)
                <input type="number" step={0.05} min={0} max={len} value={s.from ?? 0} onChange={(ev) => set({ from: num(ev.target.value) ?? 0 })} />
              </label>
              <label>
                Length (m)
                <input type="number" step={0.29} min={0.29} max={len} value={s.length ?? len} onChange={(ev) => set({ length: num(ev.target.value) })} />
              </label>
            </div>
          )}
          <p className="muted small">
            {screenBand(e, len, e.top === "brick" ? 0.1025 : 0.06)
              ? "Whole 290 mm blocks under the top course, with brick below them; the wall is see-through there."
              : "No blocks fit: the wall needs at least 0.3 m of brick under them, and room for one block along the edge."}
          </p>
        </>
      )}
    </>
  );
}

const FOLLOW_LABEL: Record<WallFollow, string> = { level: "Level top", step: "Stepped in brick courses", rake: "Sloping with the ground" };

/**
 * How a wall's or fence's top meets sloping ground beside it: automatic (a wall
 * steps beside sloping ground, otherwise level), level, stepped or raked, and
 * for steps, how long each level run is.
 */
function FollowGround({ site, edge, setEdge }: { site: Site; edge: number; setEdge: (p: Partial<BoundaryEdge>) => void }) {
  const e = edgesOf(site)[edge];
  const [draft, setDraft] = useState<string | null>(null);
  const n = site.boundary.length;
  const ground = useMemo(
    () => groundAlong(site.boundary[edge], site.boundary[(edge + 1) % n], site.surfaces, polygonArea(site.boundary)),
    [site.boundary, site.surfaces, edge, n],
  );
  const auto = resolveFollow({ kind: e.kind }, ground);
  const follow = resolveFollow(e, ground);
  const hs = ground.map((g) => g.plot);
  const climb = hs.length ? Math.max(...hs) - Math.min(...hs) : 0;
  const steps = follow === "step" ? boundaryWallSegments(site.boundary, e, edge, site.surfaces).length - 1 : 0;
  return (
    <>
      <label>
        Top along the ground
        <select value={e.follow ?? "auto"} onChange={(ev) => setEdge({ follow: ev.target.value === "auto" ? undefined : (ev.target.value as WallFollow) })}>
          <option value="auto">Automatic ({FOLLOW_LABEL[auto].toLowerCase()})</option>
          {(Object.keys(FOLLOW_LABEL) as WallFollow[]).map((k) => (
            <option key={k} value={k}>
              {FOLLOW_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      {follow === "step" && (
        <label>
          Steps every (m)
          <input
            type="number"
            step={0.05}
            min={0.9}
            placeholder="auto"
            value={draft ?? (e.stepEvery !== undefined ? String(e.stepEvery) : "")}
            onChange={(ev) => {
              setDraft(ev.target.value);
              const v = parseFloat(ev.target.value);
              setEdge({ stepEvery: Number.isFinite(v) && v > 0 ? v : undefined });
            }}
            onBlur={() => setDraft(null)}
          />
        </label>
      )}
      <p className="muted small">
        {climb < 0.01
          ? "The ground beside it is level."
          : `The ground beside it climbs ${Math.round(climb * 1000)} mm.` +
            (follow === "step"
              ? ` ${steps === 0 ? "No step needed" : `${steps} step${steps > 1 ? "s" : ""} up`}. Leave "steps every" blank to step each time the ground climbs a 75 mm course, at least 0.9 m apart.`
              : "")}
      </p>
    </>
  );
}
