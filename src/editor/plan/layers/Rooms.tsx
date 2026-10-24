import { memo, useMemo } from "react";
import { areaM2, formatArea } from "../../../lib/planMath";
import { bbox, polygonCentroid } from "../../../lib/geometry";
import { roomColor } from "../../../lib/roomColor";
import type { Room } from "../../../types";
import { LockGlyph } from "../../LockGlyph";
import { halo, pointsOf } from "./shared";

/** The empty-plan prompt, in the middle of the view. */
export const NoRoomsHint = memo(function NoRoomsHint({ x, y, px }: { x: number; y: number; px: number }) {
  return (
    <text x={x} y={y} fontSize={px * 13 * 1.2} textAnchor="middle" fill="var(--plan-handle)" fontWeight={600} {...halo(px)}>
      No rooms yet. Pick "Rectangle room" and click two opposite corners of each room.
    </text>
  );
});

/** The room fills, the selected room last so its outline sits above its neighbours. */
export const RoomFills = memo(function RoomFills({
  rooms,
  selectedId,
  neutral,
  wallsOn,
  px,
  onEnter,
  onLeave,
}: {
  rooms: Room[];
  selectedId: string | null;
  neutral: boolean;
  wallsOn: boolean;
  px: number;
  onEnter: (id: string) => void;
  onLeave: (e: React.PointerEvent, id: string) => void;
}) {
  const stroke = px * 1.25;
  return (
    <>
      {rooms.map((r) => (
        <polygon
          key={r.id}
          points={pointsOf(r.polygon)}
          fill={
            neutral
              ? r.id === selectedId
                ? "var(--plan-sel-soft)"
                : `color-mix(in srgb, ${roomColor(r)} 8%, white)`
              : roomColor(r)
          }
          fillOpacity={neutral ? (r.id === selectedId ? 0.85 : 0.7) : r.id === selectedId ? 0.7 : 0.42}
          stroke={wallsOn ? "none" : r.id === selectedId ? "var(--plan-sel)" : "#1f2937"}
          strokeWidth={stroke * (r.id === selectedId ? 2.2 : 1.2)}
          strokeLinejoin="round"
          data-room={r.id}
          onPointerEnter={() => onEnter(r.id)}
          onPointerLeave={(e) => onLeave(e, r.id)}
        />
      ))}
    </>
  );
});

/** The room under the pointer (or hovered in the panel), tinted. */
export const RoomHover = memo(function RoomHover({ room, px }: { room: Room; px: number }) {
  return (
    <polygon
      className="plan-hover-room"
      points={pointsOf(room.polygon)}
      fillOpacity={0.08}
      strokeWidth={px * 2}
      strokeLinejoin="round"
      style={{ pointerEvents: "none", fill: "var(--hover-room, var(--plan-sel))", stroke: "var(--hover-room, var(--plan-sel))" }}
    />
  );
});

/** Room names with their areas. */
export const RoomLabels = memo(function RoomLabels({ rooms, ppm, px }: { rooms: Room[]; ppm: number; px: number }) {
  return (
    <>
      {rooms.map((r) => (
        <RoomLabel key={"l" + r.id} room={r} ppm={ppm} px={px} fontSize={px * 13} />
      ))}
    </>
  );
});

/** Room name with its floor area underneath, sized in screen pixels; the area is dropped when the room is small on screen. */
const RoomLabel = memo(function RoomLabel({ room, ppm, px, fontSize }: { room: Room; ppm: number; px: number; fontSize: number }) {
  const c = useMemo(() => polygonCentroid(room.polygon), [room.polygon]);
  const area = useMemo(() => areaM2(room.polygon, ppm), [room.polygon, ppm]);
  const b = bbox(room.polygon);
  const onScreen = Math.min(b.w, b.h) / px;
  if (onScreen < 28) return null;
  const outline = { ...halo(px), strokeOpacity: 0.85 };
  return (
    <g className="plan-text">
      <text x={c.x} y={c.y} fontSize={fontSize} textAnchor="middle" fill="#111" fontWeight={600} {...outline}>
        {room.name}
      </text>
      {room.locked && <LockGlyph at={{ x: c.x - (room.name.length * fontSize * 0.3 + px * 8), y: c.y - fontSize * 0.3 }} px={px * 10} />}
      {onScreen > 60 && (
        <text x={c.x} y={c.y + fontSize * 1.2} fontSize={fontSize * 0.82} textAnchor="middle" fill="#374151" {...outline}>
          {formatArea(area)}
        </text>
      )}
    </g>
  );
});
