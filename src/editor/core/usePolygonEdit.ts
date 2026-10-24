import { useMemo, useRef } from "react";
import { edgeOffset, midpointOf, outwardNormal, slideEdge, snapEdgeOffset, snapPoint, SNAP_PX } from "../../lib/polygonEdit";
import type { Pt } from "../../types";
import type { useDoublePress } from "./useDoublePress";
import type { CanvasCamera } from "./useCanvasCamera";
import type { DragApi, Move } from "./useDrag";

/** What the core needs to know to edit one polygon: the plan's room, the site's boundary, surface or neighbour. */
export interface PolygonTarget<C = unknown> {
  /** "room:<id>", "boundary", "surface:<id>", "neighbour:<id>". */
  key: string;
  poly: readonly Pt[];
  /** Locked: no drag, insert or remove. The press is not handled, so it falls through to the background (a pan). */
  locked?: boolean;
  /** Default 3. */
  minVertices?: number;
  /** Default true. */
  snapAxis?: boolean;
  /** Called once: at the press for an edge, when a vertex drag starts moving (after a midpoint's insert). Read the store, not render state. */
  snapTargets(ex: { vertex?: number; edge?: number }): Pt[];
  skipSnap?(q: Pt, vertex: number): boolean;
  /** A constrained corner: no snapping; moveVertex applies the constraint. */
  slides?(vertex: number): boolean;
  moveVertex(i: number, p: Pt): void;
  /** The context kept for an edge drag (plan: the openings on the edge). */
  edgeBegin?(i: number): C;
  setEdge(i: number, next: Pt[], shift: Pt, ctx: C): void;
  /** A tap (press and release within the slop) on an edge hit; without it the tap is swallowed. */
  edgeTap?(m: Move, i: number): void;
  /** The new vertex is i + 1. */
  insertVertex(i: number, p: Pt): void;
  removeVertex(i: number): void;
  pickVertex?(i: number | null): void;
}

type DoublePress = ReturnType<typeof useDoublePress>;

const isPrimary = (e: React.PointerEvent) => e.pointerType !== "mouse" || e.button === 0;

/**
 * Vertex drag, edge slide, midpoint insert and double-press remove, once, for every editable polygon.
 * Snapping tolerances are SNAP_PX screen px times the frame's unitsPerPx; Alt turns every snap off.
 */
export function usePolygonEdit(drag: DragApi, camera: CanvasCamera, dbl: DoublePress) {
  const live = useRef({ drag, camera, dbl });
  live.current = { drag, camera, dbl };

  return useMemo(() => {
    const tolNow = () => SNAP_PX * live.current.camera.frame().unitsPerPx;

    /**
     * A vertex drag of vertex i; also what a midpoint press continues as (`fresh`: a corner just inserted, which
     * never slides). Snap targets and `slides` are read once, when the drag starts moving: after a midpoint's
     * insert, so a target that reads the store sees the new corner.
     */
    const vertexSpec = (t: PolygonTarget, i: number, fresh = false) => {
      let targets: Pt[] = [];
      let slides = false;
      return {
        kind: "poly-vertex" as const,
        data: { key: t.key, vertex: i },
        start() {
          targets = t.snapTargets({ vertex: i });
          slides = !fresh && !!t.slides?.(i);
        },
        move(m: { at: Pt; alt: boolean }) {
          let p = m.at;
          if (!m.alt && !slides) {
            p = snapPoint(p, targets, tolNow(), { axis: t.snapAxis !== false, skip: t.skipSnap ? (q) => t.skipSnap!(q, i) : undefined }).p;
          }
          t.moveVertex(i, p);
        },
      };
    };

    const vertexDown = (e: React.PointerEvent, t: PolygonTarget, i: number) => {
      if (t.locked || !isPrimary(e)) return;
      const { drag: dg, dbl: doublePress } = live.current;
      if (doublePress(`${t.key}#${i}`, e)) {
        e.stopPropagation();
        if (t.poly.length > (t.minVertices ?? 3)) t.removeVertex(i);
        return;
      }
      t.pickVertex?.(i);
      dg.begin(e, vertexSpec(t, i));
    };

    const edgeDown = (e: React.PointerEvent, t: PolygonTarget, i: number) => {
      if (t.locked || !isPrimary(e)) return;
      const poly0 = t.poly.map((p) => ({ ...p }));
      const targets = t.snapTargets({ edge: i });
      const ctx = t.edgeBegin?.(i);
      live.current.drag.begin(e, {
        kind: "poly-edge",
        data: { key: t.key, edge: i },
        move(m: { delta: Pt; alt: boolean }) {
          let off = edgeOffset(poly0, i, m.delta);
          if (!m.alt) off = snapEdgeOffset(poly0, i, off, targets, tolNow());
          const n = outwardNormal(poly0, i);
          t.setEdge(i, slideEdge(poly0, i, off), n ? { x: n.x * off, y: n.y * off } : { x: 0, y: 0 }, ctx);
        },
        tap: t.edgeTap ? (m: Move) => t.edgeTap!(m, i) : undefined,
      });
    };

    const midDown = (e: React.PointerEvent, t: PolygonTarget, i: number) => {
      if (t.locked || !isPrimary(e)) return;
      const { drag: dg } = live.current;
      const spec = vertexSpec(t, i + 1, true);
      // begin() snapshots first, so the insert and the drag that follows share one undo step and Esc removes the corner again.
      dg.begin(e, spec);
      if (!dg.active()) return;
      t.insertVertex(i, midpointOf(t.poly, i));
      t.pickVertex?.(i + 1);
    };

    return { vertexDown, edgeDown, midDown };
  }, []);
}

