import { useEffect } from "react";
import { SITE_EDIT_ID, useSite, useStore } from "../store";
import type { Floor, Room } from "../types";
import { MODE_LABEL, type Mode } from "../lib/modes";
import { buildSummary, decorateSummary, furnishSummary, siteSummary } from "../lib/modeSummary";
import { BuildSummary, DecorateSummary, FurnishSummary, useClashCount } from "../editor/ModeSummaries";
import { DecoratePanel } from "../editor/DecoratePanel";
import { BuildRoomPanel } from "../editor/Inspectors";
import { PlotPanel } from "./PlotPanel";
import { ReviewPanel } from "./ReviewPanel";
import { useMediaQuery } from "./useMediaQuery";
import { NARROW_QUERY } from "./breakpoints";
import { usePanelPrefs } from "./panelPrefs";

/**
 * The panel beside (or, on narrow screens, over the bottom of) the 3D view: what the current mode shows for
 * the selected room, or a summary when nothing is selected. Also hosts Review on the plan.
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
  const site = useSite();
  const narrow = useMediaQuery(NARROW_QUERY);
  const sheetOpen = usePanelPrefs((s) => s.sheetOpen);
  const setPrefs = usePanelPrefs((s) => s.setPrefs);

  // The floor the panel is about: the one the plan shows, else the room's, else the lowest.
  const picked = selectedRoomId ? model?.floors.find((f) => f.rooms.some((r) => r.id === selectedRoomId)) : undefined;
  const floor: Floor | undefined = (editFloorId && editFloorId !== SITE_EDIT_ID ? model?.floors.find((f) => f.id === editFloorId) : undefined) ?? picked ?? model?.floors[0];
  const room: Room | undefined = floor?.rooms.find((r) => r.id === selectedRoomId) ?? picked?.rooms.find((r) => r.id === selectedRoomId);
  const roomFloor = room && floor?.rooms.includes(room) ? floor : picked;
  const edge = room && selectedEdge && selectedEdge.edge < room.polygon.length ? selectedEdge : null;

  // A room or wall just picked in Build or Decorate opens the sheet.
  const pickKey = (mode === "build" || mode === "decorate") && room ? `${room.id}:${edge ? edge.edge + edge.side : ""}` : "";
  useEffect(() => {
    if (narrow && pickKey) setPrefs({ sheetOpen: true });
  }, [narrow, pickKey, setPrefs]);

  const clashes = useClashCount(floor ?? EMPTY_FLOOR);

  const body = (() => {
    if (mode === "plot") return <PlotPanel />;
    if (mode === "review") return <ReviewPanel />;
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
          <>
            <FurnishSummary floor={floor} clashes={clashes} />
            <button className="big" onClick={() => setUi({ tab: "plan" })}>
              Place furniture on the plan
            </button>
          </>
        );
    }
  })();

  const summary = ((): string => {
    if (mode === "plot") return siteSummary(site);
    if (mode === "review") return "Report and planning check";
    if (!floor) return "";
    if ((mode === "build" || mode === "decorate") && room) return room.name;
    return mode === "build" ? buildSummary(floor) : mode === "decorate" ? decorateSummary(floor) : furnishSummary(floor, clashes);
  })();

  if (narrow) {
    return (
      <div className="mode-sheet" data-mode={mode} data-open={sheetOpen}>
        <button className="sheet-head" aria-expanded={sheetOpen} onClick={() => setPrefs({ sheetOpen: !sheetOpen })}>
          <b>{MODE_LABEL[mode]}</b>
          <span className="sect-sum">{summary}</span>
          <span className="sect-chev" aria-hidden="true">
            {sheetOpen ? "▾" : "▴"}
          </span>
        </button>
        {sheetOpen && <div className="sheet-body">{body}</div>}
      </div>
    );
  }
  return (
    <aside className={mode === "review" ? "mode-panel wide" : "mode-panel"} data-mode={mode satisfies Mode} aria-label={`${MODE_LABEL[mode]} panel`}>
      {body}
    </aside>
  );
}

const EMPTY_FLOOR: Floor = { id: "", name: "", level: 0, image: "", imageW: 1, imageH: 1, pxPerM: 100, origin: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, rooms: [], openings: [] };
