import { useRef, useState, type RefObject } from "react";
import { byId, isCeilingItem, isElectricalItem, type CatalogueItem } from "../../lib/catalogue";
import { pointKind } from "../../lib/electrics";
import { toggleLinkInModel } from "./linking";
import { addCanopy, canopyAt, moveCanopy, moveCanopyCorner, snapShift } from "../../lib/canopy";
import { insertCorner, removeCorner } from "../../lib/featureWalls";
import { expandToGroups, fixturesInRect, moveFixtures, rotateFixtures, selectionBounds, type Rect } from "../../lib/fixtureGroups";
import { EXT_WALL_T, pointInPolygon } from "../../lib/geometry";
import { pickInPlan } from "../../lib/decorPick";
import { alignGuides, alignSnap, boxRect, type Guide } from "../../lib/planGuides";
import { fixtureSelectable, nextUnder, snapKind, type HitSolid } from "../../lib/planHit";
import { lockToNormal, snapPoint, SNAP_PX } from "../../lib/polygonEdit";
import { dist, fixtureBox, nearestSegment, openingsOnEdge, segOrientation, snapToWall, type Placement, type Seg } from "../../lib/planMath";
import { pieceFixtureFields } from "../../lib/myFurniture";
import { tidyJoinery } from "../../lib/joinery";
import { knockThroughNeighbours } from "../../lib/mergeRooms";
import { editsFixtures, type Mode } from "../../lib/modes";
import { usePanelPrefs } from "../../components/panelPrefs";
import { useStore } from "../../store";
import { uid, type Fixture, type Floor, type JoineryConfig, type Opening, type Pt, type Room, type VariantKey, type Wall } from "../../types";
import { askText } from "../../components/Dialogs";
import { confirmKnockThrough } from "../KnockThrough";
import { lowerSheet, useDoublePress, useDrag as useCoreDrag, usePolygonEdit, type CanvasCamera, type DragSpec, type Move, type PolygonTarget, type Press } from "../core";
import type { PlanSelection } from "./useSelection";
import type { PlanTools } from "./useTools";

/** Render-time geometry the drag specs lean on: static during a drag, so reading the latest render is safe. */
export interface PlanGeo {
  segs: Seg[];
  /** Room corners and wall ends. */
  snapTargets: Pt[];
  /** Room corners, wall ends and fixture corners (measure). */
  corners: Pt[];
  hitShapes: HitSolid[];
  faceLines: Parameters<typeof snapToWall>[3];
  fitPlacing(c: Pt, item: CatalogueItem, free: boolean): (Placement & { w: number; d?: number; h?: number; joinery?: JoineryConfig }) | null;
  snapFixture(c: Pt, b: { w: number; d: number; h: number; z0: number; ceiling?: boolean }, rot: number, free: boolean, exclude?: string, how?: "furniture" | "wall" | "none"): Placement | null;
}

export interface PlanDragArgs {
  variant: VariantKey;
  floor: Floor;
  mode: Mode;
  peeking: boolean;
  svgRef: RefObject<SVGSVGElement | null>;
  camera: CanvasCamera;
  sel: PlanSelection;
  tools: PlanTools;
  geo: PlanGeo;
  selectedRoomId: string | null;
  /** Touch: a press held in place; the plan opens its context menu there. */
  onLongPress?(p: { client: Pt; local: Pt; at: Pt }): void;
}

const isMousePrimary = (e: React.PointerEvent) => e.pointerType !== "mouse" || e.button === 0;

/**
 * The plan's drag specs on top of the core's useDrag: one DragSpec per kind (wallEnd, wall, fixture, opening, canopy,
 * canopyCorner, stairs, chip, marquee), room corners and edges through usePolygonEdit, and the tap on the background
 * (the old click handler). Spec callbacks run later than the press, so they read the store and the latest render
 * through `L`, never the render they were created in.
 */
export function usePlanDrag(args: PlanDragArgs) {
  const L = useRef(args);
  L.current = args;
  const dbl = useDoublePress();
  const [guides, setGuides] = useState<Guide[]>([]);
  /** The rubber band being dragged, in image px. */
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);

  const getFloor = (): Floor => {
    const a = L.current;
    return useStore.getState().variants[a.variant]?.floors.find((f) => f.id === a.floor.id) ?? a.floor;
  };
  const updateFloor = (patch: Parameters<ReturnType<typeof useStore.getState>["updateFloor"]>[2]) => {
    const a = L.current;
    useStore.getState().updateFloor(a.variant, a.floor.id, patch);
  };
  const tol = () => SNAP_PX * L.current.camera.frame().unitsPerPx;
  const snapRaw = (p: Pt, free = false) => (free ? p : snapPoint(p, L.current.geo.snapTargets, tol()).p);
  /** Measure and drawing tools snap to corners, wall ends and fixture corners. */
  const snapMeasure = (p: Pt) => (L.current.tools.tool === "measure" ? snapPoint(p, L.current.geo.corners, tol()).p : snapRaw(p));
  const atOf = (e: { clientX: number; clientY: number }) => L.current.camera.frame().fromClient(e);

  const addRoom = async (polygon: Pt[]) => {
    const { floor, variant } = L.current;
    const name = await askText("Room name:", `Room ${floor.rooms.length + 1}`);
    if (name === null) return;
    const room: Room = { id: uid(), name: name || `Room ${floor.rooms.length + 1}`, polygon };
    useStore.getState().updateFloor(variant, floor.id, (f) => ({ ...f, rooms: [...f.rooms, room] }));
    useStore.getState().setUi({ selectedRoomId: room.id });
  };

  /** Drop a door, window or gap on the wall nearest `raw` (on the spot itself when no wall is near) and select it. */
  const placeOpeningAt = (kind: "door" | "window" | "gap", raw: Pt) => {
    const A = L.current;
    const near = nearestSegment(raw, A.geo.segs);
    const at = near && near.d < A.camera.px * 10 * 3 ? near.q : raw;
    const op: Opening = {
      id: uid(),
      kind,
      x: at.x,
      y: at.y,
      orientation: near ? segOrientation(near.seg) : "h",
      widthM: kind === "door" ? 0.85 : kind === "gap" ? 1.5 : 1.2,
    };
    updateFloor((f) => ({ ...f, openings: [...f.openings, op] }));
    A.sel.select({ opening: op.id });
  };

  // ---- The background: a marquee in Furnish, otherwise a pan; a pan released in place is the old canvas click.
  const background = (p: Press): DragSpec | null => {
    const a = L.current;
    if (!(editsFixtures(a.mode) && a.tools.tool === "select" && p.shift && p.pointerType === "mouse")) return null;
    return {
      kind: "marquee",
      data: { a: p.at },
      undo: false,
      move(m, d) {
        setMarquee({ a: (d.data as { a: Pt }).a, b: m.at });
      },
      end(m, d) {
        const origin = (d.data as { a: Pt }).a;
        setMarquee(null);
        if (m.lost) return;
        const A = L.current;
        const hit = expandToGroups(fixturesInRect(A.sel.allFixtures.filter((f) => { const it = byId(f.type); return !!it && fixtureSelectable(A.mode, it); }), { x0: origin.x, y0: origin.y, x1: m.at.x, y1: m.at.y }), A.sel.allFixtures);
        if (hit.length) A.sel.select({ fixtures: [...new Set([...A.sel.liveIds, ...hit])] });
      },
      cancelled() {
        setMarquee(null);
      },
    };
  };

  const backgroundTap = (m: Move) => {
    const A = L.current;
    const { floor, variant, mode, sel, tools, geo, camera } = A;
    const { tool, draft, measure, calib, placing } = tools;
    const { select, canopies } = sel;
    const build = mode === "build";
    const decorate = mode === "decorate";
    const furnish = editsFixtures(mode);
    const ppm = floor.pxPerM;
    const raw = m.at;
    const t = tol();
    if (tool === "place" && placing) {
      const fx: Fixture = { id: uid(), type: placing.item.id, x: raw.x, y: raw.y, rot: placing.rot, ...pieceFixtureFields(placing.item) };
      const fitted = geo.fitPlacing(raw, placing.item, m.alt);
      if (fitted) {
        sel.setFixtures((all) => [...all, { ...fx, ...fitted, joinery: tidyJoinery({ ...fx.joinery, ...fitted.joinery }) }]);
        return;
      }
      const snapped = geo.snapFixture(raw, { ...placing.item, z0: placing.item.mount ?? 0, ceiling: isCeilingItem(placing.item) }, placing.rot, m.alt, undefined, snapKind(placing.item));
      sel.setFixtures((all) => [...all, { ...fx, ...snapped }]);
      return; // stay in place mode for the next one
    }
    if (tool === "door" || tool === "window" || tool === "gap") {
      placeOpeningAt(tool, raw);
    } else if (tool === "wall") {
      const p = snapRaw(raw, m.alt);
      if (draft.length === 0) tools.setDraft([p]);
      else {
        const a = draft[0];
        tools.setDraft([]);
        if (dist(a, p) < t) return;
        const wall: Wall = { id: uid(), a, b: p };
        updateFloor((f) => ({ ...f, walls: [...(f.walls ?? []), wall] }));
        select({ wall: wall.id });
      }
    } else if (tool === "measure") {
      const p = snapMeasure(raw);
      tools.setMeasure(measure.length === 1 ? [measure[0], p] : [p]);
    } else if (tool === "calibrate") {
      const next = [...calib, raw];
      if (next.length === 2) {
        const d = dist(next[0], next[1]);
        void askText("Real-world distance between those two points, in metres:", "3.0").then((v) => {
          const mm = parseFloat(v ?? "");
          if (mm > 0 && d > 0) updateFloor({ pxPerM: d / mm });
        });
        tools.setCalib([]);
      } else tools.setCalib(next);
    } else if (tool === "canopy") {
      const p = snapRaw(raw, m.alt);
      if (draft.length === 0) tools.setDraft([p]);
      else {
        const a = draft[0];
        tools.setDraft([]);
        if (Math.abs(a.x - p.x) < t || Math.abs(a.y - p.y) < t) return;
        sel.setCanopies((all) => addCanopy(all, a, p));
        tools.setTool("select");
        select({ canopy: canopies.length });
      }
    } else if (tool === "rect") {
      const p = snapRaw(raw, m.alt);
      if (draft.length === 0) tools.setDraft([p]);
      else {
        const a = draft[0];
        tools.setDraft([]);
        if (Math.abs(a.x - p.x) < t || Math.abs(a.y - p.y) < t) return;
        void addRoom([
          { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y) },
          { x: Math.max(a.x, p.x), y: Math.min(a.y, p.y) },
          { x: Math.max(a.x, p.x), y: Math.max(a.y, p.y) },
          { x: Math.min(a.x, p.x), y: Math.max(a.y, p.y) },
        ]);
      }
    } else if (tool === "room") {
      const p = snapRaw(raw, m.alt);
      // Clicking the first point again closes the polygon.
      if (draft.length >= 3 && dist(p, draft[0]) < t) {
        void addRoom(draft);
        tools.setDraft([]);
      } else tools.setDraft([...draft, p]);
    } else if (decorate) {
      const hit = pickInPlan(floor.rooms.map((r) => ({ id: r.id, poly: r.polygon })), raw, 8 * camera.px + 0.12 * ppm);
      select({ room: hit?.roomId });
      if (!hit) lowerSheet();
      if (hit) {
        useStore.getState().setUi({ selectedEdge: hit.edge === null ? null : { edge: hit.edge, side: hit.side } });
        if (hit.edge === null) usePanelPrefs.getState().setOpen("decorate.floor", true);
      }
    } else if (furnish) {
      if (!m.shift) {
        // Tapping empty plan ends linking (the switch stays selected).
        if (useStore.getState().linkSwitchId) {
          useStore.getState().setUi({ linkSwitchId: null });
          return;
        }
        select({});
        lowerSheet();
      }
    } else if (build) {
      // Rooms sit over canopies, so they win where the two overlap.
      const hit = [...floor.rooms].reverse().find((r) => pointInPolygon(raw, r.polygon));
      // Shift+click a neighbour of the selected room: knock the two through.
      const from = floor.rooms.find((r) => r.id === A.selectedRoomId);
      if (m.shift && from && hit && hit.id !== from.id && knockThroughNeighbours(floor, from.id).some((r) => r.id === hit.id)) {
        void confirmKnockThrough(variant, floor, from, hit);
        return;
      }
      const roof = hit ? -1 : canopyAt(canopies, raw);
      select(roof >= 0 ? { canopy: roof } : { room: hit?.id });
      if (!hit && roof < 0) lowerSheet();
    }
  };

  const hover = (m: Move | null) => {
    const { tools } = L.current;
    if (!m) {
      tools.setHover(null);
      return;
    }
    tools.setAltHeld(m.alt);
    // Only the drawing tools and placing follow the mouse; in Select mode a move must not redraw the plan.
    const t = tools.tool;
    if (t !== "select" && t !== "door" && t !== "window" && t !== "gap" && t !== "calibrate") tools.setHover(t === "place" ? m.at : snapMeasure(m.at));
  };

  const drag = useCoreDrag({
    svg: args.svgRef,
    camera: args.camera,
    background,
    backgroundTap,
    hover,
    disabled: () => L.current.peeking,
    onLongPress: (p) => L.current.onLongPress?.(p),
  });
  const poly = usePolygonEdit(drag, args.camera, dbl);

  /** Light the room under the pointer in 3D; no write when it already is, and none mid-drag. */
  const hoverRoom = (id: string) => {
    if (!drag.active() && useStore.getState().hoveredRoomId !== id) useStore.getState().setUi({ hoveredRoomId: id });
  };
  /** Un-light it on leaving, unless the pointer only moved onto another part of the same room (its fill, its handles). */
  const unhoverRoom = (e: React.PointerEvent, id: string) => {
    const to = (e.relatedTarget as Element | null)?.closest?.("[data-room]")?.getAttribute("data-room");
    if (to !== id && useStore.getState().hoveredRoomId === id) useStore.getState().setUi({ hoveredRoomId: null });
  };

  // ---- Room corners, edges and midpoints, through the core's polygon editor.
  type OpsOnEdge = { id: string; x: number; y: number }[];
  const roomTarget = (roomId: string): PolygonTarget<OpsOnEdge> | null => {
    const f = getFloor();
    const room = f.rooms.find((r) => r.id === roomId);
    if (!room) return null;
    const fresh = () => getFloor().rooms.find((r) => r.id === roomId);
    return {
      key: `room:${roomId}`,
      poly: room.polygon,
      locked: room.locked,
      snapTargets: ({ vertex }) => {
        const g = getFloor();
        return [
          ...g.rooms.flatMap((r) => (r.id !== roomId ? r.polygon : vertex !== undefined ? r.polygon.filter((_, k) => k !== vertex) : [])),
          ...(g.walls ?? []).flatMap((w) => [w.a, w.b]),
        ];
      },
      moveVertex: (i, p) =>
        updateFloor((g) => ({ ...g, rooms: g.rooms.map((r) => (r.id === roomId ? { ...r, polygon: r.polygon.map((v, k) => (k === i ? p : v)) } : r)) })),
      edgeBegin: (i) => openingsOnEdge(getFloor(), roomId, i, (EXT_WALL_T / 2) * getFloor().pxPerM).map((o) => ({ id: o.id, x: o.x, y: o.y })),
      // A tap on the edge hit reaches the plan under it, as the old click did: a neighbour within the hit width can be Shift-knocked through.
      edgeTap: (m) => backgroundTap(m),
      // Slide the edge along its normal; openings in it go with it. Other rooms' corners are not dragged along (the corner drag does not either).
      setEdge: (_i, next, shift, ops0) => {
        const moved = new Map(ops0.map((o) => [o.id, o]));
        updateFloor((g) => ({
          ...g,
          rooms: g.rooms.map((r) => (r.id === roomId ? { ...r, polygon: next } : r)),
          openings: g.openings.map((o) => {
            const o0 = moved.get(o.id);
            return o0 ? { ...o, x: o0.x + shift.x, y: o0.y + shift.y } : o;
          }),
        }));
      },
      insertVertex: (i, p) => {
        const r = fresh();
        if (r) useStore.getState().updateRoom(L.current.variant, L.current.floor.id, roomId, insertCorner(r, i, p));
      },
      removeVertex: (i) => {
        const r = fresh();
        if (r) useStore.getState().updateRoom(L.current.variant, L.current.floor.id, roomId, removeCorner(r, i));
      },
      pickVertex: (i) => {
        if (i === null) return;
        L.current.sel.select({ room: roomId });
        L.current.sel.setActiveCorner({ roomId, idx: i });
      },
    };
  };
  const cornerDown = (e: React.PointerEvent, roomId: string, i: number) => {
    const t = roomTarget(roomId);
    if (t) poly.vertexDown(e, t, i);
  };
  const midDown = (e: React.PointerEvent, roomId: string, i: number) => {
    const t = roomTarget(roomId);
    if (t) poly.midDown(e, t, i);
  };
  const edgeDown = (e: React.PointerEvent, roomId: string, i: number) => {
    const t = roomTarget(roomId);
    if (t) poly.edgeDown(e, t, i);
  };

  // ---- Free-standing walls
  const wallEndDown = (e: React.PointerEvent, wallId: string, end: "a" | "b") => {
    L.current.sel.select({ wall: wallId });
    const w = (getFloor().walls ?? []).find((x) => x.id === wallId);
    if (!w) return;
    const exclude = w[end];
    const targets = L.current.geo.snapTargets.filter((v) => v !== exclude);
    drag.begin(e, {
      kind: "wallEnd",
      data: { wallId, end },
      move: (m) => {
        const p = m.alt ? m.at : snapPoint(m.at, targets, tol()).p;
        L.current.sel.patchWall(wallId, { [end]: p });
      },
    });
  };
  const wallDown = (e: React.PointerEvent, w: Wall, selected: boolean) => {
    const A = L.current;
    if (A.tools.tool !== "select") return;
    A.sel.select({ wall: w.id });
    if (!(selected && A.mode === "build" && isMousePrimary(e))) {
      e.stopPropagation();
      return;
    }
    const a0 = w.a;
    const b0 = w.b;
    const targets = [...getFloor().rooms.flatMap((r) => r.polygon), ...(getFloor().walls ?? []).filter((x) => x.id !== w.id).flatMap((x) => [x.a, x.b])];
    drag.begin(e, {
      kind: "wall",
      data: { wallId: w.id },
      move: (m) => {
        // Shift constrains to the wall's normal so it slides parallel, and frees the snap.
        let d = m.shift ? lockToNormal(m.delta, a0, b0) : m.delta;
        if (!m.alt && !m.shift) {
          const s = snapShift([a0, b0], d.x, d.y, targets, tol());
          d = { x: s.dx, y: s.dy };
        }
        L.current.sel.patchWall(w.id, { a: { x: a0.x + d.x, y: a0.y + d.y }, b: { x: b0.x + d.x, y: b0.y + d.y } });
      },
    });
  };

  // ---- Openings
  const openingDown = (e: React.PointerEvent, o: Opening) => {
    const A = L.current;
    if (A.tools.tool !== "select") return;
    A.sel.select({ opening: o.id });
    const p = atOf(e);
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    drag.begin(e, {
      kind: "opening",
      data: { openingId: o.id },
      move: (m) => {
        // Slide along the nearest wall, turning with it; off any wall it follows the pointer.
        const target = { x: m.at.x + dx, y: m.at.y + dy };
        const near = nearestSegment(target, L.current.geo.segs);
        const onWall = near && near.d < tol() * 2.5 ? { x: near.q.x, y: near.q.y, orientation: segOrientation(near.seg) } : target;
        L.current.sel.patchOpening(o.id, onWall);
      },
    });
  };

  // ---- Canopies
  const canopyDown = (e: React.PointerEvent, idx: number, selected: boolean) => {
    const A = L.current;
    // Only the selected canopy drags, so a swipe over an unselected one still pans the plan.
    if (A.mode !== "build" || A.tools.tool !== "select" || !selected) return;
    const list0 = A.sel.canopies;
    const p0 = atOf(e);
    drag.begin(e, {
      kind: "canopy",
      data: { idx },
      move: (m) => {
        // Shift the whole canopy; one of its corners snaps to a room corner or wall end unless Alt is held.
        const shift = { dx: m.at.x - p0.x, dy: m.at.y - p0.y };
        const poly0 = list0[idx];
        const adj = poly0 && !m.alt ? snapShift(poly0, shift.dx, shift.dy, L.current.geo.snapTargets, tol()) : shift;
        L.current.sel.setCanopies(() => moveCanopy(list0, idx, adj.dx, adj.dy));
      },
      // A tap reaches the plan under it, as the old click did (a room over the canopy wins; Shift knocks through).
      tap: (m) => backgroundTap(m),
    });
  };
  const canopyCornerDown = (e: React.PointerEvent, idx: number) => {
    const at = L.current.sel.selectedCanopy;
    drag.begin(e, {
      kind: "canopyCorner",
      data: { idx },
      move: (m) => {
        if (at !== null) L.current.sel.setCanopies((all) => moveCanopyCorner(all, at, idx, snapRaw(m.at, m.alt)));
      },
    });
  };

  // ---- Stairs
  const stairsDown = (e: React.PointerEvent) => {
    const s = L.current.floor.stairs;
    if (!s) return;
    const p = atOf(e);
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    drag.begin(e, {
      kind: "stairs",
      data: null,
      move: (m) => updateFloor({ stairs: { x: m.at.x + dx, y: m.at.y + dy } }),
      // A tap on the marker selects the room under it, as the old click did.
      tap: (m) => backgroundTap(m),
    });
  };

  // ---- An edge-length chip: a tap opens the field, a press never pans.
  const chipDown = (e: React.PointerEvent, roomId: string, idx: number, locked: boolean) => {
    drag.begin(e, {
      kind: "chip",
      data: null,
      undo: false,
      tap: () => {
        if (!locked) L.current.sel.setEdgeEdit({ roomId, idx });
      },
    });
  };

  // ---- Furniture
  const fixtureDown = (e: React.PointerEvent, fx: Fixture) => {
    const A = L.current;
    const { sel } = A;
    if (!editsFixtures(A.mode) || A.tools.tool !== "select") return;
    if (!isMousePrimary(e)) return;
    const fxItem = byId(fx.type);
    if (!fxItem || !fixtureSelectable(A.mode, fxItem)) return;
    // Linking: a tap on a light toggles it in the switch's controls; any other tap does nothing (and never selects or drags).
    const linkId = A.mode === "electrics" ? useStore.getState().linkSwitchId : null;
    if (linkId) {
      e.stopPropagation();
      drag.begin(e, {
        kind: "link",
        data: null,
        undo: false,
        tap: () => {
          if (pointKind(fxItem) !== "light") return;
          const st = useStore.getState();
          const m = st.variants[L.current.variant];
          if (!m) return;
          const next = toggleLinkInModel(m, linkId, fx.id);
          if (next !== m) st.updateModel(L.current.variant, { floors: next.floors });
        },
      });
      return;
    }
    if (e.shiftKey && !(e.ctrlKey || e.metaKey)) {
      // Shift+click: toggle this item's whole group in or out of the selection.
      e.stopPropagation();
      const set = expandToGroups([fx.id], sel.allFixtures);
      sel.select({ fixtures: sel.liveIds.includes(fx.id) ? sel.liveIds.filter((id) => !set.includes(id)) : [...new Set([...sel.liveIds, ...set])] });
      return;
    }
    if (dbl(`fx:${fx.id}`, e)) {
      // A double press turns it 90° and begins no drag (it must not fall through to a pan).
      e.stopPropagation();
      const ids = sel.targetIds(fx.id);
      sel.select({ fixtures: ids });
      if (sel.anyLocked(ids)) return;
      sel.setFixtures((all) => rotateFixtures(all, ids, 90));
      return;
    }
    const wasSelected = sel.liveIds.length === 1 && sel.liveIds[0] === fx.id;
    // Ctrl/Cmd+click picks the item alone, even inside a group; a plain click takes its whole group.
    const ids = e.ctrlKey || e.metaKey ? [fx.id] : sel.liveIds.includes(fx.id) ? sel.liveIds : expandToGroups([fx.id], sel.allFixtures);
    if (ids !== sel.liveIds) sel.select({ fixtures: ids });
    // A locked item selects but never drags; the press pans instead, and its release must not deselect it again
    // (a fall-through to the background would run backgroundTap, whose Furnish branch clears the selection).
    if (sel.anyLocked(ids)) {
      drag.beginPan(e);
      return;
    }
    const f0 = getFloor();
    const ppm = f0.pxPerM;
    const p = atOf(e);
    const dx = fx.x - p.x;
    const dy = fx.y - p.y;
    // The other furniture's boxes, once, for the alignment guides.
    const others: Rect[] = (f0.fixtures ?? []).flatMap((o) => {
      const oi = ids.includes(o.id) ? undefined : byId(o.type);
      if (!oi || isElectricalItem(oi)) return [];
      const ob = fixtureBox(o, oi);
      return [boxRect(o, ob.w * ppm, ob.d * ppm, o.rot)];
    });
    drag.begin(e, {
      kind: "fixture",
      data: { fixtureId: fx.id },
      move: (m) => {
        const B = L.current;
        const f = getFloor();
        const all = f.fixtures ?? [];
        const cur = all.find((x) => x.id === fx.id);
        const item = cur && byId(cur.type);
        if (!cur || !item) return;
        const t = tol();
        const target = { x: m.at.x + dx, y: m.at.y + dy };
        if (ids.length > 1) {
          // Several items move rigidly by the same step, with no wall snapping; the group's box lines up with other furniture.
          let mx = target.x - cur.x;
          let my = target.y - cur.y;
          const box = selectionBounds(all, ids, ppm);
          if (box) {
            const at = (d: Pt): Rect => ({ x0: box.x0 + d.x, y0: box.y0 + d.y, x1: box.x1 + d.x, y1: box.y1 + d.y });
            if (!m.alt) {
              const a = alignSnap(at({ x: mx, y: my }), others, t, { x: true, y: true });
              mx += a.dx;
              my += a.dy;
            }
            setGuides(m.alt ? [] : alignGuides(at({ x: mx, y: my }), others));
          }
          if (mx || my) B.sel.setFixtures((list) => moveFixtures(list, ids, mx, my));
          return;
        }
        const b = fixtureBox(cur, item);
        const snapped = B.geo.snapFixture(target, { ...b, ceiling: isCeilingItem(item) }, cur.rot, m.alt, cur.id, snapKind(item));
        let pos: { x: number; y: number; rot?: number } = snapped ?? target;
        // Electrical points sit on a wall face or free; they never align to furniture.
        if (m.alt || isElectricalItem(item)) setGuides([]);
        else if (!isElectricalItem(item)) {
          const reach = Math.max(t * 1.5, 0.1 * ppm);
          const onWall = snapped ? snapToWall(target, b.w * ppm, b.d * ppm, B.geo.faceLines, reach, cur.rot) : null;
          // Abutting a neighbour already placed it exactly; only wall-snapped and free positions get aligned.
          const abutted = !!snapped && (!onWall || Math.hypot(onWall.x - snapped.x, onWall.y - snapped.y) > 1e-6);
          const rot = snapped?.rot ?? cur.rot;
          const mod = ((rot % 180) + 180) % 180;
          const axes = abutted ? { x: false, y: false } : !snapped ? { x: true, y: true } : mod < 1 || mod > 179 ? { x: true, y: false } : Math.abs(mod - 90) < 1 ? { x: false, y: true } : { x: false, y: false };
          const boxAt = (c: Pt) => boxRect(c, b.w * ppm, b.d * ppm, rot);
          const a = alignSnap(boxAt(pos), others, t, axes);
          pos = { ...pos, x: pos.x + a.dx, y: pos.y + a.dy };
          setGuides(abutted ? [] : alignGuides(boxAt(pos), others));
        }
        B.sel.patchFixture(cur.id, pos);
      },
      end: () => setGuides([]),
      cancelled: () => setGuides([]),
      // Clicking the selected item again reaches whatever is under it (a base unit below a wall cabinet).
      tap: (m) => {
        if (!wasSelected) return;
        const next = nextUnder(L.current.geo.hitShapes, m.at, fx.id);
        if (next && next !== fx.id) {
          const B = L.current;
          B.sel.select({ fixtures: expandToGroups([next], B.sel.allFixtures) });
        }
      },
    });
  };

  return {
    drag,
    svgProps: drag.svgProps,
    guides,
    marquee,
    hoverRoom,
    unhoverRoom,
    addRoom,
    placeOpeningAt,
    cornerDown,
    midDown,
    edgeDown,
    wallEndDown,
    wallDown,
    openingDown,
    canopyDown,
    canopyCornerDown,
    stairsDown,
    chipDown,
    fixtureDown,
    /** True while a wall (a room's or a free-standing one) is being dragged: the status line says how to cancel. */
    movingWall: drag.kind === "poly-edge" || drag.kind === "wall",
  };
}
export type PlanDrag = ReturnType<typeof usePlanDrag>;
