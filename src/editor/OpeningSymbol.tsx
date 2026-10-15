import { memo } from "react";
import type { Opening } from "../types";
import { bayOutline, bifoldPanels } from "../lib/openings";
import { DOUBLE_DOOR_M, doorSwing } from "../lib/planMath";

const INK = "#1f2937";
const SELECTED = "#d97706";

/**
 * Architectural plan symbol for an opening, drawn in a local frame where x
 * runs along the wall (left to right for "h" walls, top to bottom for "v")
 * and +y is down the plan for "h" and left for "v" (see doorSwing). `len` is
 * the opening's width and `t` the wall thickness, both image px; `px` is one
 * screen pixel in image px so strokes stay the same on screen at any zoom.
 * `outside` is the local y sign of the outside of the house (0 for an
 * internal wall), so doors swing, bays project and garage doors travel the
 * same way as in the 3D view.
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
  const { hinge, swing } = doorSwing(o, outside);
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
          {!outside && o.widthM > DOUBLE_DOOR_M ? (
            <>
              {leaf(-half, half, 1)}
              {leaf(half, half, -1)}
            </>
          ) : (
            leaf(hinge * half, len, hinge > 0 ? -1 : 1)
          )}
        </>
      );
      break;
    case "front":
      body = (
        <>
          {breakWall}
          {leaf(hinge * half, len, hinge > 0 ? -1 : 1, o.color ?? "#b3202e")}
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
      // Folding leaves drawn half open as a zigzag on the swing side, stacking at the hinge jamb;
      // as many panels as the 3D door has inside its 60 mm frame.
      const n = bifoldPanels(Math.max(0.2, o.widthM - 0.12));
      const p = len / n;
      const pts = Array.from({ length: n + 1 }, (_, i) => {
        const x = hinge * half - hinge * i * p;
        return `${x},${i % 2 ? swing * p * 0.45 : 0}`;
      });
      body = (
        <>
          {breakWall}
          <polyline points={pts.join(" ")} {...bold} strokeLinejoin="round" />
          <circle cx={hinge * half} cy={0} r={px * 3} fill={ink} />
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
      // The 3D bay's canted outline, projecting outwards, with a glazed line set in from its faces.
      const out = outside || 1;
      const shape = bayOutline(len / m, t / m, o.depth);
      const depth = shape[1].z - shape[0].z;
      const inset = Math.min((px * 4) / m, depth * 0.3);
      const glass = bayOutline(len / m - inset * 2, t / m, depth - inset);
      const pts = (ps: { x: number; z: number }[]) => ps.map((q) => `${q.x * m},${out * q.z * m}`).join(" ");
      body = (
        <>
          {breakWall}
          <polygon points={pts(shape)} fill="#e0f2fe" fillOpacity={0.6} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
          <polyline points={pts(glass)} {...thin} />
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
