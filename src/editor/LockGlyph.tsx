import type { Pt } from "../types";

/** A small padlock on the plan marking a locked room or fixture. `at` is its centre in image px; `px` its size in image px (about 10 screen px). */
export function LockGlyph({ at, px }: { at: Pt; px: number }) {
  const w = px;
  const h = px * 0.62;
  const x = at.x - w / 2;
  const y = at.y - px * 0.1;
  const r = w * 0.28;
  return (
    <g className="plan-lock" pointerEvents="none">
      <path d={`M ${at.x - r} ${y} v ${-h * 0.35} a ${r} ${r} 0 0 1 ${2 * r} 0 v ${h * 0.35}`} fill="none" stroke="#1f2937" strokeWidth={px * 0.14} />
      <rect x={x} y={y} width={w} height={h} rx={px * 0.12} fill="#f5b301" stroke="#1f2937" strokeWidth={px * 0.1} />
    </g>
  );
}
