import { SITE_EDIT_ID, useStore } from "../store";
import type { Floor, Room } from "../types";
import { MODE_LABEL, type Mode } from "../lib/modes";
import { BuildSummary, DecorateSummary, FurnishSummary, useClashCount } from "../editor/ModeSummaries";
import { DecoratePanel } from "../editor/DecoratePanel";
import { BuildRoomPanel } from "../editor/Inspectors";
import { PlotPanel } from "./PlotPanel";
import { GardenPanel } from "./GardenPanel";
import { requestAddPicker } from "../editor/addPicker";

/**
 * The panel beside the canvas: what the current mode shows for
 * the selected room, or a summary when nothing is selected.
 */
export function ModePanel() {
  const mode = useStore((s) => s.mode);
  const model = useStore((s) => s.variants[s.activeVariant]);
  const variant = useStore((s) => s.activeVariant);
  const editFloorId = useStore((s) => s.editFloorId);
  const selectedRoomId = useStore((s) => s.selectedRoomId);
  const selectedEdge = useStore((s) => s.selectedEdge);
  const updateRoom = useStore((s) => s.updateRoom);
  const setUi = useStore((s) => s.setUi);

  // The floor the panel is about: the one the plan shows, else the room's, else the lowest.
  const picked = selectedRoomId ? model?.floors.find((f) => f.rooms.some((r) => r.id === selectedRoomId)) : undefined;
  const floor: Floor | undefined = (editFloorId && editFloorId !== SITE_EDIT_ID ? model?.floors.find((f) => f.id === editFloorId) : undefined) ?? picked ?? model?.floors[0];
  const room: Room | undefined = floor?.rooms.find((r) => r.id === selectedRoomId) ?? picked?.rooms.find((r) => r.id === selectedRoomId);
  const roomFloor = room && floor?.rooms.includes(room) ? floor : picked;
  const edge = room && selectedEdge && selectedEdge.edge < room.polygon.length ? selectedEdge : null;

  const clashes = useClashCount(floor ?? EMPTY_FLOOR);

  const body = (() => {
    if (mode === "plot") return <PlotPanel />;
    if (mode === "garden") return <GardenPanel />;
    if (mode === "review") return null;
    if (!model || !floor) return <p className="muted small">Load a house to start.</p>;
    switch (mode) {
      case "build":
        return room && roomFloor ? (
          <BuildRoomPanel key={room.id} variant={variant} floor={roomFloor} room={room} onChange={(p) => updateRoom(variant, roomFloor.id, room.id, p)} />
        ) : (
          <BuildSummary variant={variant} floor={floor} />
        );
      case "decorate":
        return room && roomFloor ? (
          <DecoratePanel variant={variant} floor={roomFloor} room={room} edge={edge} onChange={(p) => updateRoom(variant, roomFloor.id, room.id, p)} />
        ) : (
          <DecorateSummary floor={floor} />
        );
      case "furnish":
        return (
          <FurnishSummary
            floor={floor}
            clashes={clashes}
            onAdd={() => {
              // One entry point: the picker lives on the plan, so go there and open it.
              setUi({ tab: "plan" });
              requestAddPicker();
            }}
          />
        );
    }
  })();

  return (
    <div className="mode-panel" data-mode={mode satisfies Mode} role="region" aria-label={`${MODE_LABEL[mode]} panel`}>
      {body}
    </div>
  );
}

const EMPTY_FLOOR: Floor = { id: "", name: "", level: 0, image: "", imageW: 1, imageH: 1, pxPerM: 100, origin: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, rooms: [], openings: [] };
