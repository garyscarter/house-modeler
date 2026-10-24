import { memo } from "react";
import type { Pt, Room } from "../../../types";
import { EdgeHit, Handle, MidpointHandle } from "../../core";

/** Transparent strips along the selected room's edges that slide the wall. */
export const RoomEdgeHits = memo(function RoomEdgeHits({ room, px, onDown }: { room: Room; px: number; onDown: (e: React.PointerEvent, roomId: string, i: number) => void }) {
  return (
    <g>
      {room.polygon.map((p, i) => {
        const q = room.polygon[(i + 1) % room.polygon.length];
        return <EdgeHit key={"e" + i} a={p} b={q} px={px} width={10} title="Drag to move the wall" onPointerDown={(e) => onDown(e, room.id, i)} />;
      })}
    </g>
  );
});

/**
 * Corner and midpoint handles. Quiet mode shows only the selected room's (and the hovered room's, faded);
 * otherwise every room's corners are shown.
 */
export const RoomHandles = memo(function RoomHandles({
  rooms,
  selectedId,
  quiet,
  hoveredId,
  px,
  onEnter,
  onLeave,
  onCornerDown,
  onMidDown,
}: {
  rooms: Room[];
  selectedId: string | null;
  quiet: boolean;
  /** Only meaningful in quiet mode; pass null otherwise so a hover does not re-render this layer. */
  hoveredId: string | null;
  px: number;
  onEnter: (id: string) => void;
  onLeave: (e: React.PointerEvent, id: string) => void;
  onCornerDown: (e: React.PointerEvent, roomId: string, i: number) => void;
  onMidDown: (e: React.PointerEvent, roomId: string, i: number) => void;
}) {
  return (
    <>
      {rooms
        .filter((r) => !quiet || r.id === selectedId || r.id === hoveredId)
        .map((r) => (
          <RoomHandleSet
            key={"h" + r.id}
            room={r}
            sel={r.id === selectedId}
            faded={quiet && r.id !== selectedId}
            px={px}
            onEnter={onEnter}
            onLeave={onLeave}
            onCornerDown={onCornerDown}
            onMidDown={onMidDown}
          />
        ))}
    </>
  );
});

/** One room's handles: its corners, and when selected the midpoints that add a corner. */
const RoomHandleSet = memo(function RoomHandleSet({
  room: r,
  sel,
  faded,
  px,
  onEnter,
  onLeave,
  onCornerDown,
  onMidDown,
}: {
  room: Room;
  sel: boolean;
  faded: boolean;
  px: number;
  onEnter: (id: string) => void;
  onLeave: (e: React.PointerEvent, id: string) => void;
  onCornerDown: (e: React.PointerEvent, roomId: string, i: number) => void;
  onMidDown: (e: React.PointerEvent, roomId: string, i: number) => void;
}) {
  return (
    <g opacity={faded ? 0.5 : undefined} data-room={r.id} onPointerEnter={() => onEnter(r.id)} onPointerLeave={(e) => onLeave(e, r.id)}>
      {sel &&
        !r.locked &&
        r.polygon.map((p, i) => {
          const q = r.polygon[(i + 1) % r.polygon.length];
          return (
            <MidpointHandle
              key={"m" + i}
              a={p}
              b={q}
              px={px}
              r={3.6}
              hit={6}
              fill="#fff"
              ink="var(--plan-sel)"
              sw={1.25}
              title="Add a corner here"
              onPointerDown={(e) => onMidDown(e, r.id, i)}
            />
          );
        })}
      {r.polygon.map((p, i) => (
        <Handle
          key={i}
          at={p}
          px={px}
          r={sel ? 6 : 3.6}
          hit={sel ? 8 : 6}
          fill={sel ? "var(--plan-sel-soft)" : "#fff"}
          ink={sel ? "var(--plan-sel)" : "var(--plan-handle)"}
          sw={1.25 * (sel ? 2 : 1.3)}
          style={r.locked ? { pointerEvents: "none" } : undefined}
          title="Drag to move; double-click to remove the corner"
          onPointerDown={(e) => onCornerDown(e, r.id, i)}
        />
      ))}
    </g>
  );
});

/** Corner handles of the selected canopy. */
export const CanopyHandles = memo(function CanopyHandles({ poly, px, onDown }: { poly: Pt[]; px: number; onDown: (e: React.PointerEvent, i: number) => void }) {
  return (
    <>
      {poly.map((p, i) => (
        <Handle
          key={"ch" + i}
          at={p}
          px={px}
          r={6}
          hit={8}
          fill="var(--plan-sel-soft)"
          ink="var(--plan-sel)"
          sw={1.25 * 2}
          title="Drag to resize the canopy"
          onPointerDown={(e) => onDown(e, i)}
        />
      ))}
    </>
  );
});
