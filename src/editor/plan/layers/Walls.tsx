import { memo } from "react";
import { WALL_T } from "../../../lib/geometry";
import { svgPoints } from "../../../lib/planMath";
import type { planWalls } from "../../../lib/planWalls";
import type { Floor, Pt, Room } from "../../../types";
import { Handle } from "../../core";
import { pointsOf, WALL_EDGE, WALL_FILL } from "./shared";

type Wall = NonNullable<Floor["walls"]>[number];

/** The walls as the 3D shell builds them, at real thickness; the selected room's outline is redrawn over them. */
export const WallBands = memo(function WallBands({ shapes, selectedRoom, px }: { shapes: ReturnType<typeof planWalls>; selectedRoom: Room | undefined; px: number }) {
  return (
    <g className="plan-walls" style={{ pointerEvents: "none" }}>
      {/* Outline pass then fill pass: the stroke only survives round the outside of the joined walls, not along the seams between them. */}
      {shapes.map((w, i) => (
        <polygon key={"wo" + i} points={svgPoints(w.poly)} fill={WALL_FILL} stroke={WALL_EDGE} strokeWidth={px * 3} strokeLinejoin="round" />
      ))}
      {shapes.map((w, i) => (
        <polygon key={"wf" + i} points={svgPoints(w.poly)} fill={WALL_FILL} />
      ))}
      {selectedRoom && (
        <polygon key={"rs" + selectedRoom.id} points={pointsOf(selectedRoom.polygon)} fill="none" stroke="var(--plan-sel)" strokeWidth={px * 1.25 * 2.2} strokeLinejoin="round" />
      )}
    </g>
  );
});

/** Free-standing walls: the line, a wide hit target, and (Build, Select tool) the end handles. */
export const FreeWalls = memo(function FreeWalls({
  walls,
  selectedId,
  wallsOn,
  hittable,
  ends,
  ppm,
  px,
  onDown,
  onEndDown,
}: {
  walls: Wall[];
  selectedId: string | null;
  wallsOn: boolean;
  /** Build and Decorate take presses on walls. */
  hittable: boolean;
  /** Build with the Select tool shows the end handles. */
  ends: boolean;
  ppm: number;
  px: number;
  onDown: (e: React.PointerEvent, w: Wall, selected: boolean) => void;
  onEndDown: (e: React.PointerEvent, id: string, end: "a" | "b") => void;
}) {
  const stroke = px * 1.25;
  const handleR = px * 6;
  return (
    <>
      {walls.map((w) => {
        const sel = w.id === selectedId;
        return (
          <g key={w.id}>
            {(!wallsOn || sel) && (
              <line
                x1={w.a.x}
                y1={w.a.y}
                x2={w.b.x}
                y2={w.b.y}
                stroke={sel ? "var(--plan-sel)" : w.color ?? "#1f2937"}
                strokeOpacity={wallsOn ? 0.6 : 1}
                strokeWidth={Math.max(WALL_T * ppm, stroke * 3)}
                strokeLinecap={wallsOn ? "butt" : "round"}
                style={{ pointerEvents: "none" }}
              />
            )}
            <line
              x1={w.a.x}
              y1={w.a.y}
              x2={w.b.x}
              y2={w.b.y}
              stroke="transparent"
              strokeWidth={handleR * 2}
              className="plan-hit"
              style={hittable ? undefined : { pointerEvents: "none" }}
              onPointerDown={(e) => onDown(e, w, sel)}
            >
              <title>Wall{w.height !== undefined ? ` (${w.height} m high)` : ""}. Click to edit, drag the ends or the selected wall to move.</title>
            </line>
            {ends &&
              (["a", "b"] as const).map((end) => (
                <Handle
                  key={end}
                  at={w[end]}
                  px={px}
                  r={sel ? 6 : 3.6}
                  hit={sel ? 8 : 6}
                  fill="#fff"
                  ink={sel ? "var(--plan-sel)" : "#6b7280"}
                  sw={1.25 * 1.5}
                  onPointerDown={(e) => onEndDown(e, w.id, end)}
                />
              ))}
          </g>
        );
      })}
    </>
  );
});

/** The green line from the first end of a wall being drawn to the pointer. */
export const WallDraft = memo(function WallDraft({ from, to, px }: { from: Pt; to: Pt; px: number }) {
  return <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#16a34a" strokeWidth={px * 1.25 * 3} strokeLinecap="round" style={{ pointerEvents: "none" }} />;
});
