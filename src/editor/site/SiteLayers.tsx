import { svgPoints } from "../../lib/planMath";
import { outlinePath } from "../../lib/surfaceCurve";
import { polygonCentroid } from "../../lib/geometry";
import { rectPoly, edgesOf, type LevelOutline, type sideClearances } from "../../lib/site";
import type { LevelWalls } from "../../lib/siteWalls";
import { edgeLength } from "../../lib/boundaryOpening";
import { type Site, type SurfaceKind } from "../../types";
import { sameItem, type Draft, type Item, type SiteMode, type Tool } from "./types";
import { EdgeHit, Handle, MidpointHandle } from "../core/components";

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
  mode: SiteMode;
  /** The selected polygon (a surface, building or the boundary), not garden items. */
  sel: Item | null;
  tool: Tool;
  px: number;
  outlines: LevelOutline[];
  walls: LevelWalls[];
  clearances: ReturnType<typeof sideClearances>;
  onItemDown: Down;
}

/** Surfaces, neighbours, the house, the boundary edges and the clearance dimensions, all in world metres. */
export function SiteWorld({ site, mode, sel, tool, px, outlines, walls, clearances, onItemDown }: WorldProps) {
  const garden = mode === "garden";
  const edges = edgesOf(site);
  const selected = (t: Item) => !!sel && sameItem(sel, t);
  const fs = 12 * px;
  return (
    <>
      {site.surfaces.map((s) => (
        <path
          key={s.id}
          data-surface-id={s.id}
          d={outlinePath(s, (p) => p, site.surfaces)}
          fill={SURFACE_FILL[s.kind]}
          fillOpacity={garden ? 0.75 : 0.4}
          stroke={garden && selected({ type: "surface", id: s.id, vertex: null }) ? "#2563eb" : "rgba(0,0,0,0.15)"}
          strokeWidth={(garden && selected({ type: "surface", id: s.id, vertex: null }) ? 2 : 1) * px}
          pointerEvents={garden ? undefined : "none"}
          onPointerDown={garden ? (e) => onItemDown(e, { type: "surface", id: s.id, vertex: null }) : undefined}
        />
      ))}

      {site.neighbours.map((n) => {
        const c = polygonCentroid(n.polygon);
        const isSel = selected({ type: "neighbour", id: n.id, vertex: null });
        return (
          <g key={n.id} pointerEvents={garden ? "none" : undefined} onPointerDown={garden ? undefined : (e) => onItemDown(e, { type: "neighbour", id: n.id, vertex: null })}>
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
          <g key={i} className={isSel && tool === "select" ? "site-edge-sel" : undefined} pointerEvents={garden ? "none" : undefined} onPointerDown={garden ? undefined : (ev) => onItemDown(ev, { type: "boundary", edge: i, vertex: null })}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16 * px} />
            {isSel && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#93c5fd" strokeWidth={9 * px} strokeLinecap="round" />}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`site-edge edge-${e.kind}`} strokeWidth={(e.kind === "hedge" ? 5 : e.kind === "wall" ? 4 : e.kind === "fence" ? 3 : 1.5) * px} strokeDasharray={e.kind === "open" ? `${6 * px} ${4 * px}` : undefined} />
          </g>
        );
      })}

      {/* Shortest distance from each side of the house to the boundary. */}
      <g pointerEvents="none">
        {!garden && clearances.map((c) => {
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
  sel: Item;
  poly: readonly { x: number; y: number }[];
  px: number;
  /** Smooth surfaces: the control polygon is drawn faintly between its handles. */
  smooth?: boolean;
  /** Edges that follow another surface's edge: no midpoint, and their end corners can't be dragged here. */
  linked?: number[];
  onEdgeDown: (e: React.PointerEvent, s: Item, i: number) => void;
  onMidDown: (e: React.PointerEvent, s: Item, i: number) => void;
  onVertexDown: (e: React.PointerEvent, s: Item, i: number) => void;
}

/** Edge hits (surfaces and buildings), midpoint plusses and corner handles of the selected polygon. */
export function SelectionLayer({ sel, poly, px, smooth, linked, onEdgeDown, onMidDown, onVertexDown }: SelectionProps) {
  const n = poly.length;
  const linkedEdge = (i: number) => !!linked?.includes(i);
  // The corners at the ends of a linked edge belong to the surface it follows.
  const linkedVertex = (i: number) => linkedEdge(i) || linkedEdge((i - 1 + n) % n);
  return (
    <g>
      {smooth && <polygon points={svgPoints(poly as { x: number; y: number }[])} className="site-control-poly" strokeWidth={px} strokeDasharray={`${3 * px} ${3 * px}`} pointerEvents="none" />}
      {sel.type !== "boundary" &&
        poly.map((a, i) => {
          const b = poly[(i + 1) % poly.length];
          return <EdgeHit key={"e" + i} a={a} b={b} px={px} width={10} className="site-edge-hit" onPointerDown={(ev) => onEdgeDown(ev, sel, i)} />;
        })}
      {sel.type !== "boundary" && sel.edge !== null && sel.edge !== undefined && poly[sel.edge] && (
        <line x1={poly[sel.edge].x} y1={poly[sel.edge].y} x2={poly[(sel.edge + 1) % poly.length].x} y2={poly[(sel.edge + 1) % poly.length].y} className="site-surface-edge-sel" strokeWidth={4 * px} pointerEvents="none" />
      )}
      {poly.map((a, i) =>
        linkedEdge(i) ? null : <MidpointHandle key={"m" + i} a={a} b={poly[(i + 1) % poly.length]} px={px} r={5} hit={9} plus className="site-mid" onPointerDown={(e) => onMidDown(e, sel, i)} />,
      )}
      {poly.map((p, i) =>
        linkedVertex(i) ? (
          <circle key={"v" + i} cx={p.x} cy={p.y} r={4 * px} className="site-handle-linked" pointerEvents="none" />
        ) : (
          <Handle key={"v" + i} at={p} px={px} r={6} hit={12} className={`site-handle${sel.vertex === i ? " active" : ""}`} onPointerDown={(e) => onVertexDown(e, sel, i)} />
        ),
      )}
    </g>
  );
}

/** The rubber-band rectangle while drawing a surface or building. */
export function DraftRect({ draft, px }: { draft: NonNullable<Draft>; px: number }) {
  if (draft.circle) return <circle cx={draft.a.x} cy={draft.a.y} r={Math.hypot(draft.b.x - draft.a.x, draft.b.y - draft.a.y)} className="site-draft" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} pointerEvents="none" />;
  return <polygon points={svgPoints(rectPoly(draft.a.x, draft.a.y, draft.b.x, draft.b.y))} className="site-draft" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} />;
}
