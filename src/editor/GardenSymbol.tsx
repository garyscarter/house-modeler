import { memo, type ReactNode } from "react";
import { itemSize, type GardenDef } from "../lib/gardenCatalogue";
import { alongEvery, festoonCurve, steppingStones } from "../lib/siteItems";
import type { GardenItem } from "../types";

/**
 * Top-down plan symbol for a garden item or plant, one case per `GardenShape`.
 * Drawn in world metres (the site editor's SVG units): `px` is one screen pixel
 * in metres, so strokes stay crisp at every zoom. Items are drawn in a local
 * frame centred on (x, y) with the back along the top edge and turned by
 * `rot`; runs (festoons, stones, hedges, climbers) are drawn in world metres
 * from `item` to `item.to`. Colours come from the item or the catalogue; the
 * selection stroke is the brand accent.
 */

const INK = "var(--text, #1f2933)";
const SEL = "var(--plan-sel, var(--accent, #2563eb))";

/** A closed path of `n` lobes round a circle of radius `r`: the leafy outline of a plant. `seed` varies the lobes. */
export function scallopPath(r: number, n: number, seed = 0): string {
  const pt = (i: number) => {
    const a = (i / n) * Math.PI * 2;
    const k = 0.9 + 0.1 * Math.sin(seed * 12.9898 + i * 4.1414);
    return { x: Math.cos(a) * r * 0.86 * k, y: Math.sin(a) * r * 0.86 * k };
  };
  const pts = Array.from({ length: n }, (_, i) => pt(i));
  const lobe = ((2 * Math.PI * r * 0.86) / n) * 0.62;
  return `M ${pts[0].x} ${pts[0].y} ` + pts.map((_, i) => { const q = pts[(i + 1) % n]; return `A ${lobe} ${lobe} 0 0 1 ${q.x} ${q.y}`; }).join(" ") + " Z";
}

/** A number from a string id, 0 to 1, so a plant keeps its look. */
function seedOf(item: Pick<GardenItem, "id" | "seed">): number {
  if (item.seed !== undefined) return item.seed;
  let h = 0;
  for (const c of item.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 1000) / 1000;
}

interface Props {
  def: GardenDef;
  item: GardenItem;
  /** One screen pixel in metres. */
  px: number;
  selected?: boolean;
  /** A translucent placement ghost. */
  ghost?: boolean;
}

export const GardenSymbol = memo(function GardenSymbol({ def, item, px, selected, ghost }: Props) {
  const { w, d } = itemSize(item);
  const color = item.color ?? def.color;
  const accent = item.accent ?? def.accent ?? color;
  const outline = selected ? SEL : INK;
  const sw = px * (selected ? 2.2 : 1.1);
  const line = { stroke: outline, strokeWidth: sw * 0.8, fill: "none" as const, strokeOpacity: selected ? 1 : 0.7 };
  const thin = { stroke: outline, strokeWidth: sw * 0.5, fill: "none" as const, strokeOpacity: selected ? 0.9 : 0.45 };
  const fill = { fill: color, fillOpacity: 0.88, stroke: outline, strokeWidth: sw, strokeOpacity: selected ? 1 : 0.7 };
  const group = (inner: ReactNode, transform?: string) => (
    <g transform={transform} opacity={ghost ? 0.5 : 1} className="garden-symbol" data-garden-type={def.id} pointerEvents="none">
      {inner}
    </g>
  );
  const seed = seedOf(item);

  // Runs are drawn in world metres.
  if (item.to) {
    const a = { x: item.x, y: item.y };
    const b = item.to;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 0.001;
    const pitch = def.pitch ?? 0.5;
    switch (def.shape) {
      case "festoon": {
        const h0 = item.h ?? def.h;
        const curve = festoonCurve({ x: a.x, y: h0, z: a.y }, { x: b.x, y: item.toH ?? h0, z: b.y }, item.sag ?? 0.3);
        const bulbs = alongEvery(curve, pitch);
        return group(
          <>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={outline} strokeWidth={sw} strokeDasharray={`${px * 5} ${px * 3}`} strokeOpacity={selected ? 1 : 0.75} />
            {bulbs.map((p, i) => <circle key={i} cx={p.x} cy={p.z} r={Math.max(0.05, px * 2.2)} fill={def.glow ?? "#ffd9a0"} stroke={outline} strokeWidth={sw * 0.5} />)}
            {[a, b].map((p, i) => <circle key={`e${i}`} cx={p.x} cy={p.y} r={Math.max(0.07, px * 3.2)} fill={color} stroke={outline} strokeWidth={sw} />)}
          </>,
        );
      }
      case "stepping-stones": {
        const stones = steppingStones(item);
        return group(
          stones.map((s, i) => (
            <rect key={i} x={-w / 2} y={-w / 2} width={w} height={w} rx={w * 0.22} transform={`translate(${s.x} ${s.y}) rotate(${s.rot + (((i * 37) % 21) - 10)})`} {...fill} />
          )),
        );
      }
      case "climber": {
        // A leafy band on the wall: scalloped dots along the line, on its left side.
        const n = Math.max(2, Math.round(len / pitch));
        const nx = (-dy / len) * (w / 2);
        const ny = (dx / len) * (w / 2);
        return group(
          <>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeOpacity={0.55} strokeWidth={w} strokeLinecap="round" />
            {Array.from({ length: n + 1 }, (_, i) => (
              <circle key={i} cx={a.x + (dx * i) / n + nx * 0.4} cy={a.y + (dy * i) / n + ny * 0.4} r={w * 0.5} fill={color} fillOpacity={0.85} stroke={outline} strokeWidth={sw * 0.5} strokeOpacity={0.5} />
            ))}
            {Array.from({ length: Math.floor(n / 2) }, (_, i) => (
              <circle key={`f${i}`} cx={a.x + (dx * (2 * i + 1)) / n + nx * 0.4} cy={a.y + (dy * (2 * i + 1)) / n + ny * 0.4} r={w * 0.14} fill={accent} />
            ))}
            {selected && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={SEL} strokeWidth={sw} />}
          </>,
        );
      }
      default: {
        // Hedge, bamboo: overlapping leafy discs along the line.
        const n = Math.max(1, Math.round(len / pitch));
        const r = w / 2;
        const bamboo = def.shape === "bamboo";
        return group(
          <>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeOpacity={0.7} strokeWidth={w * (bamboo ? 0.7 : 0.9)} strokeLinecap="round" />
            {Array.from({ length: n + 1 }, (_, i) => (
              <path
                key={i}
                d={scallopPath(r, bamboo ? 6 : 8, seed + i)}
                transform={`translate(${a.x + (dx * i) / n} ${a.y + (dy * i) / n})`}
                fill={color}
                fillOpacity={0.85}
                stroke={outline}
                strokeWidth={sw * 0.6}
                strokeOpacity={selected ? 1 : 0.5}
              />
            ))}
            {selected && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={SEL} strokeWidth={sw} strokeDasharray={`${px * 4} ${px * 3}`} />}
          </>,
        );
      }
    }
  }

  const at = `translate(${item.x} ${item.y}) rotate(${item.rot})`;
  const x0 = -w / 2;
  const y0 = -d / 2;
  const body = (rx = Math.min(w, d) * 0.06) => <rect x={x0} y={y0} width={w} height={d} rx={rx} {...fill} />;
  const r = w / 2;
  const disc = (rad = r) => <circle r={rad} {...fill} />;
  const dot = (x: number, y: number, rad: number, fillColor: string) => <circle key={`${x}${y}`} cx={x} cy={y} r={rad} fill={fillColor} />;
  /** Small accent dots (flowers, fruit) in a ring round the middle of a plant. */
  const dots = (count: number, ring: number, size: number) => Array.from({ length: count }, (_, i) => dot(Math.cos(i * 2.4 + seed * 6) * ring * (0.35 + 0.6 * ((i * 0.37) % 1)), Math.sin(i * 2.4 + seed * 6) * ring * (0.35 + 0.6 * ((i * 0.37) % 1)), size, accent));
  const leafy = (lobes: number) => <path d={scallopPath(r, lobes, seed)} fill={color} fillOpacity={0.88} stroke={outline} strokeWidth={sw} strokeOpacity={selected ? 1 : 0.7} />;
  const trunk = <circle r={Math.max(0.05, Math.min(0.12, r * 0.1))} fill={def.trunk ?? "#5a4030"} stroke={outline} strokeWidth={sw * 0.5} />;

  switch (def.shape) {
    case "dining-set": {
      const seats = item.seats ?? def.seats ?? 4;
      if (def.round) {
        const chair = Math.min(w, d) * 0.16;
        return group(
          <>
            {Array.from({ length: seats }, (_, i) => {
              const a = (i / seats) * Math.PI * 2 - Math.PI / 2;
              return <rect key={i} x={-chair / 2} y={-chair / 2} width={chair} height={chair} rx={chair * 0.3} transform={`translate(${Math.cos(a) * r * 0.78} ${Math.sin(a) * r * 0.78}) rotate(${(a * 180) / Math.PI + 90})`} fill={accent} fillOpacity={0.85} stroke={outline} strokeWidth={sw * 0.6} strokeOpacity={selected ? 1 : 0.6} />;
            })}
            <circle r={r * 0.5} {...fill} />
            <circle r={r * 0.34} {...thin} />
          </>,
          at,
        );
      }
      const perSide = Math.max(0, Math.floor((seats - 2) / 2));
      const ends = Math.min(2, seats - perSide * 2);
      const tableD = d * 0.44;
      const cw = Math.min(0.5, w / (perSide + 1) * 0.6);
      const cd = Math.min(0.45, (d - tableD) / 2 - 0.02);
      const chair = (key: string, cx: number, cy: number, cw2: number, cd2: number) => <rect key={key} x={cx - cw2 / 2} y={cy - cd2 / 2} width={cw2} height={cd2} rx={Math.min(cw2, cd2) * 0.3} fill={accent} fillOpacity={0.85} stroke={outline} strokeWidth={sw * 0.6} strokeOpacity={selected ? 1 : 0.6} />;
      const tw = w - (ends ? 0.5 : 0);
      return group(
        <>
          {Array.from({ length: perSide }, (_, i) => {
            const cx = -tw / 2 + (tw * (i + 0.5)) / perSide;
            return [chair(`t${i}`, cx, -tableD / 2 - cd / 2, cw, cd), chair(`b${i}`, cx, tableD / 2 + cd / 2, cw, cd)];
          })}
          {ends >= 1 && chair("el", -w / 2 + 0.22, 0, 0.42, 0.5)}
          {ends >= 2 && chair("er", w / 2 - 0.22, 0, 0.42, 0.5)}
          <rect x={-tw / 2} y={-tableD / 2} width={tw} height={tableD} rx={0.04} {...fill} />
        </>,
        at,
      );
    }
    case "lounge-set": {
      const arm = Math.min(0.85, Math.min(w, d) * 0.4);
      return group(
        <>
          <path d={`M ${x0} ${y0} H ${-x0} V ${y0 + arm} H ${x0 + arm} V ${-y0} H ${x0} Z`} {...fill} />
          <path d={`M ${x0 + arm} ${y0 + arm} V ${y0 + arm * 0.2} M ${x0 + arm * 0.2} ${y0 + arm} H ${-x0 - arm * 0.1}`} {...thin} />
          <rect x={x0 + arm + 0.2} y={y0 + arm + 0.2} width={Math.max(0.3, w - arm - 0.7)} height={Math.max(0.3, d - arm - 0.7)} rx={0.04} fill={accent} fillOpacity={0.9} stroke={outline} strokeWidth={sw * 0.7} strokeOpacity={0.7} />
        </>,
        at,
      );
    }
    case "bench":
      return group(
        <>
          {body(0.03)}
          {[0.25, 0.5, 0.75].map((t) => <line key={t} x1={x0} y1={y0 + d * t} x2={-x0} y2={y0 + d * t} {...thin} />)}
          <line x1={x0} y1={y0 + d * 0.18} x2={-x0} y2={y0 + d * 0.18} {...line} />
        </>,
        at,
      );
    case "parasol": {
      const oct = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; return `${Math.cos(a) * r},${Math.sin(a) * r}`; }).join(" ");
      return group(
        <>
          <polygon points={oct} fill={accent} fillOpacity={0.35} stroke={outline} strokeWidth={sw} strokeOpacity={selected ? 1 : 0.7} strokeDasharray={`${px * 6} ${px * 3}`} />
          {Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; return <line key={i} x1={0} y1={0} x2={Math.cos(a) * r} y2={Math.sin(a) * r} {...thin} />; })}
          <circle r={0.05} fill={color} stroke={outline} strokeWidth={sw * 0.6} />
        </>,
        at,
      );
    }
    case "bbq":
      return group(
        def.round ? (
          <>
            {disc()}
            <circle r={r * 0.65} {...thin} />
            <circle r={0.03} fill={outline} />
          </>
        ) : (
          <>
            {body()}
            <circle cx={-w * 0.22} cy={d * 0.04} r={Math.min(w * 0.14, d * 0.3)} {...line} />
            <circle cx={w * 0.22} cy={d * 0.04} r={Math.min(w * 0.14, d * 0.3)} {...line} />
            <line x1={x0} y1={y0 + d * 0.22} x2={-x0} y2={y0 + d * 0.22} {...thin} />
          </>
        ),
        at,
      );
    case "fire-pit":
      return group(
        <>
          {disc()}
          <circle r={r * 0.62} fill="#2a2522" fillOpacity={0.9} />
          <circle r={r * 0.25} fill="#e0752b" />
        </>,
        at,
      );
    case "pot":
      return group(
        <>
          {disc()}
          <circle r={r * 0.74} fill={accent} fillOpacity={0.7} stroke={outline} strokeWidth={sw * 0.5} strokeOpacity={0.5} />
          <path d={scallopPath(r * 0.6, 7, seed)} fill={accent} stroke={outline} strokeWidth={sw * 0.4} strokeOpacity={0.4} />
        </>,
        at,
      );
    case "planter":
      return group(
        <>
          {body(0.03)}
          <rect x={x0 + w * 0.06} y={y0 + d * 0.15} width={w * 0.88} height={d * 0.7} rx={0.02} fill={accent} fillOpacity={0.75} stroke={outline} strokeWidth={sw * 0.5} strokeOpacity={0.5} />
        </>,
        at,
      );
    case "shed":
    case "playhouse":
      return group(
        <>
          {body(0.02)}
          <line x1={x0} y1={0} x2={-x0} y2={0} {...line} />
          <line x1={x0} y1={0} x2={x0 + w * 0.08} y2={y0 + 0.02} {...thin} />
          <rect x={-w * 0.12} y={-y0 - 0.1} width={w * 0.24} height={0.1} fill={accent} stroke={outline} strokeWidth={sw * 0.5} />
        </>,
        at,
      );
    case "pergola": {
      const rafters = Math.max(3, Math.round(w / 0.35));
      return group(
        <>
          <rect x={x0} y={y0} width={w} height={d} fill={color} fillOpacity={0.12} stroke={outline} strokeWidth={sw} strokeOpacity={selected ? 1 : 0.75} />
          {Array.from({ length: rafters + 1 }, (_, i) => <line key={i} x1={x0 + (w * i) / rafters} y1={y0} x2={x0 + (w * i) / rafters} y2={-y0} stroke={color} strokeWidth={Math.max(0.04, sw * 0.9)} strokeOpacity={0.85} />)}
          {[[x0, y0], [-x0, y0], [x0, -y0], [-x0, -y0]].map(([cx, cy], i) => <rect key={i} x={cx - 0.075} y={cy - 0.075} width={0.15} height={0.15} fill={color} stroke={outline} strokeWidth={sw * 0.7} />)}
        </>,
        at,
      );
    }
    case "mud-kitchen":
      return group(
        <>
          {body(0.02)}
          <circle cx={x0 + w * 0.25} cy={0.05} r={Math.min(w, d) * 0.2} {...line} />
          <circle cx={w * 0.2} cy={-d * 0.12} r={Math.min(w, d) * 0.09} {...thin} />
          <circle cx={w * 0.2} cy={d * 0.18} r={Math.min(w, d) * 0.09} {...thin} />
        </>,
        at,
      );
    case "trampoline":
      return group(
        <>
          {disc()}
          <circle r={r * 0.82} {...thin} strokeDasharray={`${px * 2} ${px * 2}`} />
          <circle r={r * 0.7} fill={accent} fillOpacity={0.55} stroke={outline} strokeWidth={sw * 0.6} strokeOpacity={0.6} />
        </>,
        at,
      );
    case "bin-store":
      return group(
        <>
          {body(0.03)}
          <rect x={x0 + w * 0.06} y={y0 + d * 0.15} width={w * 0.4} height={d * 0.7} rx={0.05} {...thin} fill={accent} fillOpacity={0.5} />
          <rect x={w * 0.04} y={y0 + d * 0.15} width={w * 0.4} height={d * 0.7} rx={0.05} {...thin} fill={accent} fillOpacity={0.5} />
        </>,
        at,
      );
    case "recycling-box":
      return group(
        <>
          {body(0.03)}
          <rect x={x0 + w * 0.12} y={y0 + d * 0.15} width={w * 0.76} height={d * 0.7} rx={0.03} {...thin} />
        </>,
        at,
      );
    case "water-butt":
      return group(
        <>
          {disc()}
          <circle r={r * 0.7} {...thin} />
          <circle r={r * 0.15} fill={outline} fillOpacity={0.5} />
        </>,
        at,
      );
    case "washing-line":
      return group(
        <>
          <circle r={r} fill={color} fillOpacity={0.08} stroke={outline} strokeWidth={sw * 0.7} strokeOpacity={0.6} strokeDasharray={`${px * 6} ${px * 3}`} />
          <circle r={r * 0.6} {...thin} />
          <circle r={r * 0.3} {...thin} />
          {[0, 90, 180, 270].map((a) => <line key={a} x1={0} y1={0} x2={Math.cos((a * Math.PI) / 180) * r} y2={Math.sin((a * Math.PI) / 180) * r} {...line} />)}
          <circle r={0.05} fill={outline} />
        </>,
        at,
      );
    case "bollard":
      return group(
        <>
          <circle r={Math.max(r, px * 3.5)} {...fill} />
          <circle r={Math.max(r * 0.45, px * 1.5)} fill={def.glow ?? "#ffd9a0"} />
        </>,
        at,
      );
    case "wall-light": {
      const lw = Math.max(w, px * 8);
      return group(
        <>
          <circle cx={0} cy={y0 + 0.22} r={0.28} fill={def.glow ?? "#ffd9a0"} fillOpacity={0.25} />
          <rect x={-lw / 2} y={y0 - 0.02} width={lw} height={Math.max(d, 0.1)} rx={0.02} {...fill} />
          <circle cx={0} cy={y0 + Math.max(d, 0.1)} r={0.04} fill={def.glow ?? "#ffd9a0"} stroke={outline} strokeWidth={sw * 0.4} />
        </>,
        at,
      );
    }
    case "conifer":
      return group(
        <>
          {leafy(10)}
          {Array.from({ length: 5 }, (_, i) => { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; return <line key={i} x1={0} y1={0} x2={Math.cos(a) * r * 0.7} y2={Math.sin(a) * r * 0.7} {...thin} />; })}
          {trunk}
        </>,
        at,
      );
    case "birch":
    case "olive":
    case "bay":
    case "acer":
      return group(
        <>
          {leafy(shapeLobes(def.shape))}
          {def.shape === "acer" && dots(5, r * 0.6, r * 0.07)}
          {trunk}
        </>,
        at,
      );
    case "apple":
      return group(
        <>
          {leafy(9)}
          {dots(7, r * 0.7, Math.max(0.06, r * 0.05))}
          {trunk}
        </>,
        at,
      );
    case "buddleia":
      return group(
        <>
          {leafy(8)}
          {dots(8, r * 0.7, Math.max(0.06, r * 0.05))}
          {trunk}
        </>,
        at,
      );
    case "box-ball":
      return group(<>{leafy(8)}<circle r={r * 0.45} {...thin} /></>, at);
    case "lavender":
    case "hydrangea":
    case "perennials":
      return group(
        <>
          {leafy(shapeLobes(def.shape))}
          {dots(def.shape === "hydrangea" ? 6 : 9, r * 0.65, Math.max(0.04, r * 0.07))}
        </>,
        at,
      );
    case "grass":
      return group(
        <>
          <circle r={r * 0.86} fill={color} fillOpacity={0.4} stroke="none" />
          {Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2 + seed; return <line key={i} x1={0} y1={0} x2={Math.cos(a) * r * 0.9} y2={Math.sin(a) * r * 0.9} stroke={color} strokeWidth={Math.max(0.02, sw * 0.8)} strokeLinecap="round" />; })}
          <circle r={r * 0.86} {...thin} />
        </>,
        at,
      );
    case "climber":
    case "hedge":
    case "bamboo":
    case "festoon":
    case "stepping-stones":
      // Runs without `to` (a half-made item): a single marker.
      return group(<circle r={Math.max(0.1, w / 2)} {...fill} />, at);
    default:
      return group(body(), at);
  }
});

function shapeLobes(shape: string): number {
  return shape === "birch" ? 9 : shape === "olive" ? 8 : shape === "bay" ? 8 : shape === "acer" ? 7 : shape === "lavender" ? 9 : shape === "hydrangea" ? 8 : 7;
}

/** A small preview of a catalogue entry for the picker, in a square viewBox. */
export function GardenThumb({ def, size = 40 }: { def: GardenDef; size?: number }) {
  const run = !!def.run;
  const w = run ? Math.max(1.2, def.w * 2) : def.w;
  const d = run ? Math.max(0.4, def.w * 2) : def.d;
  const extent = Math.max(w, d, 0.3) * 1.15;
  const item: GardenItem = { id: `thumb-${def.id}`, type: def.id, x: run ? -w / 2 : 0, y: 0, rot: 0, ...(run ? { to: { x: w / 2, y: 0 }, sag: 0.1 } : {}) };
  return (
    <svg className="garden-thumb" width={size} height={size} viewBox={`${-extent / 2} ${-extent / 2} ${extent} ${extent}`} aria-hidden="true" focusable="false">
      <GardenSymbol def={def} item={item} px={extent / size} />
    </svg>
  );
}
