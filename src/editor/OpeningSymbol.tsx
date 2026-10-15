import { memo } from "react";
import type { Opening } from "../types";
import { doorFrame } from "../lib/planMath";

const INK = "#1f2937";
const SELECTED = "#d97706";

/**
 * Architectural plan symbol for an opening, drawn in a local frame where x
 * runs along the wall (left to right for "h" walls, top to bottom for "v")
 * and +y is the default swing side (see doorFrame). `len` is the opening's
 * width and `t` the wall thickness, both image px; `px` is one screen pixel in
 * image px so strokes stay the same on screen at any zoom. `outside` is the
 * local y sign of the outside of the house (0 for an internal wall), used to
 * project bays outwards and draw a garage door's travel inwards.
 */
export const OpeningSymbol = memo(function OpeningSymbol({
  opening: o,
  len,
  t,
  m,
  px,
  outside,
  selected,
}: {
  opening: Opening;
  len: number;
  t: number;
  /** One metre in image px. */
  m: number;
  px: number;
  outside: 1 | -1 | 0;
  selected: boolean;
}) {
  const ink = selected ? SELECTED : INK;
  const sw = px * (selected ? 2 : 1.3);
  const half = len / 2;
  const { hingeSide } = doorFrame(o);
  const swing = o.flipSwing ? -1 : 1;
  const thin = { stroke: ink, strokeWidth: sw * 0.75, fill: "none" as const };
  const bold = { stroke: ink, strokeWidth: sw * 1.6, fill: "none" as const, strokeLinecap: "round" as const };
  // A white break in the wall outline, with the two jambs.
  const breakWall = (
    <>
      <rect x={-half} y={-t / 2} width={len} height={t} fill="#fff" />
      <line x1={-half} y1={-t / 2} x2={-half} y2={t / 2} {...thin} />
      <line x1={half} y1={-t / 2} x2={half} y2={t / 2} {...thin} />
    </>
  );
  /** A leaf of width r hinged at x = hx, opened 90° to the swing side, with its arc back to the wall. */
  const leaf = (hx: number, r: number, toward: 1 | -1, colour?: string) => {
    const tipY = swing * r;
    const endX = hx + toward * r;
    // SVG sweep 1 turns from +x towards +y; from the open tip back to the wall that is the case when swing and toward differ in sign.
    const sweep = swing * toward > 0 ? 0 : 1;
    return (
      <>
        <path d={`M ${hx} ${tipY} A ${r} ${r} 0 0 ${sweep} ${endX} 0`} {...thin} strokeDasharray={`${px * 4} ${px * 2.5}`} />
        {colour ? (
          <rect x={hx - (px * 2.5) / 2} y={Math.min(0, tipY)} width={px * 2.5} height={r} fill={colour} stroke={ink} strokeWidth={sw * 0.6} />
        ) : (
          <line x1={hx} y1={0} x2={hx} y2={tipY} {...bold} />
        )}
      </>
    );
  };

  let body: React.ReactNode;
  switch (o.kind) {
    case "door":
      body = (
        <>
          {breakWall}
          {leaf(hingeSide * half, len, hingeSide > 0 ? -1 : 1)}
        </>
      );
      break;
    case "front":
      body = (
        <>
          {breakWall}
          {leaf(hingeSide * half, len, hingeSide > 0 ? -1 : 1, o.color ?? "#b3202e")}
        </>
      );
      break;
    case "french":
      body = (
        <>
          {breakWall}
          {leaf(-half, half, 1)}
          {leaf(half, half, -1)}
        </>
      );
      break;
    case "bifold": {
      // Folding leaves drawn half open as a zigzag on the swing side, stacking at the hinge jamb.
      const n = Math.max(2, Math.min(7, Math.round(len / (0.75 * m))));
      const p = len / n;
      const pts = Array.from({ length: n + 1 }, (_, i) => {
        const x = hingeSide * half - hingeSide * i * p;
        return `${x},${i % 2 ? swing * p * 0.45 : 0}`;
      });
      body = (
        <>
          {breakWall}
          <polyline points={pts.join(" ")} {...bold} strokeLinejoin="round" />
          <circle cx={hingeSide * half} cy={0} r={px * 3} fill={ink} />
        </>
      );
      break;
    }
    case "window":
      body = (
        <>
          {breakWall}
          <line x1={-half} y1={-t / 2} x2={half} y2={-t / 2} {...thin} />
          <line x1={-half} y1={0} x2={half} y2={0} {...thin} />
          <line x1={-half} y1={t / 2} x2={half} y2={t / 2} {...thin} />
        </>
      );
      break;
    case "bay": {
      // Canted bay projecting outwards with a glazed line set in from its face.
      const out = outside || 1;
      const depth = Math.min(0.6 * m, len * 0.4);
      const face = Math.max(len - depth * 2, len * 0.35) / 2;
      const outline = `${-half},${(out * t) / 2} ${-face},${out * (t / 2 + depth)} ${face},${out * (t / 2 + depth)} ${half},${(out * t) / 2}`;
      const inset = Math.min(px * 4, depth * 0.3);
      const glass = `${-half + inset},${(out * t) / 2} ${-face + inset * 0.4},${out * (t / 2 + depth - inset)} ${face - inset * 0.4},${out * (t / 2 + depth - inset)} ${half - inset},${(out * t) / 2}`;
      body = (
        <>
          {breakWall}
          <polygon points={outline} fill="#e0f2fe" fillOpacity={0.6} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          <polyline points={glass} {...thin} />
          <line x1={-half} y1={0} x2={half} y2={0} {...thin} />
        </>
      );
      break;
    }
    case "patio": {
      // Two sliding panels on parallel tracks, overlapping in the middle.
      const off = Math.max(t / 5, px * 2);
      body = (
        <>
          {breakWall}
          <line x1={-half} y1={-off} x2={len * 0.06} y2={-off} {...bold} />
          <line x1={-len * 0.06} y1={off} x2={half} y2={off} {...bold} />
        </>
      );
      break;
    }
    case "garage": {
      // The door in the wall line and, dashed, how far an up-and-over door travels into the garage.
      const inward = -(outside || -1);
      const travel = Math.min(0.9 * m, len * 0.5);
      body = (
        <>
          {breakWall}
          <line x1={-half} y1={0} x2={half} y2={0} stroke={o.color ?? "#b3202e"} strokeWidth={Math.max(t * 0.5, px * 3)} />
          <rect
            x={-half}
            y={inward > 0 ? t / 2 : -t / 2 - travel}
            width={len}
            height={travel}
            fill="none"
            stroke={ink}
            strokeWidth={sw * 0.7}
            strokeDasharray={`${px * 5} ${px * 3}`}
          />
        </>
      );
      break;
    }
    case "gap":
      body = (
        <>
          <rect x={-half} y={-t / 2} width={len} height={t} fill="#fff" />
          <line x1={-half} y1={-t / 2} x2={half} y2={-t / 2} {...thin} strokeDasharray={`${px * 4} ${px * 3}`} />
          <line x1={-half} y1={t / 2} x2={half} y2={t / 2} {...thin} strokeDasharray={`${px * 4} ${px * 3}`} />
        </>
      );
      break;
  }
  return <g style={{ pointerEvents: "none" }}>{body}</g>;
});
