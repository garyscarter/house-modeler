import type { Floor, Room, VariantKey } from "../types";
import type { EdgePick } from "../lib/decorPick";
import { RoomInspector } from "./Inspectors";

/**
 * Decorate's panel for a picked room: its floor and walls, or one wall face
 * when `edge` is set. Chunk A stub: it shows the old room inspector until the
 * real panel (Chunk C) replaces it.
 */
export function DecoratePanel({
  variant,
  floor,
  room,
  onChange,
  onHighlightEdge,
}: {
  variant: VariantKey;
  floor: Floor;
  room: Room;
  /** The picked wall face (null: the room's floor and walls as a whole). */
  edge: EdgePick | null;
  onChange: (p: Partial<Room>) => void;
  /** Light one of the room's edges on the plan (null: none). */
  onHighlightEdge?: (edge: number | null) => void;
}) {
  return <RoomInspector key={room.id} variant={variant} floor={floor} room={room} onChange={onChange} onHighlightEdge={onHighlightEdge} />;
}
