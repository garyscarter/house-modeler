import { memo } from "react";
import { bbox, polygonCentroid } from "../../../lib/geometry";
import type { Pt } from "../../../types";
import { halo, pointsOf } from "./shared";

/** The `<defs>` the canopy fill needs: a hatch sized in screen pixels. */
export const CanopyHatch = memo(function CanopyHatch({ px }: { px: number }) {
  return (
    <pattern id="canopy-hatch" patternUnits="userSpaceOnUse" width={px * 8} height={px * 8} patternTransform="rotate(45)">
      <rect width={px * 8} height={px * 8} fill="#67e8f9" fillOpacity={0.16} />
      <line x1={0} y1={0} x2={0} y2={px * 8} stroke="#0e7490" strokeOpacity={0.55} strokeWidth={px * 1.2} />
    </pattern>
  );
});

/** Porch canopies: dashed hatched outlines, the selected one heavier. */
export const CanopyShapes = memo(function CanopyShapes({
  canopies,
  selected,
  px,
  onDown,
}: {
  canopies: Pt[][];
  selected: number | null;
  px: number;
  onDown: (e: React.PointerEvent, i: number, selected: boolean) => void;
}) {
  const stroke = px * 1.25;
  return (
    <>
      {canopies.map((c, i) => {
        const sel = i === selected;
        return (
          <polygon
            key={"c" + i}
            points={pointsOf(c)}
            fill="url(#canopy-hatch)"
            stroke={sel ? "var(--plan-sel)" : "#0e7490"}
            strokeWidth={stroke * (sel ? 2.2 : 1.5)}
            strokeDasharray={`${px * 7} ${px * 4}`}
            strokeLinejoin="round"
            className="plan-canopy"
            onPointerDown={(e) => onDown(e, i, sel)}
          >
            <title>Porch canopy. Click to edit; drag the selected one to move it.</title>
          </polygon>
        );
      })}
    </>
  );
});

export const CanopyLabels = memo(function CanopyLabels({ canopies, ppm, px }: { canopies: Pt[][]; ppm: number; px: number }) {
  return (
    <>
      {canopies.map((c, i) => (
        <CanopyLabel key={"cl" + i} poly={c} ppm={ppm} px={px} fontSize={px * 13} />
      ))}
    </>
  );
});

/** "Canopy" with its size, sized in screen pixels; the size is dropped when the canopy is small on screen. */
function CanopyLabel({ poly, ppm, px, fontSize }: { poly: Pt[]; ppm: number; px: number; fontSize: number }) {
  const c = polygonCentroid(poly);
  const b = bbox(poly);
  const onScreen = Math.min(b.w, b.h) / px;
  if (onScreen < 24) return null;
  const outline = { ...halo(px), strokeOpacity: 0.85 };
  return (
    <g className="plan-text">
      <text x={c.x} y={c.y} fontSize={fontSize} textAnchor="middle" fill="#0e7490" fontWeight={600} {...outline}>
        Canopy
      </text>
      {onScreen > 50 && (
        <text x={c.x} y={c.y + fontSize * 1.2} fontSize={fontSize * 0.82} textAnchor="middle" fill="#155e75" {...outline}>
          {(b.w / ppm).toFixed(2)} × {(b.h / ppm).toFixed(2)} m
        </text>
      )}
    </g>
  );
}
