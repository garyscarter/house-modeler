import { memo } from "react";
import type { Symbol } from "../lib/catalogue";
import { electricSymbol } from "../lib/electricSymbols";

/**
 * A light or electrical point's plan symbol (lib/electricSymbols.ts) as SVG elements, `size` image px across, centred
 * on (0, 0) in the caller's (already rotated) frame. `stroke` is the line width in the same units.
 */
export const ElectricGlyph = memo(function ElectricGlyph({
  symbol,
  size,
  stroke,
  ink = "var(--text)",
  paper = "var(--plan-chip-bg)",
}: {
  symbol: Symbol;
  size: number;
  stroke: number;
  ink?: string;
  paper?: string;
}) {
  const sw = stroke / size;
  return (
    <g transform={`scale(${size})`} fill={paper} stroke={ink} strokeWidth={sw}>
      {electricSymbol(symbol).map((p, i) => {
        switch (p.k) {
          case "circle":
            return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.fill ? ink : undefined} />;
          case "line":
            return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} />;
          case "path":
            return <path key={i} d={p.d} fill={p.fill ? ink : undefined} />;
          case "rect":
            return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill ? ink : undefined} />;
          case "text":
            return (
              <text key={i} x={p.x} y={p.y} fontSize={p.size} textAnchor="middle" fill={ink} stroke="none">
                {p.text}
              </text>
            );
        }
      })}
    </g>
  );
});
