import type { Pt } from "../types";

/** The real going (tread depth) a flight is drawn with, in metres. */
export const STAIR_GOING_M = 0.25;

const UNIT: Record<"up" | "down" | "left" | "right", Pt> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

/**
 * Architectural stairs: an outline, a thin tread line every going across the flight, a centre line with an
 * arrow at the top and "UP" / "DOWN" in small caps. Drawn in `--text` at 60%; accent while `active`
 * (being dragged). Purely visual: the caller supplies the hit area.
 */
export function StairsSymbol({
  centre,
  run,
  width,
  ppm,
  dir,
  winders,
  px,
  active,
  label,
}: {
  centre: Pt;
  /** Flight length in image px. */
  run: number;
  /** Flight width in image px. */
  width: number;
  ppm: number;
  dir: "up" | "down" | "left" | "right";
  winders: Pt[][];
  /** One screen pixel in image px. */
  px: number;
  active: boolean;
  /** "UP" or "DOWN": the direction of travel from this floor. */
  label: string;
}) {
  const u = UNIT[dir];
  const n = { x: -u.y, y: u.x };
  const horiz = dir === "left" || dir === "right";
  const rw = horiz ? run : width;
  const rh = horiz ? width : run;
  const at = (along: number, across: number): Pt => ({ x: centre.x + u.x * along + n.x * across, y: centre.y + u.y * along + n.y * across });
  const treads = Math.max(1, Math.round(run / (STAIR_GOING_M * ppm)));
  const lines: [Pt, Pt][] = [];
  for (let k = 1; k < treads; k++) {
    const along = -run / 2 + (k * run) / treads;
    lines.push([at(along, -width / 2), at(along, width / 2)]);
  }
  const tail = at(-run / 2, 0);
  const tip = at(run / 2, 0);
  const head = px * 7;
  const barbA = at(run / 2 - head, -head * 0.55);
  const barbB = at(run / 2 - head, head * 0.55);
  // The caption sits in screen orientation just past the tail end, inside the flight.
  const cap = at(-run / 2 + Math.min(run * 0.3, px * 16), 0);
  const ink = active ? "var(--plan-sel)" : "var(--plan-stairs)";
  const common = { stroke: ink, strokeOpacity: active ? 1 : 0.6, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <g className="plan-stairs" style={{ pointerEvents: "none" }}>
      <rect x={centre.x - rw / 2} y={centre.y - rh / 2} width={rw} height={rh} {...common} strokeWidth={px * 1.25} fill="var(--plan-stairs-fill)" fillOpacity={active ? 0.18 : 0.5} />
      {lines.map(([a, b], i) => (
        <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...common} strokeWidth={px} />
      ))}
      {winders.map((pts, i) => (
        <polyline key={"w" + i} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} {...common} strokeWidth={px} />
      ))}
      <polyline points={`${tail.x},${tail.y} ${tip.x},${tip.y}`} {...common} strokeWidth={px * 1.25} />
      <polyline points={`${barbA.x},${barbA.y} ${tip.x},${tip.y} ${barbB.x},${barbB.y}`} {...common} strokeWidth={px * 1.25} />
      <text
        x={cap.x}
        y={cap.y}
        dy="0.35em"
        textAnchor="middle"
        fontSize={px * 9}
        fontWeight={600}
        letterSpacing={px * 0.6}
        fill={ink}
        fillOpacity={active ? 1 : 0.6}
        style={{ paintOrder: "stroke", stroke: "var(--plan-chip-bg)", strokeWidth: px * 3, strokeOpacity: 0.85, strokeLinejoin: "round", fontFamily: "var(--font-ui)" }}
      >
        {label}
      </text>
    </g>
  );
}
