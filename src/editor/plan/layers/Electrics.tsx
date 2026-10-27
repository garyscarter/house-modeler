import { memo, useMemo } from "react";
import { ELECTRIC_GLYPH_M } from "../../../lib/electricSymbols";
import { glyphOffset, isWallPoint, type Link, type NumberedPoint } from "../../../lib/electrics";
import { lampBulbs } from "../../../lib/lights";
import { ElectricGlyph } from "../../ElectricGlyph";
import type { Fixture } from "../../../types";
import { halo } from "./shared";

interface Placed {
  p: NumberedPoint;
  /** Glyph centre in image px. */
  x: number;
  y: number;
  /** Unit vector from the wall into the room (wall points) or null. */
  n: { x: number; y: number } | null;
}

/** Glyph size in image px: the real 0.25 m, never under 14 screen px. */
const glyphPx = (ppm: number, px: number) => Math.max(ELECTRIC_GLYPH_M * ppm, px * 14);

function place(p: NumberedPoint, ppm: number, size: number): Placed {
  const o = glyphOffset(p.fx, p.item, size / ppm);
  const wall = isWallPoint(p.item);
  const len = Math.hypot(o.x, o.y);
  return { p, x: p.fx.x + o.x * ppm, y: p.fx.y + o.y * ppm, n: wall && len > 1e-9 ? { x: o.x / len, y: o.y / len } : null };
}

/**
 * The Electrics mode's drawing: every point of the floor as its BS EN 60617 symbol with its per-room number, and the
 * switch-to-light links as dashed arcs (a link to another floor is a stub). Presses go to `onDown` (the fixture machinery).
 */
export const ElectricsLayer = memo(function ElectricsLayer({
  points,
  links,
  selectedIds,
  linkSwitchId,
  linkedIds,
  ppm,
  px,
  touch,
  onDown,
}: {
  points: NumberedPoint[];
  /** Links whose switch is on this floor. */
  links: Link[];
  selectedIds: string[];
  linkSwitchId: string | null;
  /** The lights the selected (or linking) switch controls: ringed. */
  linkedIds: ReadonlySet<string>;
  ppm: number;
  px: number;
  touch: boolean;
  onDown: (e: React.PointerEvent, fx: Fixture) => void;
}) {
  const size = glyphPx(ppm, px);
  const placed = useMemo(() => points.map((p) => place(p, ppm, size)), [points, ppm, size]);
  const at = useMemo(() => new Map(placed.map((q) => [q.p.fx.id, q])), [placed]);
  const hit = Math.max(size * 1.2, px * (touch ? 36 : 22));
  return (
    <g className="electrics-layer">
      {links.map((l, i) => {
        const a = at.get(l.from.fx.id);
        if (!a) return null;
        const hot = selectedIds.includes(l.from.fx.id) || linkSwitchId === l.from.fx.id;
        const stroke = hot ? "var(--plan-sel)" : "var(--muted)";
        const b = at.get(l.to.fx.id);
        if (b) {
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          const cx = mx + (-(b.y - a.y) / (len || 1)) * len * 0.2;
          const cy = my + ((b.x - a.x) / (len || 1)) * len * 0.2;
          return <path key={`l${i}`} d={`M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`} fill="none" stroke={stroke} strokeWidth={px * (hot ? 1.6 : 1.1)} strokeDasharray={`${px * 5} ${px * 4}`} style={{ pointerEvents: "none" }} />;
        }
        const up = l.to.floor.level > l.from.floor.level;
        const dy = (up ? -1 : 1) * px * 26;
        return (
          <g key={`l${i}`} style={{ pointerEvents: "none" }}>
            <line x1={a.x} y1={a.y} x2={a.x} y2={a.y + dy} stroke={stroke} strokeWidth={px * 1.2} strokeDasharray={`${px * 4} ${px * 3}`} />
            <text x={a.x + px * 4} y={a.y + dy} fontSize={px * 10} fill={stroke} dominantBaseline="middle" {...halo(px)}>
              {up ? "↑" : "↓"} {l.to.floor.name} {l.to.label}
            </text>
          </g>
        );
      })}
      {placed.map((q) => {
        const { fx, item } = q.p;
        const sel = selectedIds.includes(fx.id);
        const ink = sel ? "var(--plan-sel)" : "var(--text)";
        const bulbs = item.grid ? lampBulbs(fx, item, { w: item.w, d: item.d, h: item.h }) : [];
        const gs = bulbs.length > 1 ? size * 0.7 : size;
        const lx = q.n ? q.x + q.n.x * (size / 2 + px * 9) : q.x + size / 2 + px * 4;
        const ly = q.n ? q.y + q.n.y * (size / 2 + px * 9) : q.y;
        return (
          <g key={fx.id} className="plan-fixture plan-point" data-fixture-id={fx.id} data-point={q.p.label} onPointerDown={(e) => onDown(e, fx)}>
            <rect x={q.x - hit / 2} y={q.y - hit / 2} width={hit} height={hit} fill="transparent" />
            {bulbs.length > 1 ? (
              bulbs.map((b, i) => {
                const a = (fx.rot * Math.PI) / 180;
                const bx = fx.x + (b[0] * Math.cos(a) - b[2] * Math.sin(a)) * ppm;
                const by = fx.y + (b[0] * Math.sin(a) + b[2] * Math.cos(a)) * ppm;
                return (
                  <g key={i} transform={`translate(${bx} ${by})`} style={{ pointerEvents: "none" }}>
                    <ElectricGlyph symbol="downlight" size={gs} stroke={px * 1.2} ink={ink} />
                  </g>
                );
              })
            ) : (
              <g transform={`translate(${q.x} ${q.y}) rotate(${fx.rot})`} style={{ pointerEvents: "none" }}>
                <ElectricGlyph symbol={item.symbol} size={gs} stroke={px * 1.4} ink={ink} />
              </g>
            )}
            {(sel || linkedIds.has(fx.id)) && (
              <circle cx={q.x} cy={q.y} r={size * 0.78} fill="none" stroke="var(--plan-sel)" strokeWidth={px * 1.6} strokeDasharray={sel ? undefined : `${px * 3} ${px * 3}`} style={{ pointerEvents: "none" }} />
            )}
            <text x={lx} y={ly} fontSize={px * 11} dominantBaseline="middle" textAnchor={q.n ? "middle" : "start"} fill={ink} className="plan-text" style={{ pointerEvents: "none" }} {...halo(px)}>
              {q.p.label}
            </text>
          </g>
        );
      })}
    </g>
  );
});
