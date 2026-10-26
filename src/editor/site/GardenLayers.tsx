import { svgPoints } from "../../lib/planMath";
import { gardenDef, itemSize, type GardenDef } from "../../lib/gardenCatalogue";
import { itemFootprint, itemsOf } from "../../lib/siteItems";
import type { GardenItem, Site, WPt } from "../../types";
import { Handle } from "../core/components";
import { GardenSymbol } from "../GardenSymbol";
import { canRotate, fromLocal, resizeKind } from "./gardenEdit";

type Down = (e: React.PointerEvent<SVGElement>) => void;

interface ItemsProps {
  site: Site;
  selected: readonly string[];
  px: number;
  /** Plot mode draws the items faded and lets presses through to the survey. */
  interactive: boolean;
  onDown: (e: React.PointerEvent, id: string) => void;
}

/** Every garden item as its plan symbol, with a transparent hit area over its footprint (or along a run). */
export function GardenItems({ site, selected, px, interactive, onDown }: ItemsProps) {
  const items = itemsOf(site);
  if (!items.length) return null;
  return (
    <g className="garden-items" opacity={interactive ? 1 : 0.4} pointerEvents={interactive ? undefined : "none"}>
      {items.map((it) => {
        const def = gardenDef(it.type);
        if (!def) return null;
        const isSel = selected.includes(it.id);
        const { w } = itemSize(it);
        return (
          <g key={it.id} data-item-id={it.id} data-item-type={it.type} className="garden-item" onPointerDown={interactive ? (e) => onDown(e, it.id) : undefined}>
            <GardenSymbol def={def} item={it} px={px} selected={isSel} />
            {it.to ? (
              <line x1={it.x} y1={it.y} x2={it.to.x} y2={it.to.y} stroke="transparent" strokeWidth={Math.max(w, 16 * px)} strokeLinecap="round" />
            ) : (
              <polygon points={svgPoints(itemFootprint(it))} fill="transparent" stroke="transparent" strokeWidth={8 * px} />
            )}
          </g>
        );
      })}
    </g>
  );
}

interface HandlesProps {
  item: GardenItem;
  px: number;
  onRotateDown: Down;
  onResizeDown: (e: React.PointerEvent<SVGElement>, handle: "spread" | "w" | "d") => void;
  onEndDown: (e: React.PointerEvent<SVGElement>, end: "from" | "to") => void;
}

/** The handles of one selected item: a run's two ends; otherwise a rotate knob and the resize handles. */
export function ItemHandles({ item, px, onRotateDown, onResizeDown, onEndDown }: HandlesProps) {
  if (item.to) {
    return (
      <g>
        <Handle at={{ x: item.x, y: item.y }} px={px} r={6} hit={12} className="site-handle" title="Move this end" onPointerDown={(e) => onEndDown(e, "from")} />
        <Handle at={item.to} px={px} r={6} hit={12} className="site-handle" title="Move this end" onPointerDown={(e) => onEndDown(e, "to")} />
      </g>
    );
  }
  const { w, d } = itemSize(item);
  const kind = resizeKind(item);
  const back: WPt = fromLocal(item, { x: 0, y: -d / 2 });
  const knob: WPt = fromLocal(item, { x: 0, y: -d / 2 - 30 * px });
  return (
    <g>
      {canRotate(item) && (
        <>
          <line x1={back.x} y1={back.y} x2={knob.x} y2={knob.y} className="site-rot-stem" strokeWidth={px} />
          <Handle at={knob} px={px} r={6} hit={13} className="site-handle site-rot" title="Rotate (Shift: free)" onPointerDown={onRotateDown} />
        </>
      )}
      {kind === "spread" && <Handle at={fromLocal(item, { x: w / 2, y: 0 })} px={px} r={5} hit={11} className="site-handle" title="Spread" onPointerDown={(e) => onResizeDown(e, "spread")} />}
      {kind === "rect" && (
        <>
          <Handle at={fromLocal(item, { x: w / 2, y: 0 })} px={px} r={5} hit={11} className="site-handle" title="Width" onPointerDown={(e) => onResizeDown(e, "w")} />
          <Handle at={fromLocal(item, { x: 0, y: d / 2 })} px={px} r={5} hit={11} className="site-handle" title="Depth" onPointerDown={(e) => onResizeDown(e, "d")} />
        </>
      )}
    </g>
  );
}

/** A translucent preview of the entry following the pointer (placing), or a run's first end and rubber line. */
export function PlacementGhost({ def, item, px }: { def: GardenDef; item: GardenItem; px: number }) {
  return <GardenSymbol def={def} item={item} px={px} ghost />;
}

/** The polygon being clicked out: points so far, a rubber line to the pointer, and a ring on the first point once it can close. */
export function PolyDraftView({ points, hover, px }: { points: readonly WPt[]; hover: WPt | null; px: number }) {
  if (!points.length) return null;
  const chain = hover ? [...points, hover] : [...points];
  return (
    <g className="site-poly-draft" pointerEvents="none">
      <polyline points={svgPoints(chain)} className="site-draft-line" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} fill={points.length >= 2 ? "var(--accent-soft)" : "none"} fillOpacity={0.5} />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={(i === 0 && points.length >= 3 ? 6 : 3.5) * px} className={i === 0 ? "site-poly-first" : "site-poly-pt"} strokeWidth={1.5 * px} />)}
    </g>
  );
}

/** A run's first end and a line to the pointer. */
export function RunDraftView({ from, to, px }: { from: WPt; to: WPt | null; px: number }) {
  return (
    <g pointerEvents="none">
      {to && <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="site-draft-line" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} />}
      <circle cx={from.x} cy={from.y} r={4 * px} className="site-poly-pt" strokeWidth={1.5 * px} />
    </g>
  );
}
