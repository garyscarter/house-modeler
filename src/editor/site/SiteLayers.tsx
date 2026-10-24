import { svgPoints } from "../../lib/planMath";
import { polygonCentroid } from "../../lib/geometry";
import { rectPoly, edgesOf, type LevelOutline, type sideClearances } from "../../lib/site";
import type { LevelWalls } from "../../lib/siteWalls";
import { edgeLength } from "../../lib/boundaryOpening";
import { type Site, type SurfaceKind } from "../../types";
import { sameItem, type Draft, type Item, type Sel, type Tool } from "./types";

type Down = (e: React.PointerEvent, s: Item) => void;

export const SURFACE_FILL: Record<SurfaceKind, string> = {
  lawn: "#a7cf8e",
  patio: "#e3d6bc",
  drive: "#c9a89a",
  path: "#ddd6c8",
  bed: "#8f7a5c",
  pavement: "#d4d6d9",
  road: "#7d8086",
};

interface WorldProps {
  site: Site;
  sel: Sel;
  tool: Tool;
  px: number;
  outlines: LevelOutline[];
  walls: LevelWalls[];
  clearances: ReturnType<typeof sideClearances>;
  onItemDown: Down;
}

/** Surfaces, neighbours, the house, the boundary edges and the clearance dimensions, all in world metres. */
export function SiteWorld({ site, sel, tool, px, outlines, walls, clearances, onItemDown }: WorldProps) {
  const edges = edgesOf(site);
  const selected = (t: Item) => !!sel && sameItem(sel, t);
  const fs = 12 * px;
  return (
    <>
      {site.surfaces.map((s) => (
        <polygon
          key={s.id}
          points={svgPoints(s.polygon)}
          fill={SURFACE_FILL[s.kind]}
          fillOpacity={0.75}
          stroke={selected({ type: "surface", id: s.id, vertex: null }) ? "#2563eb" : "rgba(0,0,0,0.15)"}
          strokeWidth={(selected({ type: "surface", id: s.id, vertex: null }) ? 2 : 1) * px}
          onPointerDown={(e) => onItemDown(e, { type: "surface", id: s.id, vertex: null })}
        />
      ))}

      {site.neighbours.map((n) => {
        const c = polygonCentroid(n.polygon);
        const isSel = selected({ type: "neighbour", id: n.id, vertex: null });
        return (
          <g key={n.id} onPointerDown={(e) => onItemDown(e, { type: "neighbour", id: n.id, vertex: null })}>
            <polygon points={svgPoints(n.polygon)} fill="#d6d8dc" stroke={isSel ? "#2563eb" : "#8b9099"} strokeWidth={(isSel ? 2 : 1) * px} />
            <text x={c.x} y={c.y} fontSize={fs} textAnchor="middle" dominantBaseline="central" className="site-label">
              {n.name}
            </text>
          </g>
        );
      })}

      {/* The house: ground floor as room fills under wall bands at their real thickness; upper floors as dashed outer faces. */}
      <g pointerEvents="none">
        {outlines[0]?.polys.map((poly, i) => <polygon key={`fill-${i}`} points={svgPoints(poly)} fill="#efe6cf" />)}
        {walls[0]?.walls.map((w, i) => <polygon key={`wall-${i}`} points={svgPoints(w.poly)} fill="#7a4a3a" stroke="#7a4a3a" strokeWidth={0.3 * px} strokeLinejoin="round" />)}
        {outlines.slice(1).map((o) =>
          (o.faces ?? []).map((f, i) => <line key={`${o.level}-${i}`} x1={f.a.x} y1={f.a.y} x2={f.b.x} y2={f.b.y} stroke="#7a4a3a" strokeWidth={1.2 * px} strokeDasharray={`${5 * px} ${4 * px}`} />),
        )}
      </g>

      {site.boundary.map((a, i) => {
        const b = site.boundary[(i + 1) % site.boundary.length];
        const e = edges[i];
        const isSel = sel?.type === "boundary" && sel.edge === i;
        return (
          <g key={i} className={isSel && tool === "select" ? "site-edge-sel" : undefined} onPointerDown={(ev) => onItemDown(ev, { type: "boundary", edge: i, vertex: null })}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16 * px} />
            {isSel && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#93c5fd" strokeWidth={9 * px} strokeLinecap="round" />}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`site-edge edge-${e.kind}`} strokeWidth={(e.kind === "hedge" ? 5 : e.kind === "wall" ? 4 : e.kind === "fence" ? 3 : 1.5) * px} strokeDasharray={e.kind === "open" ? `${6 * px} ${4 * px}` : undefined} />
          </g>
        );
      })}

      {/* Shortest distance from each side of the house to the boundary. */}
      <g pointerEvents="none">
        {clearances.map((c) => {
          const mid = { x: (c.from.x + c.to.x) / 2, y: (c.from.y + c.to.y) / 2 };
          const on = c.distance < 0.05;
          const label = on ? `${c.side}: on boundary` : `${c.side} ${c.distance.toFixed(2)} m`;
          return (
            <g key={c.side} className="site-dim">
              {!on && (
                <>
                  <line x1={c.from.x} y1={c.from.y} x2={c.to.x} y2={c.to.y} strokeWidth={1.2 * px} />
                  <circle cx={c.from.x} cy={c.from.y} r={2.5 * px} />
                  <circle cx={c.to.x} cy={c.to.y} r={2.5 * px} />
                </>
              )}
              <rect x={mid.x - label.length * fs * 0.29} y={mid.y - fs * 0.75} width={label.length * fs * 0.58} height={fs * 1.5} rx={3 * px} />
              <text x={mid.x} y={mid.y} fontSize={fs} textAnchor="middle" dominantBaseline="central">
                {label}
              </text>
            </g>
          );
        })}
      </g>

      {sel?.type === "boundary" && sel.edge !== null && site.boundary[sel.edge] && (() => {
        const a = site.boundary[sel.edge];
        const b = site.boundary[(sel.edge + 1) % site.boundary.length];
        const label = `${edgeLength(site, sel.edge).toFixed(2)} m`;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 - 16 * px;
        return (
          <g className="site-dim" pointerEvents="none">
            <rect x={mx - label.length * fs * 0.29} y={my - fs * 0.75} width={label.length * fs * 0.58} height={fs * 1.5} rx={3 * px} />
            <text x={mx} y={my} fontSize={fs} textAnchor="middle" dominantBaseline="central">
              {label}
            </text>
          </g>
        );
      })()}
    </>
  );
}

interface SelectionProps {
  sel: NonNullable<Sel>;
  poly: readonly { x: number; y: number }[];
  px: number;
  onEdgeDown: (e: React.PointerEvent, s: Item, i: number) => void;
  onMidDown: (e: React.PointerEvent, s: Item, i: number) => void;
  onVertexDown: (e: React.PointerEvent, s: Item, i: number) => void;
}

/** Edge hits (surfaces and buildings), midpoint plusses and corner handles of the selected polygon. */
export function SelectionLayer({ sel, poly, px, onEdgeDown, onMidDown, onVertexDown }: SelectionProps) {
  return (
    <g>
      {sel.type !== "boundary" &&
        poly.map((a, i) => {
          const b = poly[(i + 1) % poly.length];
          return <line key={"e" + i} className="site-edge-hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={10 * px} onPointerDown={(ev) => onEdgeDown(ev, sel, i)} />;
        })}
      {poly.map((a, i) => {
        const b = poly[(i + 1) % poly.length];
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return (
          <g key={"m" + i} className="site-mid" onPointerDown={(e) => onMidDown(e, sel, i)}>
            <circle cx={m.x} cy={m.y} r={9 * px} fill="transparent" stroke="none" />
            <circle cx={m.x} cy={m.y} r={5 * px} strokeWidth={1.2 * px} />
            <path d={`M ${m.x - 3 * px} ${m.y} H ${m.x + 3 * px} M ${m.x} ${m.y - 3 * px} V ${m.y + 3 * px}`} strokeWidth={1.2 * px} />
          </g>
        );
      })}
      {poly.map((p, i) => (
        <g key={"v" + i} className={`site-handle${sel.vertex === i ? " active" : ""}`} onPointerDown={(e) => onVertexDown(e, sel, i)}>
          <circle cx={p.x} cy={p.y} r={12 * px} fill="transparent" stroke="none" />
          <circle cx={p.x} cy={p.y} r={6 * px} strokeWidth={1.5 * px} />
        </g>
      ))}
    </g>
  );
}

/** The rubber-band rectangle while drawing a surface or building. */
export function DraftRect({ draft, px }: { draft: NonNullable<Draft>; px: number }) {
  return <polygon points={svgPoints(rectPoly(draft.a.x, draft.a.y, draft.b.x, draft.b.y))} className="site-draft" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} />;
}
