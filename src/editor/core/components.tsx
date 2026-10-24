import type { CSSProperties, ReactNode } from "react";
import { useChassis } from "../../components/useChassis";
import { chipSize } from "../../lib/editorCore";
import type { Pt } from "../../types";
import "./core.css";

/**
 * Shared SVG pieces. Every size is in screen px and is multiplied by `px` (model units per screen px) inside,
 * so handles stay the same size at every zoom. Hit areas are transparent; the visible shape ignores the pointer.
 * On a touch screen the hit areas grow to a finger's size (the drawn shapes do not).
 */

/** Smallest hit radius for a corner handle, a midpoint handle, and smallest edge hit width, in screen px, on touch. */
export const TOUCH_HIT = { handle: 22, mid: 16, edge: 28 } as const;
const useTouch = () => useChassis((s) => s.touch);

type Down = (e: React.PointerEvent<SVGElement>) => void;

export interface HandleProps {
  at: Pt;
  px: number;
  /** Visible radius, screen px. */
  r: number;
  /** Hit radius, screen px. */
  hit: number;
  className?: string;
  fill?: string;
  ink?: string;
  /** Stroke width, screen px. */
  sw?: number;
  style?: CSSProperties;
  title?: string;
  onPointerDown?: Down;
}

/** A drag handle: a visible dot inside a larger transparent target that takes the pointer. */
export function Handle({ at, px, r, hit, className = "plan-handle", fill, ink, sw = 1.5, style, title, onPointerDown }: HandleProps) {
  if (useTouch()) hit = Math.max(hit, TOUCH_HIT.handle);
  return (
    <g className={`core-handle ${className}`} style={style} onPointerDown={onPointerDown}>
      <circle cx={at.x} cy={at.y} r={hit * px} fill="transparent" stroke="none" />
      <circle cx={at.x} cy={at.y} r={r * px} fill={fill ?? "var(--panel)"} stroke={ink ?? "var(--accent)"} strokeWidth={sw * px} style={{ pointerEvents: "none" }} />
      {title && <title>{title}</title>}
    </g>
  );
}

export interface MidpointHandleProps {
  a: Pt;
  b: Pt;
  px: number;
  r: number;
  hit: number;
  /** Draw a plus inside (the site's midpoint). */
  plus?: boolean;
  className?: string;
  fill?: string;
  ink?: string;
  sw?: number;
  title?: string;
  onPointerDown?: Down;
}

/** The handle at an edge's midpoint: press to insert a corner there and drag it. */
export function MidpointHandle({ a, b, px, r, hit, plus, className, fill, ink, sw = 1.2, title, onPointerDown }: MidpointHandleProps) {
  if (useTouch()) hit = Math.max(hit, TOUCH_HIT.mid);
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const arm = r * 0.6 * px;
  const stroke = ink ?? "var(--accent)";
  return (
    <g className={`core-mid ${className ?? (plus ? "site-mid" : "plan-handle add")}`} onPointerDown={onPointerDown}>
      <circle cx={m.x} cy={m.y} r={hit * px} fill="transparent" stroke="none" />
      <circle cx={m.x} cy={m.y} r={r * px} fill={fill ?? "var(--panel)"} stroke={stroke} strokeWidth={sw * px} style={{ pointerEvents: "none" }} />
      {plus && <path d={`M ${m.x - arm} ${m.y} H ${m.x + arm} M ${m.x} ${m.y - arm} V ${m.y + arm}`} stroke={stroke} strokeWidth={sw * px} style={{ pointerEvents: "none" }} />}
      {title && <title>{title}</title>}
    </g>
  );
}

export interface EdgeHitProps {
  a: Pt;
  b: Pt;
  px: number;
  /** Hit width, screen px. */
  width: number;
  className?: string;
  title?: string;
  onPointerDown?: Down;
}

/** A transparent line over an edge that takes the press for sliding it. */
export function EdgeHit({ a, b, px, width, className = "plan-edge-hit", title, onPointerDown }: EdgeHitProps) {
  if (useTouch()) width = Math.max(width, TOUCH_HIT.edge);
  return (
    <line className={`core-edge-hit ${className}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={width * px} onPointerDown={onPointerDown}>
      {title && <title>{title}</title>}
    </line>
  );
}

export interface DimensionChipProps {
  at: Pt;
  text: string;
  px: number;
  fontSize: number;
  className?: string;
  title?: string;
  onPointerDown?: Down;
}

/** A horizontal length chip centred on `at`, sized from its text (see chipSize). */
export function DimensionChip({ at, text, px, fontSize, className = "plan-edge-label", title, onPointerDown }: DimensionChipProps) {
  const { w, h } = chipSize(text, px, fontSize);
  const touch = useTouch();
  return (
    <g transform={`translate(${at.x} ${at.y})`} className={`core-chip ${className}`} onPointerDown={onPointerDown}>
      {touch && <rect x={-Math.max(w, 48 * px) / 2} y={-Math.max(h, 34 * px) / 2} width={Math.max(w, 48 * px)} height={Math.max(h, 34 * px)} fill="transparent" />}
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill="var(--plan-chip-bg, var(--panel))" stroke="var(--plan-sel, var(--accent))" strokeWidth={px} />
      <text y={0} dy="0.35em" fontSize={fontSize * 0.85} textAnchor="middle" fill="var(--plan-sel-ink, var(--accent))" fontWeight={600}>
        {text}
      </text>
      {title && <title>{title}</title>}
    </g>
  );
}

/** The floating status pill under the canvas. */
export function StatusLine({ className, children }: { className: "plan-status" | "site-status"; children: ReactNode }) {
  return (
    <div className={`${className} float-card`} role="status">
      {children}
    </div>
  );
}
