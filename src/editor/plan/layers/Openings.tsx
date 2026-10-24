import { memo } from "react";
import { useChassis } from "../../../components/useChassis";
import { EXT_WALL_T, WALL_T } from "../../../lib/geometry";
import { outsideSide } from "../../../lib/planMath";
import type { Floor } from "../../../types";
import { OpeningSymbol } from "../../OpeningSymbol";

type Opening = Floor["openings"][number];

/** Doors, windows and gaps on the walls, each with a hit strip along it. */
export const Openings = memo(function Openings({
  openings,
  rooms,
  selectedId,
  build,
  ppm,
  px,
  onDown,
}: {
  openings: Opening[];
  rooms: Floor["rooms"];
  selectedId: string | null;
  build: boolean;
  ppm: number;
  px: number;
  onDown: (e: React.PointerEvent, o: Opening) => void;
}) {
  const touch = useChassis((s) => s.touch);
  return (
    <>
      {openings.map((o) => {
        const len = o.widthM * ppm;
        const outside = outsideSide(o, rooms, 0.3 * ppm);
        const t = (outside ? EXT_WALL_T : WALL_T) * ppm;
        const sel = o.id === selectedId;
        const hitT = Math.max(t * 1.5, px * 14);
        return (
          <g key={o.id} transform={`translate(${o.x} ${o.y}) rotate(${o.orientation === "v" ? 90 : 0})`}>
            <OpeningSymbol opening={o} len={len} t={t} m={ppm} px={px} outside={outside} selected={sel} />
            {touch && build && (
              // A finger is wider than the drawn hit strip: a transparent strip 30 screen px thick takes the press too.
              <rect x={-len / 2 - px * 6} y={-px * 15} width={len + px * 12} height={px * 30} fill="transparent" className="plan-hit plan-opening" onPointerDown={(e) => onDown(e, o)} />
            )}
            <rect
              x={-len / 2}
              y={-hitT / 2}
              width={len}
              height={hitT}
              fill={sel ? "var(--plan-sel)" : "transparent"}
              fillOpacity={sel ? 0.18 : 0}
              className="plan-hit plan-opening"
              style={build ? undefined : { pointerEvents: "none" }}
              onPointerDown={(e) => onDown(e, o)}
            >
              <title>
                {o.kind} ({o.widthM} m). Drag along the wall, click to edit.
              </title>
            </rect>
          </g>
        );
      })}
    </>
  );
});
