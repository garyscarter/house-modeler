import { useEffect, type RefObject } from "react";
import { useStore } from "../../store";
import { siteOf } from "../../lib/sites";
import { edgesOf, insertBoundaryVertex, rectPoly,type LevelOutline } from "../../lib/site";
import { moveBoundaryCorner, slideCorner, type SlideAlong } from "../../lib/boundaryOpening";
import { lockToAxis, snapPoint, SNAP_PX } from "../../lib/polygonEdit";
import { uid, type Neighbour, type Site, type SurfaceKind, type WPt } from "../../types";
import { useDoublePress, useDrag, usePolygonEdit, type CanvasCamera, type DragSpec, type Press, type PolygonTarget } from "../core";
import { keyOf, sameItem, type Draft, type Item, type Sel, type Tool } from "./types";

/** The site as it is in the store now (callbacks captured at a press must not use render-time values). */
const siteNow = (): Site | undefined => {
  const st = useStore.getState();
  return siteOf(st.sites, st.activeVariant);
};

const polyIn = (site: Site | undefined, s: Item): WPt[] =>
  !site ? [] : s.type === "boundary" ? site.boundary : s.type === "surface" ? site.surfaces.find((x) => x.id === s.id)?.polygon ?? [] : site.neighbours.find((x) => x.id === s.id)?.polygon ?? [];

/** Corners of a selected opening slide along the wall beside them, so the boundary line holds. */
export function slideFor(site: Site, s: Item, index: number): SlideAlong | undefined {
  if (s.type !== "boundary" || s.edge === null || edgesOf(site)[s.edge]?.kind !== "open") return undefined;
  if (index === s.edge) return "prev";
  if (index === (s.edge + 1) % site.boundary.length) return "next";
  return undefined;
}

interface Args {
  svgRef: RefObject<SVGSVGElement | null>;
  camera: CanvasCamera;
  site: Site;
  outlines: LevelOutline[];
  tool: Tool;
  drawKind: SurfaceKind;
  sel: Sel;
  setSel: (s: Sel) => void;
  setTool: (t: Tool) => void;
  setDraft: (d: Draft) => void;
  editPoly: (s: Item, f: (poly: WPt[]) => WPt[]) => void;
  deleteVertex: (s: Item, i: number) => void;
}

/** The site's pointer behaviour on the shared core: item presses, corners, edges, midpoints, rectangles and pan. */
export function useSiteDrag(a: Args) {
  const { site, outlines, tool, drawKind, sel, setSel, setTool, setDraft, editPoly, deleteVertex } = a;
  const updateSite = useStore((s) => s.updateSite);
  const peeking = useStore((s) => s.peek);
  const dbl = useDoublePress();

  /** Corners a drag can snap to (house outline, boundary, surfaces, neighbours), read from the store when asked. */
  const corners = (except?: { item: Item; vertex: number }): WPt[] => {
    const st = siteNow();
    const out: WPt[] = outlines.flatMap((o) => o.polys.flat());
    if (!st) return out;
    const add = (item: Item, poly: readonly WPt[]) => poly.forEach((q, i) => !(except && sameItem(except.item, item) && except.vertex === i) && out.push(q));
    add({ type: "boundary", edge: null, vertex: null }, st.boundary);
    st.surfaces.forEach((x) => add({ type: "surface", id: x.id, vertex: null }, x.polygon));
    st.neighbours.forEach((x) => add({ type: "neighbour", id: x.id, vertex: null }, x.polygon));
    return out;
  };
  /** Edge slides snap to every other polygon's corners (a boundary edge ignores the boundary's own). */
  const edgeTargets = (s: Item): WPt[] => {
    const st = siteNow();
    const out: WPt[] = outlines.flatMap((o) => o.polys.flat());
    if (!st) return out;
    if (s.type !== "boundary") st.boundary.forEach((q) => out.push(q));
    st.surfaces.forEach((x) => !(s.type === "surface" && s.id === x.id) && x.polygon.forEach((q) => out.push(q)));
    st.neighbours.forEach((x) => !(s.type === "neighbour" && s.id === x.id) && x.polygon.forEach((q) => out.push(q)));
    return out;
  };

  /** The core's view of the selected polygon. Built at a press, so `site` and `s` are the press-time values. */
  const targetOf = (s: Item): PolygonTarget => {
    let startAt: WPt | undefined;
    let slide: SlideAlong | undefined;
    return {
      key: keyOf(s),
      poly: polyIn(site, s),
      snapAxis: false,
      snapTargets: (ex) => {
        if (ex.edge !== undefined) return edgeTargets(s);
        // A boundary corner carries the surface corners that met it; they must not pull it back (skipSnap).
        if (s.type === "boundary" && ex.vertex !== undefined) startAt = siteNow()?.boundary[ex.vertex];
        return corners({ item: s, vertex: ex.vertex ?? -1 });
      },
      skipSnap: (q) => !!startAt && Math.hypot(q.x - startAt.x, q.y - startAt.y) < 1e-6,
      slides: (i) => {
        slide = slideFor(site, s, i);
        return slide !== undefined;
      },
      moveVertex: (i, p) => {
        if (s.type !== "boundary") return editPoly(s, (poly) => poly.map((o, j) => (j === i ? { x: p.x, y: p.y } : o)));
        // An opening's corner slides along its neighbouring wall; any other boundary corner moves freely.
        updateSite((st) => (slide ? slideCorner(st, i, slide, p) : moveBoundaryCorner(st, i, p)));
      },
      setEdge: (i, next) => {
        if (s.type !== "boundary") return editPoly(s, () => next);
        const j = (i + 1) % next.length;
        // Same path as a corner drag, so surface corners that met the boundary go along.
        updateSite((st) => moveBoundaryCorner(moveBoundaryCorner(st, i, next[i]), j, next[j]));
      },
      insertVertex: (i, p) => {
        if (s.type === "boundary") updateSite((st) => insertBoundaryVertex(st, i, p));
        else editPoly(s, (pl) => [...pl.slice(0, i + 1), p, ...pl.slice(i + 1)]);
      },
      removeVertex: (i) => deleteVertex(s, i),
      pickVertex: (i) => setSel({ ...s, vertex: i } as Sel),
    };
  };

  /** Drag out a rectangle with the draw tool; it becomes a surface or a building. */
  const rectSpec = (p: Press): DragSpec => {
    const snap = (q: WPt) => snapPoint(q, corners(), SNAP_PX * a.camera.frame().unitsPerPx, { axis: false }).p;
    const start = snap(p.at);
    const t = tool;
    const kind = drawKind;
    const data = { a: start, b: start };
    setDraft({ a: start, b: start });
    const create = () => {
      setDraft(null);
      const { a: pa, b: pb } = data;
      if (Math.abs(pa.x - pb.x) < 0.3 || Math.abs(pa.y - pb.y) < 0.3) return;
      const polygon = rectPoly(pa.x, pa.y, pb.x, pb.y);
      const id = uid();
      if (t === "surface") {
        updateSite((st) => ({ ...st, surfaces: [...st.surfaces, { id, kind, polygon }] }));
        setSel({ type: "surface", id, vertex: null });
      } else {
        const n: Neighbour = { id, name: `Building ${(siteNow()?.neighbours.length ?? 0) + 1}`, polygon, eaves: 5.3, roof: "hip", pitchDeg: 35 };
        updateSite((st) => ({ ...st, neighbours: [...st.neighbours, n] }));
        setSel({ type: "neighbour", id, vertex: null });
      }
      setTool("select");
    };
    return {
      kind: "rect",
      data,
      slop: 0,
      move: (m) => {
        data.b = snap(m.at);
        setDraft({ a: data.a, b: data.b });
      },
      end: create,
      tap: create,
      cancelled: () => setDraft(null),
    };
  };

  const drag = useDrag({
    svg: a.svgRef,
    camera: a.camera,
    background: (p) => (tool === "select" ? null : rectSpec(p)),
    backgroundTap: () => setSel(null),
    disabled: () => useStore.getState().peek,
  });
  const edit = usePolygonEdit(drag, a.camera, dbl);

  // Peeking at the other layout ignores the pointer, and drops a drag in progress.
  useEffect(() => {
    if (peeking) drag.cancel();
  }, [peeking, drag]);

  /** Whole-surface (or building) move; Shift holds it to one axis. */
  const moveSpec = (s: Item): DragSpec => {
    const orig = polyIn(site, s).map((q) => ({ x: q.x, y: q.y }));
    return {
      kind: "move",
      data: null,
      move: (m) => {
        const d = m.shift ? lockToAxis(m.delta) : m.delta;
        editPoly(s, () => orig.map((o) => ({ x: o.x + d.x, y: o.y + d.y })));
      },
    };
  };

  const itemDown = (e: React.PointerEvent, s: Item) => {
    if (tool !== "select") return; // let drawing start over items
    const already = !!sel && sameItem(sel, s);
    setSel(s);
    if (already && s.type !== "boundary") drag.begin(e, moveSpec(s));
    else if (already && s.type === "boundary" && s.edge !== null) edit.edgeDown(e, targetOf(s), s.edge);
    else drag.beginPan(e);
  };

  return {
    drag,
    itemDown,
    vertexDown: (e: React.PointerEvent, s: Item, i: number) => edit.vertexDown(e, targetOf(s), i),
    edgeDown: (e: React.PointerEvent, s: Item, i: number) => edit.edgeDown(e, targetOf(s), i),
    midDown: (e: React.PointerEvent, s: Item, i: number) => edit.midDown(e, targetOf(s), i),
  };
}
