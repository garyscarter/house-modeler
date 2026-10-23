import { useEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { Floor } from "../types";
import { polygonArea, polygonCentroid, roomWorldPolygon } from "../lib/geometry";

/**
 * Room names, printed sizes and areas for one floor.
 *
 * Labels are HTML overlays, so nothing in the scene hides them. To keep them
 * readable the house only labels its topmost visible floor (lower floors
 * would be read through the floors above, and "show up to" a level makes
 * that level the top), and with the roof drawn over them only the selected
 * room is labelled. Unselected labels show the name only; the printed size
 * and area belong to the selected room. This component hides them unless the camera is
 * looking down into the rooms: above the floor's ceiling and at least
 * MIN_ELEVATION above the horizon. At street level (the front and rear
 * presets) the labels would sit over the walls and roof of the elevation
 * rather than the rooms they name, so they are hidden there.
 */
const MIN_ELEVATION = (12 * Math.PI) / 180;

export function RoomLabels({
  floor,
  baseY,
  ceiling,
  roofOver = false,
  selectedRoomId = null,
}: {
  floor: Floor;
  baseY: number;
  ceiling: number;
  /** The roof is drawn over this floor: label only the selected room, or the labels float on the tiles. */
  roofOver?: boolean;
  selectedRoomId?: string | null;
}) {
  const rooms = useMemo(
    () =>
      floor.rooms.map((room) => {
        const poly = roomWorldPolygon(floor, room);
        // Printed sizes are inside the walls; the traced outline runs along their centre lines.
        const area = room.dims ? room.dims.w * room.dims.h : Math.abs(polygonArea(poly));
        return { room, c: polygonCentroid(poly), area };
      }),
    [floor],
  );
  const centre = useMemo(() => {
    const n = rooms.length || 1;
    return { x: rooms.reduce((s, r) => s + r.c.x, 0) / n, z: rooms.reduce((s, r) => s + r.c.y, 0) / n };
  }, [rooms]);
  const [visible, setVisible] = useState(false);
  const shown = useRef(false);
  const invalidate = useThree((s) => s.invalidate);
  // The view renders on demand: draw a frame so the labels that just mounted get placed.
  useEffect(() => invalidate(), [visible, invalidate]);
  useFrame(({ camera }) => {
    const top = baseY + ceiling;
    const dy = camera.position.y - top;
    const flat = Math.hypot(camera.position.x - centre.x, camera.position.z - centre.z);
    const next = dy > 0.3 && Math.atan2(dy, flat) > MIN_ELEVATION;
    if (next !== shown.current) {
      shown.current = next;
      setVisible(next);
    }
  });
  if (!visible) return null;
  return (
    <group>
      {rooms
        .filter(({ room }) => !roofOver || room.id === selectedRoomId)
        .map(({ room, c, area }) => (
        <Html key={room.id} position={[c.x, 0.05, c.y]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className="room-label">
            {room.name}
            {room.id === selectedRoomId && (
              <span>
                {room.dims && `${room.dims.w.toFixed(2)} × ${room.dims.h.toFixed(2)} m · `}
                {area.toFixed(1)} m²
              </span>
            )}
          </div>
        </Html>
      ))}
    </group>
  );
}
