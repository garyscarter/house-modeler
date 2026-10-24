import { useEffect, useMemo, useRef, useState } from "react";
import { holdUndo, useSite, useStore } from "../store";
import { svgPoints } from "../lib/planMath";
import { wheelClassifier, wheelPixels } from "../lib/wheelGesture";
import { SurfaceFinishField } from "../components/SurfaceFinishField";
import { SURFACE_LABEL, uid, type BoundaryEdge, type HouseModel, type Neighbour, type Site, type SurfaceKind, type WallFollow, type WPt } from "../types";
import { listingSite } from "../lib/houses/listing91770873";
import { bbox, polygonArea, polygonCentroid } from "../lib/geometry";
import { siteWalls } from "../lib/siteWalls";
import { boundaryWallSegments, groundAlong, resolveFollow } from "../lib/wallSteps";
import { bearingToWorld } from "../lib/sun";
import {
  areaOf,
  defaultDepths,
  edgesOf,
  houseOutlines,
  insertBoundaryVertex,
  rectPoly,
  removeBoundaryVertex,
  sideClearances,
  edgeNormal,
  simpleSite,
  slideEdge,
  snapEdgeOffset,
} from "../lib/site";
import { SlopeFields } from "../components/SlopeFields";
import { PlotPanel } from "../components/PlotPanel";
import {
  MIN_OPENING,
  defaultOpeningEnd,
  edgeLength,
  moveBoundaryCorner,
  neighbourEdgeOf,
  setOpeningWidth,
  slideCorner,
  type OpeningEnd,
  type SlideAlong,
} from "../lib/boundaryOpening";
import { arrowDelta, keyBelongsElsewhere, shiftPts } from "../lib/nudge";
import { ToolRail } from "./ToolRail";
import { InspectorCard } from "../components/InspectorCard";
import { Info } from "../components/Info";
import { Icon } from "../components/icons";
import { BrandMark } from "../components/BrandMark";
import "./SiteEditor.css";

type Tool = "select" | "surface" | "neighbour";
type Sel =
  | { type: "boundary"; edge: number | null; vertex: number | null }
  | { type: "surface" | "neighbour"; id: string; vertex: number | null }
  | null;
type Drag =
  | { kind: "vertex"; sel: NonNullable<Sel>; index: number; slide?: SlideAlong }
  | { kind: "move"; sel: NonNullable<Sel>; start: WPt; orig: WPt[] }
  | { kind: "edge"; sel: NonNullable<Sel>; index: number; orig: WPt[]; start: WPt; snapshot: Site }
  | { kind: "pan"; sx: number; sy: number; cx: number; cy: number; moved: boolean }
  | { kind: "rect"; start: WPt }
  | { kind: "pinch"; d0: number; ppm0: number; world: WPt };

const EDGE_LABEL: Record<BoundaryEdge["kind"], string> = { fence: "Close-board fence", wall: "Brick wall", hedge: "Hedge", open: "Open (no boundary)" };
const EDGE_DEFAULT_HEIGHT: Record<BoundaryEdge["kind"], number> = { fence: 1.8, wall: 1.8, hedge: 1.5, open: 0 };
const SURFACE_FILL: Record<SurfaceKind, string> = {
  lawn: "#a7cf8e",
  patio: "#e3d6bc",
  drive: "#c9a89a",
  path: "#ddd6c8",
  bed: "#8f7a5c",
  pavement: "#d4d6d9",
  road: "#7d8086",
};
const SNAP_PX = 10;
const NICE = [0.5, 1, 2, 5, 10, 20, 50, 100];

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
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<{ cx: number; cy: number; ppm: number } | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [drawKind, setDrawKind] = useState<SurfaceKind>("lawn");
  const [sel, setSel] = useState<Sel>(null);
  const [draft, setDraft] = useState<{ a: WPt; b: WPt } | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<Drag["kind"] | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const outlines = useMemo(() => (model ? houseOutlines(model) : []), [model]);
  // Clearances run from the outer wall faces (outlines carry them), not the wall centre lines.
  const clearances = useMemo(() => sideClearances(outlines, site.boundary), [outlines, site.boundary]);
  const walls = useMemo(() => (model ? siteWalls(model) : []), [model]);

  // Fit the plot, house and neighbours (not the long road): on first show and on "Fit".
  const fitView = (w: number, h: number) => {
    const pts = [...site.boundary, ...outlines.flatMap((o) => o.polys.flat()), ...walls.flatMap((l) => l.walls.flatMap((w) => w.poly)), ...site.neighbours.flatMap((n) => n.polygon)];
    const b = pts.length ? bbox(pts) : { x0: -10, y0: -10, x1: 10, y1: 10, w: 20, h: 20 };
    const ppm = Math.max(2, Math.min(400, Math.min(w / (b.w + 4), h / (b.h + 4))));
    return { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, ppm };
  };
  const fitRef = useRef(fitView);
  fitRef.current = fitView;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      setSize({ w, h });
      setView((cur) => cur ?? fitRef.current(w, h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const v = view ?? { cx: 0, cy: 0, ppm: 20 };
  const vb = { x: v.cx - size.w / 2 / v.ppm, y: v.cy - size.h / 2 / v.ppm, w: size.w / v.ppm, h: size.h / v.ppm };
  const px = 1 / v.ppm; // one screen pixel in metres

  const toWorld = (e: { clientX: number; clientY: number }): WPt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: vb.x + (e.clientX - r.left) * px, y: vb.y + (e.clientY - r.top) * px };
  };

  const peeking = useStore((s) => s.peek);
  /** Zoom about the centre of the view (the zoom buttons and the +/- keys). */
  const zoomBy = (factor: number) => setView((c) => (c ? { ...c, ppm: Math.max(2, Math.min(400, c.ppm * factor)) } : c));

  // A trackpad two-finger swipe pans; a pinch or a mouse wheel zooms about the cursor (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const intentOf = wheelClassifier();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { dx, dy } = wheelPixels(e);
      if (intentOf(e, e.timeStamp) === "pan") {
        setView((c) => (c ? { ...c, cx: c.cx + dx / c.ppm, cy: c.cy + dy / c.ppm } : c));
        return;
      }
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left - r.width / 2;
      const sy = e.clientY - r.top - r.height / 2;
      const k = e.ctrlKey ? 0.01 : 0.0015;
      setView((c) => {
        if (!c) return c;
        const ppm = Math.max(2, Math.min(400, c.ppm * Math.exp(-dy * k)));
        return { cx: c.cx + sx / c.ppm - sx / ppm, cy: c.cy + sy / c.ppm - sy / ppm, ppm };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /** Snap to a nearby corner of the house, boundary, surfaces or neighbours (except the one being dragged). */
  const snap = (p: WPt, skip?: { sel: NonNullable<Sel>; index: number }, skipAt?: WPt): WPt => {
    const tol = SNAP_PX * px;
    let best: WPt = p;
    let bestD = tol;
    const consider = (q: WPt) => {
      // A boundary corner carries the surface corners that met it; they must not pull it back.
      if (skipAt && Math.hypot(q.x - skipAt.x, q.y - skipAt.y) < 1e-6) return;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    };
    outlines.forEach((o) => o.polys.forEach((poly) => poly.forEach(consider)));
    const same = (t: Sel, i: number) => skip && t && sameItem(t, skip.sel) && i === skip.index;
    site.boundary.forEach((q, i) => !same({ type: "boundary", edge: null, vertex: null }, i) && consider(q));
    site.surfaces.forEach((s) => s.polygon.forEach((q, i) => !same({ type: "surface", id: s.id, vertex: null }, i) && consider(q)));
    site.neighbours.forEach((n) => n.polygon.forEach((q, i) => !same({ type: "neighbour", id: n.id, vertex: null }, i) && consider(q)));
    return { ...best };
  };

  const polyOf = (s: NonNullable<Sel>): WPt[] =>
    s.type === "boundary" ? site.boundary : s.type === "surface" ? site.surfaces.find((x) => x.id === s.id)?.polygon ?? [] : site.neighbours.find((x) => x.id === s.id)?.polygon ?? [];
  /** Change one polygon, working on the store's current copy so quick successive edits never use a stale one. */
  const editPoly = (s: NonNullable<Sel>, f: (poly: WPt[]) => WPt[]) =>
    updateSite((st) =>
      s.type === "boundary"
        ? { ...st, boundary: f(st.boundary) }
        : s.type === "surface"
          ? { ...st, surfaces: st.surfaces.map((x) => (x.id === s.id ? { ...x, polygon: f(x.polygon) } : x)) }
          : { ...st, neighbours: st.neighbours.map((x) => (x.id === s.id ? { ...x, polygon: f(x.polygon) } : x)) },
    );

  const deleteVertex = (s: NonNullable<Sel>, i: number) => {
    if (s.type === "boundary") updateSite((st) => removeBoundaryVertex(st, i));
    else editPoly(s, (poly) => (poly.length > 3 ? poly.filter((_, j) => j !== i) : poly));
    setSel({ ...s, vertex: null } as Sel);
  };
  const deleteItem = (s: NonNullable<Sel>) => {
    if (s.type === "surface") updateSite((st) => ({ ...st, surfaces: st.surfaces.filter((x) => x.id !== s.id) }));
    if (s.type === "neighbour") updateSite((st) => ({ ...st, neighbours: st.neighbours.filter((x) => x.id !== s.id) }));
    setSel(null);
  };

  /** Arrow-key nudge in metres: the selected corner, or a whole surface / building with no corner picked. */
  const nudge = (s: NonNullable<Sel>, dx: number, dy: number): boolean => {
    if (s.vertex !== null) {
      const i = s.vertex;
      if (!polyOf(s)[i]) return false;
      if (s.type === "boundary") {
        const slide = slideFor(s, i);
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

  // Read the latest state through a ref so the listener is attached once.
  const onKey = (e: KeyboardEvent) => {
    if (keyBelongsElsewhere(e.target, document) || useStore.getState().peek) return;
    const arrow = !e.ctrlKey && !e.metaKey && !e.altKey ? arrowDelta(e.key, e.shiftKey) : null;
    if (arrow) {
      if (sel && tool === "select" && nudge(sel, arrow.x, arrow.y)) e.preventDefault();
      return;
    }
    if (e.key === "Escape" && drag.current?.kind === "edge") {
      const snap0 = drag.current.snapshot;
      drag.current = null;
      setDragging(null);
      updateSite(() => snap0);
      return;
    }
    if (e.key === "Escape") {
      setSel(null);
      setDraft(null);
      setTool("select");
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && !useStore.getState().peek) {
      const k = e.key.toLowerCase();
      if (k === "v" || k === "r" || k === "b") {
        setTool(k === "v" ? "select" : k === "r" ? "surface" : "neighbour");
        setDraft(null);
      } else if (k === "f") setView(fitRef.current(size.w, size.h));
      else if (k === "+" || k === "=") zoomBy(1.4);
      else if (k === "-" || k === "_") zoomBy(1 / 1.4);
    }
    if ((e.key === "Delete" || e.key === "Backspace") && sel) {
      e.preventDefault();
      if (sel.vertex !== null) deleteVertex(sel, sel.vertex);
      else deleteItem(sel);
    }
  };
  const keyRef = useRef(onKey);
  keyRef.current = onKey;
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => () => holdUndo(false), []);

  // ---- Pointer handling: a drag moves or pans; a two-touch trackpad pinch zooms.
  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    const mid = { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 };
    drag.current = { kind: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, ppm0: v.ppm, world: toWorld(mid) };
    setDraft(null);
  };
  const capture = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svgRef.current?.setPointerCapture(e.pointerId);
    holdUndo(true);
    if (pointers.current.size === 2) {
      startPinch();
      return true;
    }
    return false;
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (capture(e)) return;
    if (tool !== "select") {
      const p = snap(toWorld(e));
      drag.current = { kind: "rect", start: p };
      setDraft({ a: p, b: p });
    } else drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: v.cx, cy: v.cy, moved: false };
  };
  const onItemDown = (e: React.PointerEvent, s: NonNullable<Sel>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (tool !== "select") return; // let drawing start over items
    e.stopPropagation();
    if (capture(e)) return;
    const already = !!sel && sameItem(sel, s);
    setSel(s);
    // Dragging an already selected surface or building moves it.
    if (already && s.type !== "boundary") drag.current = { kind: "move", sel: s, start: toWorld(e), orig: polyOf(s) };
    else if (already && s.type === "boundary" && s.edge !== null) drag.current = { kind: "edge", sel: s, index: s.edge, start: toWorld(e), orig: polyOf(s), snapshot: site };
    if (drag.current?.kind === "edge") setDragging("edge");
    else drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: v.cx, cy: v.cy, moved: true };
  };
  /** Corners of a selected opening slide along the wall beside them, so the boundary line holds. */
  const slideFor = (s: NonNullable<Sel>, index: number): SlideAlong | undefined => {
    if (s.type !== "boundary" || s.edge === null || edgesOf(site)[s.edge]?.kind !== "open") return undefined;
    if (index === s.edge) return "prev";
    if (index === (s.edge + 1) % site.boundary.length) return "next";
    return undefined;
  };
  // The pointer is captured by the SVG, so a handle never sees dblclick; spot a double press on the same corner here.
  const lastVertexDown = useRef<{ key: string; index: number; at: number } | null>(null);
  const onVertexDown = (e: React.PointerEvent, s: NonNullable<Sel>, index: number) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    const key = s.type === "boundary" ? "boundary" : `${s.type}:${s.id}`;
    const last = lastVertexDown.current;
    lastVertexDown.current = { key, index, at: e.timeStamp };
    if (last && last.key === key && last.index === index && e.timeStamp - last.at < 350) {
      // Double-click removes the corner, as on the plan; a polygon keeps at least three.
      lastVertexDown.current = null;
      if (polyOf(s).length > 3) deleteVertex(s, index);
      return;
    }
    if (capture(e)) return;
    setSel({ ...s, vertex: index } as Sel);
    drag.current = { kind: "vertex", sel: s, index, slide: slideFor(s, index) };
  };
  /** Pressing a selected surface or building's edge slides it (the boundary's own edges go through onItemDown). */
  const onEdgeDown = (e: React.PointerEvent, s: NonNullable<Sel>, index: number) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    if (capture(e)) return;
    drag.current = { kind: "edge", sel: s, index, start: toWorld(e), orig: polyOf(s), snapshot: site };
    setDragging("edge");
  };
  const onMidDown = (e: React.PointerEvent, s: NonNullable<Sel>, index: number) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    if (capture(e)) return;
    const poly = polyOf(s);
    const a = poly[index];
    const b = poly[(index + 1) % poly.length];
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (s.type === "boundary") updateSite((st) => insertBoundaryVertex(st, index, m));
    else editPoly(s, (pl) => [...pl.slice(0, index + 1), m, ...pl.slice(index + 1)]);
    setSel({ ...s, vertex: index + 1 } as Sel);
    drag.current = { kind: "vertex", sel: s, index: index + 1 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const [a, b] = [...pointers.current.values()];
      const r = svgRef.current!.getBoundingClientRect();
      const ppm = Math.max(2, Math.min(400, (d.ppm0 * Math.hypot(a.x - b.x, a.y - b.y)) / d.d0));
      const sx = (a.x + b.x) / 2 - r.left;
      const sy = (a.y + b.y) / 2 - r.top;
      // Keep the world point that started under the fingers under them.
      setView({ cx: d.world.x - (sx - r.width / 2) / ppm, cy: d.world.y - (sy - r.height / 2) / ppm, ppm });
      return;
    }
    if (d.kind === "pan") {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 3) d.moved = true;
      setView({ cx: d.cx - (e.clientX - d.sx) / v.ppm, cy: d.cy - (e.clientY - d.sy) / v.ppm, ppm: v.ppm });
      return;
    }
    const p = toWorld(e);
    if (d.kind === "rect") setDraft({ a: d.start, b: snap(p) });
    else if (d.kind === "vertex") {
      if (d.sel.type === "boundary") {
        // An opening's corner slides along its neighbouring wall; any other boundary corner moves freely
        // (snapping to nearby corners), taking the surface corners that met it along.
        if (d.slide) updateSite((st) => slideCorner(st, d.index, d.slide!, p));
        else {
          const q = snap(p, { sel: d.sel, index: d.index }, site.boundary[d.index]);
          updateSite((st) => moveBoundaryCorner(st, d.index, q));
        }
      } else {
        const q = snap(p, { sel: d.sel, index: d.index });
        editPoly(d.sel, (poly) => poly.map((o, i) => (i === d.index ? q : o)));
      }
    } else if (d.kind === "edge") {
      const n = edgeNormal(d.orig, d.index);
      if (!n) return;
      let off = (p.x - d.start.x) * n.x + (p.y - d.start.y) * n.y;
      if (!e.altKey) {
        // Snap the moved line through a corner of the house or of any other polygon (Alt turns snapping off).
        const targets: WPt[] = outlines.flatMap((o) => o.polys.flat());
        if (d.sel.type !== "boundary") site.boundary.forEach((q) => targets.push(q));
        site.surfaces.forEach((x) => (d.sel.type === "surface" && d.sel.id === x.id ? 0 : x.polygon.forEach((q) => targets.push(q))));
        site.neighbours.forEach((x) => (d.sel.type === "neighbour" && d.sel.id === x.id ? 0 : x.polygon.forEach((q) => targets.push(q))));
        off = snapEdgeOffset(d.orig, d.index, off, targets, SNAP_PX * px);
      }
      const moved = slideEdge(d.orig, d.index, off);
      const j = (d.index + 1) % moved.length;
      if (d.sel.type === "boundary") {
        // Same path as a corner drag, so surface corners that met the boundary go along.
        updateSite((st) => moveBoundaryCorner(moveBoundaryCorner(st, d.index, moved[d.index]), j, moved[j]));
      } else editPoly(d.sel, () => moved);
    } else if (d.kind === "move") {
      let dx = p.x - d.start.x;
      let dy = p.y - d.start.y;
      if (e.shiftKey) {
        // Shift holds the move to one axis, whichever the pointer has travelled further along.
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      editPoly(d.sel, () => d.orig.map((o) => ({ x: o.x + dx, y: o.y + dy })));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    holdUndo(false);
    const d = drag.current;
    if (d?.kind === "pinch") {
      if (pointers.current.size < 2) drag.current = null;
      return;
    }
    drag.current = null;
    setDragging(null);
    if (d?.kind === "pan" && !d.moved) setSel(null);
    if (d?.kind === "rect" && draft) {
      const { a, b } = draft;
      setDraft(null);
      if (Math.abs(a.x - b.x) < 0.3 || Math.abs(a.y - b.y) < 0.3) return;
      const polygon = rectPoly(a.x, a.y, b.x, b.y);
      const id = uid();
      if (tool === "surface") {
        updateSite((st) => ({ ...st, surfaces: [...st.surfaces, { id, kind: drawKind, polygon }] }));
        setSel({ type: "surface", id, vertex: null });
      } else {
        const n: Neighbour = { id, name: `Building ${site.neighbours.length + 1}`, polygon, eaves: 5.3, roof: "hip", pitchDeg: 35 };
        updateSite((st) => ({ ...st, neighbours: [...st.neighbours, n] }));
        setSel({ type: "neighbour", id, vertex: null });
      }
      setTool("select");
    }
  };

  // ---- Drawing helpers in world units.
  const edges = edgesOf(site);
  const selPoly = sel ? polyOf(sel) : [];
  const selected = (t: Sel) => !!sel && !!t && sameItem(sel, t);
  const north = bearingToWorld(site.frontBearing, 0);
  const northDeg = (Math.atan2(north.x, -north.z) * 180) / Math.PI;
  const scaleLen = NICE.find((n) => n * v.ppm >= 70) ?? 100;
  const cursor = tool === "select" ? "grab" : "crosshair";
  const fs = 12 * px;

  return (
    <div className="site-editor">
      <div className="site-editor-body">
        <div className="site-canvas">
          <svg
            ref={svgRef}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            style={{ cursor }}
            className={peeking ? "peeking" : undefined}
            onPointerDown={onBackgroundDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <defs>
              <pattern id="site-grid" width={1} height={1} patternUnits="userSpaceOnUse">
                <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#eef0f3" strokeWidth={px} />
              </pattern>
            </defs>
            <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="url(#site-grid)" />

            {site.surfaces.map((s) => (
              <polygon
                key={s.id}
                points={svgPoints(s.polygon)}
                fill={SURFACE_FILL[s.kind]}
                fillOpacity={0.75}
                stroke={selected({ type: "surface", id: s.id, vertex: null }) ? "#2563eb" : "rgba(0,0,0,0.15)"}
                strokeWidth={(selected({ type: "surface", id: s.id, vertex: null }) ? 2 : 1) * px}
                onPointerDown={(e) => onItemDown(e, { type: "surface", id: s.id, vertex: null })}
              />
            ))}

            {site.neighbours.map((n) => {
              const c = polygonCentroid(n.polygon);
              const isSel = selected({ type: "neighbour", id: n.id, vertex: null });
              return (
                <g key={n.id} onPointerDown={(e) => onItemDown(e, { type: "neighbour", id: n.id, vertex: null })}>
                  <polygon points={svgPoints(n.polygon)} fill="#d6d8dc" stroke={isSel ? "#2563eb" : "#8b9099"} strokeWidth={(isSel ? 2 : 1) * px} />
                  <text x={c.x} y={c.y} fontSize={fs} textAnchor="middle" dominantBaseline="central" className="site-label">
                    {n.name}
                  </text>
                </g>
              );
            })}

            {/* The house: ground floor as room fills under wall bands at their real thickness; upper floors as dashed outer faces. */}
            <g pointerEvents="none">
              {outlines[0]?.polys.map((poly, i) => <polygon key={`fill-${i}`} points={svgPoints(poly)} fill="#efe6cf" />)}
              {walls[0]?.walls.map((w, i) => <polygon key={`wall-${i}`} points={svgPoints(w.poly)} fill="#7a4a3a" stroke="#7a4a3a" strokeWidth={0.3 * px} strokeLinejoin="round" />)}
              {outlines.slice(1).map((o) =>
                (o.faces ?? []).map((f, i) => <line key={`${o.level}-${i}`} x1={f.a.x} y1={f.a.y} x2={f.b.x} y2={f.b.y} stroke="#7a4a3a" strokeWidth={1.2 * px} strokeDasharray={`${5 * px} ${4 * px}`} />),
              )}
            </g>

            {site.boundary.map((a, i) => {
              const b = site.boundary[(i + 1) % site.boundary.length];
              const e = edges[i];
              const isSel = sel?.type === "boundary" && sel.edge === i;
              return (
                <g key={i} className={isSel && tool === "select" ? "site-edge-sel" : undefined} onPointerDown={(ev) => onItemDown(ev, { type: "boundary", edge: i, vertex: null })}>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16 * px} />
                  {isSel && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#93c5fd" strokeWidth={9 * px} strokeLinecap="round" />}
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`site-edge edge-${e.kind}`} strokeWidth={(e.kind === "hedge" ? 5 : e.kind === "wall" ? 4 : e.kind === "fence" ? 3 : 1.5) * px} strokeDasharray={e.kind === "open" ? `${6 * px} ${4 * px}` : undefined} />
                </g>
              );
            })}

            {/* Shortest distance from each side of the house to the boundary. */}
            <g pointerEvents="none">
              {clearances.map((c) => {
                const mid = { x: (c.from.x + c.to.x) / 2, y: (c.from.y + c.to.y) / 2 };
                const on = c.distance < 0.05;
                const label = on ? `${c.side}: on boundary` : `${c.side} ${c.distance.toFixed(2)} m`;
                return (
                  <g key={c.side} className="site-dim">
                    {!on && (
                      <>
                        <line x1={c.from.x} y1={c.from.y} x2={c.to.x} y2={c.to.y} strokeWidth={1.2 * px} />
                        <circle cx={c.from.x} cy={c.from.y} r={2.5 * px} />
                        <circle cx={c.to.x} cy={c.to.y} r={2.5 * px} />
                      </>
                    )}
                    <rect x={mid.x - label.length * fs * 0.29} y={mid.y - fs * 0.75} width={label.length * fs * 0.58} height={fs * 1.5} rx={3 * px} />
                    <text x={mid.x} y={mid.y} fontSize={fs} textAnchor="middle" dominantBaseline="central">
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>

            {sel?.type === "boundary" && sel.edge !== null && site.boundary[sel.edge] && (() => {
              const a = site.boundary[sel.edge];
              const b = site.boundary[(sel.edge + 1) % site.boundary.length];
              const label = `${edgeLength(site, sel.edge).toFixed(2)} m`;
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2 - 16 * px;
              return (
                <g className="site-dim" pointerEvents="none">
                  <rect x={mx - label.length * fs * 0.29} y={my - fs * 0.75} width={label.length * fs * 0.58} height={fs * 1.5} rx={3 * px} />
                  <text x={mx} y={my} fontSize={fs} textAnchor="middle" dominantBaseline="central">
                    {label}
                  </text>
                </g>
              );
            })()}

            {sel && selPoly.length > 0 && (
              <g>
                {sel.type !== "boundary" &&
                  selPoly.map((a, i) => {
                    const b = selPoly[(i + 1) % selPoly.length];
                    return <line key={"e" + i} className="site-edge-hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={10 * px} onPointerDown={(ev) => onEdgeDown(ev, sel, i)} />;
                  })}
                {selPoly.map((a, i) => {
                  const b = selPoly[(i + 1) % selPoly.length];
                  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                  return (
                    <g key={"m" + i} className="site-mid" onPointerDown={(e) => onMidDown(e, sel, i)}>
                      <circle cx={m.x} cy={m.y} r={9 * px} fill="transparent" stroke="none" />
                      <circle cx={m.x} cy={m.y} r={5 * px} strokeWidth={1.2 * px} />
                      <path d={`M ${m.x - 3 * px} ${m.y} H ${m.x + 3 * px} M ${m.x} ${m.y - 3 * px} V ${m.y + 3 * px}`} strokeWidth={1.2 * px} />
                    </g>
                  );
                })}
                {selPoly.map((p, i) => (
                  <g key={"v" + i} className={`site-handle${sel.vertex === i ? " active" : ""}`} onPointerDown={(e) => onVertexDown(e, sel, i)}>
                    <circle cx={p.x} cy={p.y} r={12 * px} fill="transparent" stroke="none" />
                    <circle cx={p.x} cy={p.y} r={6 * px} strokeWidth={1.5 * px} />
                  </g>
                ))}
              </g>
            )}

            {draft && <polygon points={svgPoints(rectPoly(draft.a.x, draft.a.y, draft.b.x, draft.b.y))} className="site-draft" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} />}
          </svg>
          <div className="site-north" style={{ transform: `rotate(${northDeg}deg)` }} aria-label="North">
            <span>N</span>
            <svg viewBox="-10 -16 20 32" width={18} height={30}>
              <path d="M0 -16 L8 6 L0 1 L-8 6 Z" fill="#dc2626" />
            </svg>
          </div>
          <div className="site-scale">
            <div style={{ width: scaleLen * v.ppm }} />
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
              Click a boundary edge, surface or building. Drag corners; + adds a corner. Drag the background or swipe with two fingers to pan; pinch or use the mouse wheel to zoom. Arrows nudge the selected corner or shape (Shift ×10).
            </Info>
          }
        />
      )}

      <div className="site-zoom float-card" role="group" aria-label="Zoom">
        <button type="button" className="icon-btn" onClick={() => zoomBy(1.4)} aria-label="Zoom in (+)" title="Zoom in (+)">
          <Icon name="zoomIn" size={20} />
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out (−)" title="Zoom out (−)">
          <Icon name="zoomOut" size={20} />
        </button>
        <button type="button" className="icon-btn" onClick={() => setView(fitView(size.w, size.h))} aria-label="Fit the plot (F)" title="Fit the plot (F)">
          <Icon name="fit" size={20} />
        </button>
      </div>

      {!peeking && tool === "select" && dragging === "edge" && (
        <div className="site-status float-card" role="status">
          <span>Drag to move the edge · Esc cancels</span>
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

const sameItem = (a: NonNullable<Sel>, b: NonNullable<Sel>) => a.type === b.type && (a.type === "boundary" || (b.type !== "boundary" && a.id === b.id));

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
