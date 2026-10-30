import { useEffect, useState } from "react";
import { ask, askText, choose } from "../../components/Dialogs";
import type { MenuItem, MenuState } from "../../components/ContextMenu";
import { usePanelPrefs } from "../../components/panelPrefs";
import { byId } from "../../lib/catalogue";
import { pickInPlan } from "../../lib/decorPick";
import { exactGroup, expandToGroups, rotateFixtures, ungroupFixtures } from "../../lib/fixtureGroups";
import { defaultFit } from "../../lib/recess";
import { editsFixtures, type Mode } from "../../lib/modes";
import { knockThroughNeighbours } from "../../lib/mergeRooms";
import { planTargetAt, type HitSolid, type PlanTarget } from "../../lib/planHit";
import { closestOnSegment, DOUBLE_DOOR_M, outsideSide, SWING_KINDS } from "../../lib/planMath";
import { useStore } from "../../store";
import { toWorld } from "../../lib/geometry";
import { useWalk } from "../../walkStore";
import type { Fixture, Floor, Opening, Pt, VariantKey } from "../../types";
import { confirmKnockThrough } from "../KnockThrough";
import type { CanvasCamera } from "../core";
import type { PlanDrag } from "./useDrag";
import type { PlanSelection } from "./useSelection";
import type { PlanTools } from "./useTools";

export interface PlanMenuArgs {
  variant: VariantKey;
  floor: Floor;
  mode: Mode;
  peeking: boolean;
  camera: CanvasCamera;
  drag: PlanDrag;
  sel: PlanSelection;
  tools: PlanTools;
  hitShapes: HitSolid[];
  /** Clipboard size and the "Paste …" wording, shared with the tool rail. */
  clipboardCount: number;
  pasteLabel: string;
  placeOpeningAt(kind: "door" | "window" | "gap", raw: Pt): void;
  refit(fx: Fixture): void;
}

/** The right-click menu: actions for whatever is under the pointer (lib/planHit decides what that is). */
export function usePlanMenu(a: PlanMenuArgs) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const { variant, floor, mode, camera, drag, sel, tools } = a;
  const build = mode === "build";
  const decorate = mode === "decorate";
  const furnish = mode === "furnish";
  const fixtureMode = editsFixtures(mode);
  const ppm = floor.pxPerM;
  const { select, targetIds, anyLocked, liveIds, allFixtures, setFixtures } = sel;

  // Peeking at the other layout closes the menu.
  useEffect(() => {
    if (a.peeking) setMenu(null);
  }, [a.peeking]);

  /** Open the menu for whatever is under this client point: a right-click, or a long press on touch. */
  const openAt = (client: Pt) => {
    if (!camera.cam || a.peeking) return;
    // A right-click mid-drag cancels the drag (snapshot restored) instead of leaving it half-done.
    drag.drag.cancel();
    // Right-click while drawing cancels the unfinished shape instead of opening a menu.
    if (tools.draft.length || tools.calib.length || tools.measure.length) {
      tools.setDraft([]);
      tools.setCalib([]);
      tools.setMeasure([]);
      return;
    }
    const frame = camera.frame();
    const raw = frame.fromClient({ clientX: client.x, clientY: client.y });
    const target = planTargetAt(floor, raw, mode, { hit: camera.px * 10, edge: camera.px * 12 }, a.hitShapes);
    const items = menuItemsFor(target, raw);
    if (items.length) setMenu({ x: client.x, y: client.y, items });
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // A long press on touch opens the menu itself (see openAt); the browser's own contextmenu for it is ignored.
    if ((e.nativeEvent as PointerEvent).pointerType === "touch") return;
    openAt({ x: e.clientX, y: e.clientY });
  };

  const toggleImage = () => {
    const { planImage, setUi } = useStore.getState();
    setUi({ planImage: { ...planImage, show: !planImage.show } });
  };

  const menuItemsFor = (t: PlanTarget, raw: Pt): MenuItem[] => {
    const { planImage, setUi, setMode, updateRoom, updateFloor } = useStore.getState();
    const px = camera.px;
    const empty: MenuItem[] = [
      ...(a.clipboardCount && (build || fixtureMode)
        ? [
            {
              label: `${a.pasteLabel} here`,
              hint: "Ctrl V",
              run: () => {
                if (!fixtureMode) setMode("furnish");
                sel.pasteFixtures(raw);
              },
            } satisfies MenuItem,
          ]
        : []),
      { label: "Fit the rooms", hint: "F", run: () => camera.fit() },
      { label: planImage.show ? "Hide floorplan image" : "Show floorplan image", hint: "I", run: toggleImage },
    ];
    if (t.kind === "fixture" && fixtureMode) {
      const id = t.id;
      const ids = targetIds(id);
      const grouped = !!allFixtures.find((x) => x.id === id)?.groupId;
      const group = expandToGroups([id], allFixtures);
      return [
        ...(anyLocked(ids) ? [] : [{ label: "Turn 90°", hint: "R", run: () => { select({ fixtures: ids }); setFixtures((all) => rotateFixtures(all, ids, 90)); } } satisfies MenuItem]),
        { label: ids.every((i) => allFixtures.find((x) => x.id === i)?.locked) ? "Unlock" : "Lock", run: () => { select({ fixtures: ids }); sel.lockFixtures(ids, !ids.every((i) => allFixtures.find((x) => x.id === i)?.locked)); } },
        { label: "Duplicate", hint: "Ctrl D", run: () => sel.duplicateFixtureIds(ids) },
        { label: "Copy", hint: "Ctrl C", run: () => { select({ fixtures: ids }); sel.copyFixtureIds(ids); } },
        ...(furnish && ids.length >= 2 && !exactGroup(allFixtures, ids) ? [{ label: "Group", hint: "Ctrl G", run: () => { select({ fixtures: ids }); sel.groupSelected(ids); } } satisfies MenuItem] : []),
        ...(furnish && grouped ? [{ label: "Ungroup", hint: "Ctrl Shift G", run: () => { select({ fixtures: group }); setFixtures((all) => ungroupFixtures(all, [id])); } } satisfies MenuItem] : []),
        ...(furnish && grouped && group.some((g) => !liveIds.includes(g)) && liveIds.length === 1 && liveIds[0] === id ? [{ label: "Select group", run: () => select({ fixtures: group }) } satisfies MenuItem] : []),
        ...(() => {
          const one = ids.length === 1 ? allFixtures.find((x) => x.id === id) : undefined;
          const it = one && byId(one.type);
          if (!one || !it || one.locked || !defaultFit(it)) return [];
          const toWindow = one.joinery?.fit === "window" || it.symbol === "window-seat";
          return [{ label: toWindow ? "Fit to window" : "Refit to recess", run: () => { select({ fixtures: ids }); a.refit(one); } } satisfies MenuItem];
        })(),
        "sep",
        { label: "Remove", hint: "Del", danger: true, run: () => { setFixtures((all) => all.filter((x) => !ids.includes(x.id))); select({}); sel.pruneDangling(); } },
      ];
    }
    if (t.kind === "opening" && build) {
      const o = floor.openings.find((x) => x.id === t.id);
      if (!o) return empty;
      const patch = (p: Partial<Opening>) => sel.patchOpening(o.id, p);
      const pair = o.kind === "door" && o.widthM > DOUBLE_DOOR_M && outsideSide(o, floor.rooms, 0.3 * ppm) === 0;
      const swing = SWING_KINDS.includes(o.kind);
      const asKinds = (["door", "window", "gap"] as const).filter((k) => k !== o.kind);
      return [
        ...(swing && o.kind !== "french" && !pair ? [{ label: "Flip hinge", run: () => { select({ opening: o.id }); patch({ flipHinge: !o.flipHinge || undefined }); } } satisfies MenuItem] : []),
        ...(swing ? [{ label: "Flip swing", run: () => { select({ opening: o.id }); patch({ flipSwing: !o.flipSwing || undefined }); } } satisfies MenuItem] : []),
        ...(swing ? (["sep"] as MenuItem[]) : []),
        ...asKinds.map((k): MenuItem => ({ label: `Make it a ${k}`, run: () => { select({ opening: o.id }); patch({ kind: k }); } })),
        "sep",
        { label: "Delete", hint: "Del", danger: true, run: () => { sel.dropOpening(o.id); select({}); } },
      ];
    }
    if (t.kind === "wall") {
      const w = (floor.walls ?? []).find((x) => x.id === t.id);
      if (!w) return empty;
      if (decorate) return [{ label: "Decorate this wall", run: () => select({ wall: w.id }) }];
      const at = closestOnSegment(raw, w.a, w.b).q;
      return [
        { label: "Add door here", run: () => a.placeOpeningAt("door", at) },
        { label: "Add window here", run: () => a.placeOpeningAt("window", at) },
        "sep",
        { label: "Delete wall", hint: "Del", danger: true, run: () => { sel.dropWall(w.id); select({}); } },
      ];
    }
    if (t.kind === "room") {
      const room = floor.rooms.find((r) => r.id === t.id);
      if (!room) return empty;
      const edge = t.edge;
      if (decorate) {
        const hit = pickInPlan(floor.rooms.map((r) => ({ id: r.id, poly: r.polygon })), raw, px * 12);
        return [
          { label: "Walk from here", run: () => { select({ room: room.id }); useWalk.getState().requestWalk({ kind: "room", level: floor.level, roomId: room.id, at: toWorld(floor, raw) }); } } satisfies MenuItem,
          {
            label: "Decorate the floor",
            run: () => {
              select({ room: room.id });
              usePanelPrefs.getState().setOpen("decorate.floor", true);
            },
          },
          ...(edge !== null && hit && hit.roomId === room.id && hit.edge !== null
            ? [{ label: "Decorate this wall", run: () => { select({ room: room.id }); setUi({ selectedEdge: { edge: hit.edge!, side: hit.side } }); } } satisfies MenuItem]
            : []),
          { label: "Edit shape in Build", run: () => { select({ room: room.id }); setMode("build"); } },
        ];
      }
      const neighbours = knockThroughNeighbours(floor, room.id);
      const onEdge = edge !== null ? closestOnSegment(raw, room.polygon[edge], room.polygon[(edge + 1) % room.polygon.length]).q : null;
      return [
        { label: "Walk from here", run: () => { select({ room: room.id }); useWalk.getState().requestWalk({ kind: "room", level: floor.level, roomId: room.id, at: toWorld(floor, raw) }); } } satisfies MenuItem,
        {
          label: "Rename…",
          run: async () => {
            select({ room: room.id });
            const name = await askText("Room name:", room.name);
            if (name) updateRoom(variant, floor.id, room.id, { name });
          },
        },
        { label: "Decorate this room", run: () => { select({ room: room.id }); setMode("decorate"); } },
        ...(build ? [{ label: room.locked ? "Unlock shape" : "Lock shape", run: () => { select({ room: room.id }); updateRoom(variant, floor.id, room.id, { locked: !room.locked || undefined }); } } satisfies MenuItem] : []),
        ...(onEdge
          ? [
              { label: "Add door here", run: () => a.placeOpeningAt("door", onEdge) } satisfies MenuItem,
              { label: "Add window here", run: () => a.placeOpeningAt("window", onEdge) } satisfies MenuItem,
            ]
          : []),
        ...(neighbours.length && !room.locked
          ? [
              {
                label: "Knock through into…",
                run: async () => {
                  select({ room: room.id });
                  const pick = await choose("Knock through into which room?", [...neighbours.map((n) => n.name), "Cancel"]);
                  if (pick !== null && pick < neighbours.length) void confirmKnockThrough(variant, floor, room, neighbours[pick]);
                },
              } satisfies MenuItem,
            ]
          : []),
        "sep",
        {
          label: "Delete room",
          danger: true,
          run: async () => {
            select({ room: room.id });
            if (!(await ask(`Delete ${room.name}?`, { ok: "Delete", danger: true }))) return;
            updateFloor(variant, floor.id, (f) => ({ ...f, rooms: f.rooms.filter((x) => x.id !== room.id) }));
            select({});
          },
        },
      ];
    }
    return empty;
  };

  return { menu, setMenu, onContextMenu, openAt };
}
