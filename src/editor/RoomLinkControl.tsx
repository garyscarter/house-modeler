import type { Floor, Room, VariantKey } from "../types";
import { useStore } from "../store";
import { findRoom, linkRoot, linkedFollowers, type LinkKind } from "../lib/roomLinks";

/** "Same as <room>" picker for a room's floor or wall style, with the follow chip and follower count. */
export function RoomLinkControl({
  kind,
  variant,
  floor,
  room,
  onChange,
}: {
  kind: LinkKind;
  variant: VariantKey;
  floor: Floor;
  room: Room;
  onChange: (p: Partial<Room>) => void;
}) {
  const floors = useStore((s) => s.variants[variant]?.floors);
  if (!floors) return null;
  const key = kind === "floor" ? "floorFrom" : "wallsFrom";
  const word = kind === "floor" ? "Floor" : "Walls";
  const current = room[key];
  const source = current ? findRoom(floors, current) : undefined;
  const followers = linkedFollowers(floors, room.id, kind);
  const options = floors.flatMap((f) =>
    f.rooms
      .filter((r) => r.id !== room.id && linkRoot(floors, r.id, kind) !== room.id)
      .map((r) => ({ id: r.id, label: f.id === floor.id ? r.name : `${r.name} (${f.name})` })),
  );
  const set = (id: string | undefined) => onChange(kind === "floor" ? { floorFrom: id } : { wallsFrom: id });
  return (
    <div className="deco-link">
      <select aria-label={`${word} same as`} value={source ? current : ""} onChange={(e) => set(e.target.value || undefined)}>
        <option value="">This room&apos;s own</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {source && (
        <span className="deco-chip">
          Following {source.room.name}
          <button type="button" className="link" onClick={() => set(undefined)}>
            Unlink
          </button>
        </span>
      )}
      {followers.length > 0 && (
        <p className="muted small">
          {word}: {followers.length === 1 ? "1 room follows" : `${followers.length} rooms follow`} this
        </p>
      )}
    </div>
  );
}
