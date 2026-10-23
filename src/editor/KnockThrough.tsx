import { useMemo } from "react";
import { ask, choose } from "../components/Dialogs";
import { knockThroughNeighbours } from "../lib/mergeRooms";
import { useStore } from "../store";
import type { Floor, Room, VariantKey } from "../types";

/**
 * Ask which room to keep and knock `room` through into `other` (the wall
 * between them and its openings go). Shared by the inspector and the plan's
 * Shift+click shortcut. Resolves true when the rooms were merged.
 */
export async function confirmKnockThrough(variant: VariantKey, floor: Floor, room: Room, other: Room): Promise<boolean> {
  const pick = await choose(
    `Knock through into ${other.name}? The wall between them and its doors go.\nKeep the name and finishes of:`,
    [room.name, other.name, "Cancel"],
  );
  if (pick !== 0 && pick !== 1) return false;
  const res = useStore.getState().knockThrough(variant, floor.id, room.id, other.id, pick === 0 ? "a" : "b");
  if (!res.ok) {
    await ask(res.reason, { ok: "OK" });
    return false;
  }
  return true;
}

/** "Knock through into…": lists the rooms on this floor that share a wall with the selected room. */
export function KnockThrough({ variant, floor, room }: { variant: VariantKey; floor: Floor; room: Room }) {
  // Only the rooms and scale decide who shares a wall, so a fixture move does not rerun this.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const neighbours = useMemo(() => knockThroughNeighbours(floor, room.id), [floor.rooms, floor.pxPerM, room.id]);
  if (!neighbours.length) return null;
  return (
    <label title="Remove the wall between this room and a neighbour, making one room of the two. Shortcut: select this room, then Shift+click the neighbour on the plan.">
      Knock through into…
      <select
        value=""
        onChange={(e) => {
          const other = neighbours.find((r) => r.id === e.target.value);
          if (other) void confirmKnockThrough(variant, floor, room, other);
        }}
      >
        <option value="">Choose a room</option>
        {neighbours.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </label>
  );
}
