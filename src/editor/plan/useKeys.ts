import { moveCanopy } from "../../lib/canopy";
import { byId } from "../../lib/catalogue";
import { getClipboardFixtures } from "../../lib/clipboard";
import { moveFixtures, rotateFixtures, ungroupFixtures } from "../../lib/fixtureGroups";
import { ZOOM_STEP } from "../../lib/editorCore";
import type { Mode } from "../../lib/modes";
import { arrowDelta, slideOpening } from "../../lib/nudge";
import { planKeyAction } from "../../lib/planKeys";
import { imageForState, imageStateOf, nearestSegment, segOrientation, turn, type ImageState, type Seg } from "../../lib/planMath";
import { useStore } from "../../store";
import type { Floor, VariantKey } from "../../types";
import { useEditorKeys, type CanvasCamera } from "../core";
import type { PlanSelection } from "./useSelection";
import type { PlanTools } from "./useTools";

export const IMAGE_STATES: ImageState[] = ["off", "faint", "trace"];

export interface PlanKeyArgs {
  variant: VariantKey;
  floor: Floor;
  mode: Mode;
  segs: Seg[];
  camera: CanvasCamera;
  sel: PlanSelection;
  tools: PlanTools;
  selectedRoomId: string | null;
  setAddOpen(on: boolean): void;
}

/** Keyboard on the plan: arrows nudge, clipboard, groups, Esc, tool and view keys, Delete. The order is the order of precedence. */
export function usePlanKeys(a: PlanKeyArgs) {
  const { variant, floor, mode, segs, camera, sel, tools, selectedRoomId } = a;
  const { tool, placing } = tools;
  const { liveIds, allFixtures, canopies } = sel;
  const build = mode === "build";
  const furnish = mode === "furnish";
  const ppm = floor.pxPerM;
  const updateFloor = useStore.getState().updateFloor;

  /** Move the selection by (dx, dy) image px; false when nothing selected can move that way. */
  const nudgeSelection = (dx: number, dy: number): boolean => {
    if (!build && !furnish) return false;
    const { selectedCanopy, selectedOpeningId, selectedWallId, activeCorner } = sel;
    if (selectedCanopy !== null) {
      if (!canopies[selectedCanopy]) return false;
      sel.setCanopies((all) => moveCanopy(all, selectedCanopy, dx, dy));
    } else if (liveIds.length) {
      if (sel.anyLocked(liveIds)) return false;
      sel.setFixtures((all) => moveFixtures(all, liveIds, dx, dy));
    } else if (selectedOpeningId) {
      const o = floor.openings.find((x) => x.id === selectedOpeningId);
      if (!o) return false;
      // The wall it sits on: the nearest one running the same way.
      const along = segs.filter((s) => segOrientation(s) === o.orientation);
      const near = nearestSegment({ x: o.x, y: o.y }, along.length ? along : segs);
      if (near) {
        const at = slideOpening(o, near.seg, dx, dy, ppm);
        sel.patchOpening(o.id, at);
      }
    } else if (selectedWallId) {
      if (!(floor.walls ?? []).some((w) => w.id === selectedWallId)) return false;
      updateFloor(variant, floor.id, (f) => ({ ...f, walls: (f.walls ?? []).map((w) => (w.id === selectedWallId ? { ...w, a: { x: w.a.x + dx, y: w.a.y + dy }, b: { x: w.b.x + dx, y: w.b.y + dy } } : w)) }));
    } else if (activeCorner && selectedRoomId === activeCorner.roomId) {
      const room = floor.rooms.find((r) => r.id === activeCorner.roomId);
      if (!room?.polygon[activeCorner.idx] || room.locked) return false;
      updateFloor(variant, floor.id, (f) => ({
        ...f,
        rooms: f.rooms.map((r) => (r.id === room.id ? { ...r, polygon: r.polygon.map((v, i) => (i === activeCorner.idx ? { x: v.x + dx, y: v.y + dy } : v)) } : r)),
      }));
    } else return false;
    return true;
  };

  // The handler is read through a ref by the core, so it always sees this render's state. The core has already
  // dropped keys that belong to a field or dialog and keys pressed while peeking.
  useEditorKeys((e: KeyboardEvent) => {
    const { planImage, setUi, setMode } = useStore.getState();
    const mod = e.ctrlKey || e.metaKey;
    const act = planKeyAction(e, { mode, fixtureSelected: liveIds.length > 0, placing: !!placing });
    const arrow = !mod && !e.altKey ? arrowDelta(e.key, e.shiftKey) : null;
    if (arrow) {
      if (!placing && tool === "select" && nudgeSelection(arrow.x * ppm, arrow.y * ppm)) e.preventDefault();
    } else if (mod && e.key.toLowerCase() === "c" && liveIds.length) {
      e.preventDefault();
      sel.copyFixtureIds(liveIds);
    } else if (mod && e.key.toLowerCase() === "v" && getClipboardFixtures().length) {
      e.preventDefault();
      // Furniture only lives in Furnish: switch there, then paste.
      if (!furnish) setMode("furnish");
      sel.pasteFixtures();
    } else if (mod && e.key.toLowerCase() === "g" && furnish) {
      e.preventDefault();
      if (e.shiftKey) sel.setFixtures((all) => ungroupFixtures(all, liveIds));
      else sel.groupSelected(liveIds);
    } else if (mod && e.key.toLowerCase() === "a" && furnish) {
      e.preventDefault();
      sel.select({ fixtures: allFixtures.filter((f) => byId(f.type)).map((f) => f.id) });
    } else if (e.key === "Escape" && !e.defaultPrevented) {
      tools.setDraft([]);
      tools.setCalib([]);
      tools.setMeasure([]);
      sel.select({});
      if (placing) {
        tools.setPlacing(null);
        tools.setTool("select");
      }
    } else if (mod && e.key.toLowerCase() === "d" && liveIds.length) {
      e.preventDefault();
      sel.duplicateFixtureIds(liveIds);
    } else if (act) {
      e.preventDefault();
      if ("tool" in act) tools.pick(act.tool);
      else if ("rotate" in act) {
        if (placing) tools.setPlacing({ ...placing, rot: turn(placing.rot, act.rotate) });
        else if (liveIds.length && !sel.anyLocked(liveIds)) sel.setFixtures((all) => rotateFixtures(all, liveIds, act.rotate));
      } else if ("image" in act) setUi({ planImage: imageForState(IMAGE_STATES[(IMAGE_STATES.indexOf(imageStateOf(planImage)) + 1) % IMAGE_STATES.length], planImage.opacity) });
      else if ("zoom" in act) camera.zoomBy(act.zoom > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
      else if ("fit" in act) camera.fit();
      else if ("add" in act) a.setAddOpen(true);
    } else if ((e.key === "Delete" || e.key === "Backspace") && (build || furnish)) {
      sel.removeSelected();
    }
  });
}
