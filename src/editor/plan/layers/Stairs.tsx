import { memo } from "react";
import { flightWinders, STAIRS_VECTOR } from "../../../lib/stairs";
import type { Floor } from "../../../types";
import { StairsSymbol } from "../../StairsSymbol";

type StairsProps = Pick<Floor, "stairs" | "stairsLen" | "stairsWidth" | "stairsDir" | "stairsTurn" | "stairsTopTurn" | "stairsTopWinders">;

/** The stairs symbol, with its hit target; draggable in Build with the Select tool. */
export const StairsMarker = memo(function StairsMarker({
  stairs: s,
  stairsLen,
  stairsWidth,
  stairsDir,
  stairsTurn,
  stairsTopTurn,
  stairsTopWinders,
  ppm,
  px,
  active,
  interactive,
  onPointerDown,
}: StairsProps & {
  ppm: number;
  px: number;
  active: boolean;
  interactive: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  if (!s) return null;
  const len = (stairsLen ?? 2.6) * ppm;
  const w = (stairsWidth ?? 0.9) * ppm;
  const d = stairsDir ?? "up";
  const horiz = d === "left" || d === "right";
  const rw = horiz ? len : w;
  const rh = horiz ? w : len;
  // Winder lines at a turned foot or head, in image px.
  const side = (t?: "left" | "right") => (t === "left" ? -1 : t === "right" ? 1 : 0);
  const winders = flightWinders({
    centre: s,
    dir: STAIRS_VECTOR[d],
    run: len,
    width: w,
    turn: side(stairsTurn),
    topTurn: side(stairsTopTurn),
    topWinders: stairsTopWinders,
  });
  return (
    <g className={interactive ? "plan-handle" : undefined} style={interactive ? undefined : { pointerEvents: "none" }} onPointerDown={onPointerDown}>
      <rect x={s.x - rw / 2} y={s.y - rh / 2} width={rw} height={rh} fill="transparent" />
      <StairsSymbol centre={s} run={len} width={w} ppm={ppm} dir={d} winders={winders} px={px} active={active} label="UP" />
      <title>Stairs (they rise towards the arrow). Drag to move; set direction and size in the floor panel.</title>
    </g>
  );
});
