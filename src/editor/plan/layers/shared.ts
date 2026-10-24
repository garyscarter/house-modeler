import { useMemo, useRef } from "react";
import type { PlanDrag } from "../useDrag";
import { chipSize } from "../../../lib/editorCore";
import { edgeChipCentre, edgeLengthsM, formatLength, inwardNormals } from "../../../lib/planMath";
import type { Pt, Room } from "../../../types";

/** Real-thickness walls in the plan: near-black fill with a lighter edge so they read on the floorplan image and on white. */
export const WALL_FILL = "#27272a";
export const WALL_EDGE = "#a1a1aa";

/** A shared empty list, so a missing array does not make a fresh one each render. */
export const EMPTY: never[] = [];

/** A white outline round text so it reads over the floor image, sized in screen pixels. */
export const halo = (px: number) => ({ paintOrder: "stroke" as const, stroke: "#fff", strokeWidth: px * 3, strokeLinejoin: "round" as const });

/** The polygon's corners as an SVG `points` string. */
export const pointsOf = (poly: Pt[]) => poly.map((p) => `${p.x},${p.y}`).join(" ");

/** Where an edge's length chip sits: horizontal, just outside the edge's midpoint. */
export function edgeLabelAt(room: Room, i: number, px: number, fontSize: number, ppm: number): Pt {
  const a = room.polygon[i];
  const b = room.polygon[(i + 1) % room.polygon.length];
  const { w, h } = chipSize(formatLength(edgeLengthsM(room.polygon, ppm)[i]), px, fontSize);
  return edgeChipCentre(a, b, inwardNormals(room.polygon)[i], w, h, px * 3);
}

/** A function with a fixed identity that always calls the latest one passed in, so a memo'd layer never re-renders for a closure. */
export function useEvent<A extends unknown[], R>(fn: (...a: A) => R): (...a: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useMemo(() => (...a: A) => ref.current(...a), []);
}

/** The same array (or set / map) as last render while its contents are equal, so a layer fed it can skip a render. */
export function useSame<T>(next: T, equal: (a: T, b: T) => boolean): T {
  const ref = useRef(next);
  if (ref.current !== next && !equal(ref.current, next)) ref.current = next;
  return ref.current;
}
export const sameList = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);
export const sameMap = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

/** The drag hook's press handlers with fixed identities (they read the latest hook result when called). */
export function useStableHandlers(drag: PlanDrag) {
  const ref = useRef(drag);
  ref.current = drag;
  return useMemo(() => {
    const d = () => ref.current;
    return {
      hoverRoom: ((...a) => d().hoverRoom(...a)) as PlanDrag["hoverRoom"],
      unhoverRoom: ((...a) => d().unhoverRoom(...a)) as PlanDrag["unhoverRoom"],
      cornerDown: ((...a) => d().cornerDown(...a)) as PlanDrag["cornerDown"],
      midDown: ((...a) => d().midDown(...a)) as PlanDrag["midDown"],
      edgeDown: ((...a) => d().edgeDown(...a)) as PlanDrag["edgeDown"],
      wallEndDown: ((...a) => d().wallEndDown(...a)) as PlanDrag["wallEndDown"],
      wallDown: ((...a) => d().wallDown(...a)) as PlanDrag["wallDown"],
      openingDown: ((...a) => d().openingDown(...a)) as PlanDrag["openingDown"],
      canopyDown: ((...a) => d().canopyDown(...a)) as PlanDrag["canopyDown"],
      canopyCornerDown: ((...a) => d().canopyCornerDown(...a)) as PlanDrag["canopyCornerDown"],
      stairsDown: ((...a) => d().stairsDown(...a)) as PlanDrag["stairsDown"],
      chipDown: ((...a) => d().chipDown(...a)) as PlanDrag["chipDown"],
      fixtureDown: ((...a) => d().fixtureDown(...a)) as PlanDrag["fixtureDown"],
    };
  }, []);
}
export type PlanHandlers = ReturnType<typeof useStableHandlers>;
