import { memo } from "react";
import type { CatalogueItem } from "../../../lib/catalogue";
import type { Mode, Tool } from "../../../lib/modes";
import { StatusLine } from "../../core";

export interface StatusInput {
  tool: Tool;
  draftLen: number;
  measureLen: number;
  calibLen: number;
  placing: { item: CatalogueItem } | null;
  movingWall: boolean;
  roomHint: boolean;
  hasSelectedRoom: boolean;
  /** A finger, not a mouse: say Tap and touch and hold, and leave out the keyboard. */
  touch?: boolean;
}

/** What the status line says while a drawing tool is in hand (null: nothing to say). */
export function statusTextFor(s: StatusInput): string | null {
  if (s.touch) return touchStatusFor(s);
  switch (s.tool) {
    case "canopy":
      return s.draftLen ? "Click the opposite corner of the canopy." : "Click one corner of the porch canopy, then the opposite corner. Corners snap to walls and rooms.";
    case "rect":
      return s.draftLen ? "Click the opposite corner." : "Click one corner of the room, then the opposite corner. Corners snap to existing ones.";
    case "room":
      return "Click each corner in order, then click the first corner again (or Finish room). Esc cancels.";
    case "door":
      return "Click on a wall to place a door.";
    case "window":
      return "Click on a wall to place a window.";
    case "gap":
      return "Click on a wall to knock a full-height opening through it.";
    case "wall":
      return s.draftLen ? "Click the other end of the wall." : "Click where the wall starts, then where it ends. Ends snap to corners.";
    case "measure":
      return s.measureLen === 1 ? "Click the second point." : "Click two points to measure between them; they snap to corners. Esc clears.";
    case "calibrate":
      return `Click two points a known distance apart (${s.calibLen}/2).`;
    case "place":
      if (s.placing?.item.symbol === "built-in") return "Click in an alcove to fit it between the walls, floor to ceiling (Alt places freely). R turns 90°, Esc finishes.";
      if (s.placing?.item.symbol === "window-seat") return "Click in front of a window to fit the seat to it (Alt places freely). R turns 90°, Esc finishes.";
      return s.placing ? `Click to place ${s.placing.item.name}; it snaps to walls (Alt places freely). R turns 90°, Shift+R 15°, Esc finishes.` : null;
    default:
      if (s.movingWall) return "Drag to move the wall · Esc cancels";
      return s.roomHint && s.hasSelectedRoom ? "Right-click a room for more" : null;
  }
}

/** The same, in touch wording. No Esc, R, Alt or arrows; the phone has no drawing tools, but a tablet has them all. */
function touchStatusFor(s: StatusInput): string | null {
  switch (s.tool) {
    case "canopy":
      return s.draftLen ? "Tap the opposite corner of the canopy." : "Tap one corner of the porch canopy, then the opposite corner. Corners snap to walls and rooms.";
    case "rect":
      return s.draftLen ? "Tap the opposite corner." : "Tap one corner of the room, then the opposite corner. Corners snap to existing ones.";
    case "room":
      return "Tap each corner in order, then tap the first corner again (or Finish room).";
    case "door":
      return "Tap a wall to place a door.";
    case "window":
      return "Tap a wall to place a window.";
    case "gap":
      return "Tap a wall to knock a full-height opening through it.";
    case "wall":
      return s.draftLen ? "Tap the other end of the wall." : "Tap where the wall starts, then where it ends. Ends snap to corners.";
    case "measure":
      return s.measureLen === 1 ? "Tap the second point." : "Tap two points to measure between them; they snap to corners.";
    case "calibrate":
      return `Tap two points a known distance apart (${s.calibLen}/2).`;
    case "place":
      if (s.placing?.item.symbol === "built-in") return "Tap in an alcove to fit it between the walls, floor to ceiling.";
      if (s.placing?.item.symbol === "window-seat") return "Tap in front of a window to fit the seat to it.";
      return s.placing ? `Tap to place ${s.placing.item.name}; it snaps to walls.` : null;
    default:
      if (s.movingWall) return "Drag to move the wall";
      return s.roomHint && s.hasSelectedRoom ? "Touch and hold a room for more" : null;
  }
}

/** The rail's (i) help in touch wording. */
function touchHintFor(mode: Mode): string {
  return mode === "build"
    ? "Tap a room, canopy, opening or wall to edit it. Drag corners; drag the background to pan, pinch to zoom. Touch and hold for actions."
    : mode === "decorate"
      ? "Tap a floor, or a wall near its edge, to decorate it. Drag the background to pan; pinch to zoom. Touch and hold for actions."
      : mode === "furnish"
        ? "Tap an item to edit it; drag to move. Drag the background to pan; pinch to zoom. Touch and hold for actions."
        : "Drag the background to pan; pinch to zoom. Use Measure to check a distance.";
}

/** The help text behind the rail's (i). */
export function selectHintFor(mode: Mode, touch = false): string {
  if (touch) return touchHintFor(mode);
  return mode === "build"
    ? "Click a room, canopy, opening or wall to edit it. Drag corners; drag the background or swipe with two fingers to pan, pinch or use the mouse wheel to zoom. Arrows nudge (Shift ×10). Shift+click a neighbouring room to knock through. Esc while dragging puts it back. Right-click for actions."
    : mode === "decorate"
      ? "Click a floor, or a wall near its edge, to decorate it. Drag the background or swipe with two fingers to pan; pinch or use the mouse wheel to zoom. Right-click for actions."
      : mode === "furnish"
        ? "Click an item to edit it; drag to move; Shift+click adds to the selection, Shift+drag selects an area, Ctrl/⌘G groups. Arrows nudge (Shift ×10) · R turns 90°, Shift+R 15° · Ctrl/⌘C, V copy and paste · Ctrl/⌘D duplicates · Delete removes. Esc while dragging puts it back. Right-click for actions."
        : "Drag the background or swipe with two fingers to pan; pinch or use the mouse wheel to zoom. Use Measure to check a distance.";
}

/** The floating status line, with "Finish room" while a polygon room has three corners. */
export const PlanStatus = memo(function PlanStatus({ text, finish, onFinish }: { text: string; finish: boolean; onFinish: () => void }) {
  return (
    <StatusLine className="plan-status">
      <span>{text}</span>
      {finish && (
        <button type="button" className="primary" onClick={onFinish}>
          Finish room
        </button>
      )}
    </StatusLine>
  );
});
