import { useEffect, type RefObject } from "react";
import { useStore } from "../../store";
import { siteOf } from "../../lib/sites";
import { edgesOf, insertBoundaryVertex, rectPoly,type LevelOutline } from "../../lib/site";
import { curvesAfterInsert } from "../../lib/surfaceCurve";
import { moveBoundaryCorner, slideCorner, type SlideAlong } from "../../lib/boundaryOpening";
import { lockToAxis, snapPoint, SNAP_PX } from "../../lib/polygonEdit";
import { uid, type Neighbour, type Site, type SurfaceKind, type WPt } from "../../types";
import { circleControls } from "../../lib/surfaceCurve";
import { itemsOf, snapItem } from "../../lib/siteItems";
import { angleToward, moveRunEnd, patchItem, resizePatch, snapRot, toLocal } from "./gardenEdit";
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

/** What the Garden tools do once the pointer has chosen a point; SitePlan owns the state they change. */
export interface GardenActions {
  /** The selected item ids (the store's `gardenSel`). */
  selection: string[];
  selectItems: (ids: string[]) => void;
  /** A click with the polygon tool: adds a corner or closes the surface. `tol` is a screen click's reach in metres. */
  polyClick: (at: WPt, tol: number) => void;
  /** A click with an armed one-point entry. */
  placeAt: (at: WPt, shift: boolean) => void;
  /** A click with an armed run entry: first end, then second. */
  runClick: (at: WPt, shift: boolean) => void;
  /** The pointer over the canvas, for ghosts and rubber lines; null when it leaves. */
  hover: (at: WPt | null) => void;
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
  garden: GardenActions;
}

/** The site's pointer behaviour on the shared core: item presses, corners, edges, midpoints, rectangles and pan. */
export function useSiteDrag(a: Args) {
  const { site, outlines, tool, drawKind, sel, setSel, setTool, setDraft, editPoly, deleteVertex, garden } = a;
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
        else if (s.type === "surface")
          updateSite((st) => ({ ...st, surfaces: st.surfaces.map((x) => (x.id === s.id ? { ...x, polygon: [...x.polygon.slice(0, i + 1), p, ...x.polygon.slice(i + 1)], curves: curvesAfterInsert(x.curves, i) } : x)) }));
        else editPoly(s, (pl) => [...pl.slice(0, i + 1), p, ...pl.slice(i + 1)]);
      },
      removeVertex: (i) => deleteVertex(s, i),
      pickVertex: (i) => setSel({ ...s, vertex: i, edge: null } as Sel),
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

  /** Drag out a circle from its centre; it becomes a smooth surface through eight control points. */
  const circleSpec = (p: Press): DragSpec => {
    const snap = (q: WPt) => snapPoint(q, corners(), SNAP_PX * a.camera.frame().unitsPerPx, { axis: false }).p;
    const c = snap(p.at);
    const kind = drawKind;
    const data = { r: 0 };
    setDraft({ a: c, b: c, circle: true });
    const create = () => {
      setDraft(null);
      const r = Math.round(data.r * 20) / 20;
      if (r < 0.3) return;
      const id = uid();
      updateSite((st) => ({ ...st, surfaces: [...st.surfaces, { id, kind, polygon: circleControls(c, r), smooth: true }] }));
      setSel({ type: "surface", id, vertex: null });
      setTool("select");
    };
    return {
      kind: "circle",
      data,
      slop: 0,
      move: (m) => {
        data.r = Math.hypot(m.at.x - c.x, m.at.y - c.y);
        setDraft({ a: c, b: m.at, circle: true });
      },
      end: create,
      tap: () => setDraft(null),
      cancelled: () => setDraft(null),
    };
  };

  /** A press that only counts as a click (the polygon, place and run tools); dragging does nothing. */
  const clickSpec = (fn: (m: { at: WPt; shift: boolean }) => void): DragSpec => ({ kind: "tool-click", data: null, undo: false, tap: (m) => fn({ at: m.at, shift: m.shift }) });

  const backgroundSpec = (p: Press): DragSpec | null => {
    switch (tool) {
      case "select":
        return null;
      case "circle":
        return circleSpec(p);
      case "polygon":
        return clickSpec((m) => {
          const tol = SNAP_PX * a.camera.frame().unitsPerPx;
          garden.polyClick(snapPoint(m.at, corners(), tol, { axis: false }).p, tol * 1.5);
        });
      case "place":
        return clickSpec((m) => garden.placeAt(m.at, m.shift));
      case "run":
        return clickSpec((m) => garden.runClick(m.at, m.shift));
      default:
        return rectSpec(p);
    }
  };

  const drag = useDrag({
    svg: a.svgRef,
    camera: a.camera,
    background: backgroundSpec,
    backgroundTap: () => {
      setSel(null);
    },
    hover: (m) => garden.hover(m ? m.at : null),
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
    const already = !!sel && sel.type !== "item" && sameItem(sel, s);
    setSel(s);
    if (already && s.type !== "boundary") drag.begin(e, moveSpec(s));
    else if (already && s.type === "boundary" && s.edge !== null) edit.edgeDown(e, targetOf(s), s.edge);
    else drag.beginPan(e);
  };

  // ---- Garden items ----

  const outlinePolys = (): WPt[][] => outlines.flatMap((o) => o.polys);

  /** Move the selected items together; one item snaps like a placement (and, for wall entries, to walls); Shift holds an axis, Alt turns snapping off. */
  const itemMoveSpec = (ids: string[]): DragSpec => {
    const orig = new Map(itemsOf(siteNow() ?? site).filter((it) => ids.includes(it.id)).map((it) => [it.id, structuredClone(it)]));
    const single = orig.size === 1;
    return {
      kind: "item-move",
      data: null,
      move: (m) => {
        const d = m.shift ? lockToAxis(m.delta) : m.delta;
        updateSite((st) => ({
          ...st,
          items: itemsOf(st).map((it) => {
            const o = orig.get(it.id);
            if (!o) return it;
            if (single && !o.to) {
              const raw = { x: o.x + d.x, y: o.y + d.y };
              const s = m.alt ? { ...raw, rot: o.rot } : snapItem(o, raw, st, outlinePolys());
              return { ...it, x: s.x, y: s.y, rot: s.rot };
            }
            return { ...it, x: o.x + d.x, y: o.y + d.y, ...(o.to ? { to: { x: o.to.x + d.x, y: o.to.y + d.y } } : {}) };
          }),
        }));
      },
    };
  };

  /** A press on a garden item: Shift toggles it in the selection; otherwise it is selected (as is) and dragged. */
  const gardenItemDown = (e: React.PointerEvent, id: string) => {
    if (tool !== "select") return; // placing and drawing start over items
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.shiftKey) {
      e.stopPropagation();
      garden.selectItems(garden.selection.includes(id) ? garden.selection.filter((x) => x !== id) : [...garden.selection, id]);
      return;
    }
    const ids = garden.selection.includes(id) ? garden.selection : [id];
    if (ids !== garden.selection) garden.selectItems(ids);
    drag.begin(e, itemMoveSpec(ids));
  };

  const itemNow = (id: string) => itemsOf(siteNow() ?? site).find((it) => it.id === id);

  const rotateDown = (e: React.PointerEvent, id: string) => {
    const o = itemNow(id);
    if (!o) return;
    drag.begin(e, {
      kind: "item-rotate",
      data: null,
      slop: 0,
      move: (m) => updateSite((st) => patchItem(st, id, { rot: snapRot(angleToward({ x: o.x, y: o.y }, m.at), m.shift) })),
    });
  };
  const resizeDown = (e: React.PointerEvent, id: string, handle: "spread" | "w" | "d") => {
    const o = itemNow(id);
    if (!o) return;
    drag.begin(e, {
      kind: "item-resize",
      data: null,
      slop: 0,
      move: (m) => updateSite((st) => patchItem(st, id, resizePatch(o, handle, toLocal(o, m.at)))),
    });
  };
  const endDown = (e: React.PointerEvent, id: string, end: "from" | "to") => {
    drag.begin(e, {
      kind: "item-end",
      data: null,
      slop: 0,
      move: (m) => updateSite((st) => moveRunEnd(st, id, end, m.alt ? m.at : { x: Math.round(m.at.x * 20) / 20, y: Math.round(m.at.y * 20) / 20 })),
    });
  };

  return {
    drag,
    gardenItemDown,
    rotateDown,
    resizeDown,
    endDown,
    itemDown,
    vertexDown: (e: React.PointerEvent, s: Item, i: number) => edit.vertexDown(e, targetOf(s), i),
    edgeDown: (e: React.PointerEvent, s: Item, i: number) => {
      // A surface's edge is selected by pressing it (so it can be curved), and slides when dragged.
      if (s.type === "surface") setSel({ ...s, vertex: null, edge: i } as Sel);
      edit.edgeDown(e, targetOf(s), i);
    },
    midDown: (e: React.PointerEvent, s: Item, i: number) => edit.midDown(e, targetOf(s), i),
  };
}
