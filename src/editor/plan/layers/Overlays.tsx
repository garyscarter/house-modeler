import { memo } from "react";
import { dist, edgeLengthsM, formatLength, inwardNormals } from "../../../lib/planMath";
import type { Guide } from "../../../lib/planGuides";
import type { wallClearances } from "../../../lib/planGuides";
import type { Pt, Room } from "../../../types";
import { DimensionChip } from "../../core";
import { edgeLabelAt, halo } from "./shared";

/** One of the room's walls picked out on the plan, numbered as in the inspector's list. */
export const LitEdge = memo(function LitEdge({ room, idx, px }: { room: Room; idx: number; px: number }) {
  const fontSize = px * 13;
  const a = room.polygon[idx];
  const b = room.polygon[(idx + 1) % room.polygon.length];
  const n = inwardNormals(room.polygon)[idx];
  // The number sits inside the room, clear of the edge's length label.
  const c = { x: (a.x + b.x) / 2 + n.x * px * 40, y: (a.y + b.y) / 2 + n.y * px * 40 };
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#db2777" strokeOpacity={0.45} strokeWidth={px * 12} strokeLinecap="round" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#db2777" strokeWidth={px * 3} strokeLinecap="round" />
      <circle cx={c.x} cy={c.y} r={fontSize * 0.95} fill="#db2777" stroke="#fff" strokeWidth={px * 1.5} />
      <text x={c.x} y={c.y} dy="0.35em" fontSize={fontSize * 0.9} textAnchor="middle" fill="#fff" fontWeight={700}>
        {idx + 1}
      </text>
    </g>
  );
});

/** Alignment guides while dragging furniture. */
export const Guides = memo(function Guides({ guides, px }: { guides: Guide[]; px: number }) {
  return (
    <g className="plan-guides" pointerEvents="none">
      {guides.map((g, i) => (
        <line
          key={i}
          className="plan-guide"
          x1={g.axis === "x" ? g.at : g.from}
          x2={g.axis === "x" ? g.at : g.to}
          y1={g.axis === "x" ? g.from : g.at}
          y2={g.axis === "x" ? g.to : g.at}
          stroke="#db2777"
          strokeWidth={px}
          strokeDasharray={`${px * 5} ${px * 4}`}
        />
      ))}
    </g>
  );
});

/** Gaps from the selected furniture to the walls on each side. */
export const Clearances = memo(function Clearances({ clearances, ppm, px }: { clearances: ReturnType<typeof wallClearances>; ppm: number; px: number }) {
  const fontSize = px * 13;
  return (
    <g className="plan-distances" pointerEvents="none">
      {clearances
        .filter((c) => c.px / ppm >= 0.005)
        .map((c) => {
          const tx = c.to.y - c.from.y;
          const ty = -(c.to.x - c.from.x);
          const tl = Math.hypot(tx, ty) || 1;
          const t = { x: (tx / tl) * px * 4, y: (ty / tl) * px * 4 };
          return (
            <g key={c.dir} className="plan-distance-line" stroke="#0e7490" strokeWidth={px * 1.25}>
              <line x1={c.from.x} y1={c.from.y} x2={c.to.x} y2={c.to.y} />
              <line x1={c.from.x - t.x} y1={c.from.y - t.y} x2={c.from.x + t.x} y2={c.from.y + t.y} />
              <line x1={c.to.x - t.x} y1={c.to.y - t.y} x2={c.to.x + t.x} y2={c.to.y + t.y} />
              <text
                className="plan-distance"
                x={(c.from.x + c.to.x) / 2}
                y={(c.from.y + c.to.y) / 2}
                dy="0.35em"
                fontSize={fontSize * 0.85}
                textAnchor="middle"
                fill="#0e7490"
                fontWeight={600}
                {...halo(px)}
                strokeOpacity={0.9}
              >
                {formatLength(c.px / ppm)}
              </text>
            </g>
          );
        })}
    </g>
  );
});

/** The selected room's edge lengths as chips; press one to type a new length. */
export const EdgeLabels = memo(function EdgeLabels({
  room,
  ppm,
  px,
  editing,
  onChipDown,
}: {
  room: Room;
  ppm: number;
  px: number;
  editing: number | null;
  onChipDown: (e: React.PointerEvent, roomId: string, i: number, locked: boolean) => void;
}) {
  const fontSize = px * 13;
  const lens = edgeLengthsM(room.polygon, ppm);
  return (
    <g>
      {lens.map((len, i) => {
        if (i === editing || len * ppm < px * 30) return null;
        return (
          <DimensionChip
            key={i}
            at={edgeLabelAt(room, i, px, fontSize, ppm)}
            text={formatLength(len)}
            px={px}
            fontSize={fontSize}
            className="plan-edge-label"
            title="Click to type a new length; the edge's end corner moves"
            onPointerDown={(e) => onChipDown(e, room.id, i, !!room.locked)}
          />
        );
      })}
    </g>
  );
});

/** The Measure tool's ruler: a line with end ticks and a rotated length label, and the first point's dot. */
export const MeasureOverlay = memo(function MeasureOverlay({ a, b, ppm, px }: { a: Pt; b: Pt | undefined; ppm: number; px: number }) {
  return (
    <>
      {b && <MeasureLine a={a} b={b} ppm={ppm} px={px} fontSize={px * 13} />}
      <circle cx={a.x} cy={a.y} r={px * 4} fill="#7c3aed" style={{ pointerEvents: "none" }} />
    </>
  );
});

function MeasureLine({ a, b, ppm, px, fontSize }: { a: Pt; b: Pt; ppm: number; px: number; fontSize: number }) {
  const len = dist(a, b);
  if (len < px) return null;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const tick = px * 7;
  let angle = (Math.atan2(uy, ux) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  const text = formatLength(len / ppm);
  const w = text.length * fontSize * 0.6 + px * 10;
  const h = fontSize * 1.5;
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#7c3aed" strokeWidth={px * 2} />
      {[a, b].map((p, i) => (
        <line key={i} x1={p.x - uy * tick} y1={p.y + ux * tick} x2={p.x + uy * tick} y2={p.y - ux * tick} stroke="#7c3aed" strokeWidth={px * 2} />
      ))}
      <g transform={`translate(${(a.x + b.x) / 2 - uy * px * 16} ${(a.y + b.y) / 2 + ux * px * 16}) rotate(${angle})`}>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={px * 4} fill="#7c3aed" />
        <text dy="0.35em" fontSize={fontSize} textAnchor="middle" fill="#fff" fontWeight={600}>
          {text}
        </text>
      </g>
    </g>
  );
}

/** The two points picked so far when calibrating the scale. */
export const CalibDots = memo(function CalibDots({ points, px }: { points: Pt[]; px: number }) {
  return (
    <>
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={px * 6} fill="#ef4444" />
      ))}
    </>
  );
});

/** The rubber-band for the drawing tools: a rectangle (room, canopy), a polyline (room) and the dot under the pointer. */
export const Draft = memo(function Draft({
  tool,
  draft,
  hover,
  px,
}: {
  tool: "rect" | "canopy" | "room" | "wall" | "measure" | string;
  draft: Pt[];
  hover: Pt | null;
  px: number;
}) {
  const stroke = px * 1.25;
  return (
    <>
      {(tool === "rect" || tool === "canopy") && draft.length === 1 && hover && (
        <rect
          x={Math.min(draft[0].x, hover.x)}
          y={Math.min(draft[0].y, hover.y)}
          width={Math.abs(hover.x - draft[0].x)}
          height={Math.abs(hover.y - draft[0].y)}
          fill="#16a34a"
          fillOpacity={0.2}
          stroke="#16a34a"
          strokeWidth={stroke * 2}
          style={{ pointerEvents: "none" }}
        />
      )}
      {tool === "room" && draft.length > 0 && (
        <polyline
          points={[...draft, ...(hover ? [hover] : [])].map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#16a34a"
          strokeWidth={stroke * 2}
          style={{ pointerEvents: "none" }}
        />
      )}
      {(tool === "rect" || tool === "canopy" || tool === "room" || tool === "wall" || tool === "measure") && hover && (
        <circle cx={hover.x} cy={hover.y} r={px * 4} fill={tool === "measure" ? "#7c3aed" : "#16a34a"} style={{ pointerEvents: "none" }} />
      )}
    </>
  );
});

/** The Shift+drag selection rectangle in Furnish. */
export const Marquee = memo(function Marquee({ a, b, px }: { a: Pt; b: Pt; px: number }) {
  return (
    <rect
      x={Math.min(a.x, b.x)}
      y={Math.min(a.y, b.y)}
      width={Math.abs(a.x - b.x)}
      height={Math.abs(a.y - b.y)}
      fill="var(--plan-sel)"
      fillOpacity={0.08}
      stroke="var(--plan-sel)"
      strokeWidth={px * 1.25}
      strokeDasharray={`${px * 5} ${px * 3}`}
      style={{ pointerEvents: "none" }}
    />
  );
});
