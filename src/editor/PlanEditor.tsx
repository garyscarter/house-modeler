import { useEffect, useMemo, useRef, useState } from "react";
import { ask, askText, choose } from "../components/Dialogs";
import { flightWinders, STAIRS_VECTOR } from "../lib/stairs";
import type { Fixture, Floor, Opening, Pt, Room, VariantKey, Wall } from "../types";
import { byId, isFloorCovering, mountOf, type CatalogueItem } from "../lib/catalogue";
import { FixtureSymbol } from "./FixtureSymbol";
import { OpeningSymbol } from "./OpeningSymbol";
import { confirmKnockThrough } from "./KnockThrough";
import { knockThroughNeighbours } from "../lib/mergeRooms";
import { BuildRoomPanel, CanopyInspector, FixtureInspector, NumberField, OpeningInspector, WallInspector } from "./Inspectors";
import { AddPopover } from "./AddItem";
import { ToolRail, type RailItem } from "./ToolRail";
import { takePendingTool, PLAN_TOOL_EVENT } from "./planTool";
import { ContextMenu, type MenuItem, type MenuState } from "../components/ContextMenu";
import { InspectorCard } from "../components/InspectorCard";
import { Info } from "../components/Info";
import { Icon, type IconName } from "../components/icons";
import { planKeyAction } from "../lib/planKeys";
import { planTargetAt, type PlanTarget } from "../lib/planHit";
import { TOOL_KEY, TOOL_LABEL } from "../lib/shortcuts";
import { DecoratePanel } from "./DecoratePanel";
import { BuildSummary, DecorateSummary, FurnishSummary } from "./ModeSummaries";
import { usePanelPrefs } from "../components/panelPrefs";
import { pickInPlan } from "../lib/decorPick";
import { PLAN_TOOLS, pruneSelection, type Tool } from "../lib/modes";
import { usePlanCamera } from "./usePlanCamera";
import { uid } from "../types";
import { useStore } from "../store";
import { bbox, EXT_WALL_T, pointInPolygon, polygonCentroid, WALL_T } from "../lib/geometry";
import {
  areaM2,
  closestOnSegment,
  SWING_KINDS,
  dist,
  edgeLengthsM,
  fixtureBox,
  fixtureSolids,
  formatArea,
  formatLength,
  inwardNormals,
  nearestSegment,
  outsideSide,
  overlappingIds,
  panCam,
  pinchCam,
  segOrientation,
  setEdgeLength,
  snapPoint,
  snapToWall,
  turn,
  viewBoxOf,
  wallLines,
  abutNeighbours,
  DOUBLE_DOOR_M,
  type Cam,
  type Placement,
  type Seg,
  type Size,
} from "../lib/planMath";
import { roomColor } from "../lib/roomColor";
import { planWallLines, planWalls } from "../lib/planWalls";
import { addCanopy, canopyAt, moveCanopy, moveCanopyCorner, removeCanopy, resizeCanopy, snapShift } from "../lib/canopy";
import { insertCorner, removeCorner } from "../lib/featureWalls";
import { arrowDelta, keyBelongsElsewhere, pasteAt, slideOpening } from "../lib/nudge";
import { getClipboardFixture, setClipboardFixture, useClipboardFixture } from "../lib/clipboard";
import "./PlanEditor.css";

type Drag =
  | { kind: "corner"; roomId: string; idx: number }
  | { kind: "opening"; openingId: string }
  | { kind: "canopyCorner"; idx: number }
  /** The selected canopy follows the pointer once the press wanders beyond a few pixels; list0 is how the canopies stood at the press. */
  | { kind: "canopy"; idx: number; p0: Pt; x0: number; y0: number; list0: Pt[][]; moved: boolean }
  | { kind: "stairs" }
  | { kind: "wallEnd"; wallId: string; end: "a" | "b" }
  /** Moves once the press wanders beyond a few pixels; a click on an item that was already selected picks the next item under it. */
  | { kind: "fixture"; fixtureId: string; dx: number; dy: number; x0: number; y0: number; moved: boolean; wasSelected: boolean }
  /** Background drag: pans once it moves beyond a few pixels, otherwise it is a click. */
  | { kind: "pan"; x0: number; y0: number; cam0: Cam; moved: boolean }
  | { kind: "pinch"; cam0: Cam; m0: Pt; d0: number };

type Selection = { room?: string; opening?: string; wall?: string; fixture?: string; canopy?: number };

/** Real-thickness walls in the plan: near-black fill with a lighter edge so they read on the floorplan image and on white. */
const WALL_FILL = "#27272a";
const WALL_EDGE = "#a1a1aa";

/** Screen pixels a press may wander before it counts as a drag rather than a click. */
const CLICK_SLOP = 6;

/** One zoom button press or key press. */
const ZOOM_STEP = 1.4;

/**
 * 2D check-and-fix view: the geometry drawn over the source image. Used to
 * correct the traced plan and to lay out furniture. Coordinates are image px; the camera only changes the view
 * box, and strokes, handles and text are sized in screen pixels.
 */
export function PlanEditor({ variant, floor }: { variant: VariantKey; floor: Floor }) {
  const updateFloor = useStore((s) => s.updateFloor);
  const updateRoom = useStore((s) => s.updateRoom);
  const selectedRoomId = useStore((s) => s.selectedRoomId);
  const selectedEdge = useStore((s) => s.selectedEdge);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const build = mode === "build";
  const decorate = mode === "decorate";
  const furnish = mode === "furnish";
  const setUi = useStore((s) => s.setUi);
  const planImage = useStore((s) => s.planImage);
  const wallsOn = useStore((s) => s.planWalls);
  const [tool, setTool] = useState<Tool>(mode === "build" && !floor.rooms.length ? "rect" : "select");
  const [calib, setCalib] = useState<Pt[]>([]);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [altHeld, setAltHeld] = useState(false);
  const [measure, setMeasure] = useState<Pt[]>([]);
  const [edgeEdit, setEdgeEdit] = useState<{ roomId: string; idx: number } | null>(null);
  /** The selected room's wall lit from its row in the inspector. */
  const [litEdge, setLitEdge] = useState<number | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  /** Canopies have no ids, so the selected one is its index in floor.canopies. */
  const [selectedCanopy, setSelectedCanopy] = useState<number | null>(null);
  /** The room corner last clicked or dragged: the one the arrow keys move. */
  const [activeCorner, setActiveCorner] = useState<{ roomId: string; idx: number } | null>(null);
  const clipboard = useClipboardFixture();
  const [placing, setPlacing] = useState<{ item: CatalogueItem; rot: number } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const peeking = useStore((s) => s.peek);
  const hoveredRoomId = useStore((s) => s.hoveredRoomId);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Pt>());
  const suppressClick = useRef(false);
  const ppm = floor.pxPerM;

  const roomsRect = useMemo(() => {
    const all = floor.rooms.flatMap((r) => r.polygon);
    return all.length >= 3 ? bbox(all) : { x0: 0, y0: 0, x1: floor.imageW, y1: floor.imageH };
  }, [floor.rooms, floor.imageW, floor.imageH]);
  const imageRect = { x0: 0, y0: 0, x1: floor.imageW, y1: floor.imageH };
  const { size, cam, setCam, fit, zoomBy, limits } = usePlanCamera(wrapRef, roomsRect, floor.id, ppm, { w: floor.imageW, h: floor.imageH });

  // One screen pixel in image px: everything drawn is sized with it so it reads the same at any zoom.
  const px = cam?.s ?? 1;
  const stroke = px * 1.25;
  // Handles: a small visible dot inside a bigger invisible target.
  const handleR = px * 6;
  const dotR = px * 3.6;
  const hitR = px * 8;
  const hitSmall = px * 6;
  const fontSize = px * 13;
  const snapTol = px * 10;

  const lines = useMemo(() => wallLines(floor, WALL_T, EXT_WALL_T), [floor]);
  const segs = useMemo(() => lines.map((l) => [l.a, l.b] as Seg), [lines]);
  // The walls as the 3D shell builds them, with real thickness: drawn as the wall layer and used to sit furniture flush on the faces.
  // Only the geometry matters here, so fixture drags and the like do not rebuild them.
  const { rooms: fRooms, walls: fWalls, openings: fOpenings, pxPerM: fPpm, origin: fOrigin, offset: fOffset } = floor;
  const wallShapes = useMemo(() => (wallsOn ? planWalls(floor) : []), [wallsOn, fRooms, fWalls, fOpenings, fPpm, fOrigin, fOffset]);
  const faceLines = useMemo(() => planWallLines(floor), [fRooms, fWalls, fPpm, fOrigin, fOffset]);
  const solids = useMemo(() => fixtureSolids(floor.fixtures ?? [], ppm, byId), [floor.fixtures, ppm]);
  const clashes = useMemo(() => overlappingIds(solids, 0.5), [solids]);
  // Rugs draw under everything, and wall-hung and worktop items over the units below them, whatever order they were placed in.
  const mountedAt = (fx: Fixture) => { const it = byId(fx.type); return !it ? 0 : isFloorCovering(it) ? -1 : mountOf(fx, it); };
  const drawOrder = useMemo(() => [...(floor.fixtures ?? [])].sort((a, b) => mountedAt(a) - mountedAt(b)), [floor.fixtures]);
  const footprints = useMemo(
    () =>
      (floor.fixtures ?? []).flatMap((fx) => {
        const item = byId(fx.type);
        if (!item) return [];
        const b = fixtureBox(fx, item);
        return [{ id: fx.id, x: fx.x, y: fx.y, rot: fx.rot, w: b.w * ppm, d: b.d * ppm, z0: b.z0, z1: b.z0 + b.h }];
      }),
    [floor.fixtures, ppm],
  );
  /**
   * Where a fixture centred at c lands: back against a wall within reach,
   * facing into the room and flush with its neighbours in the run; null when
   * no wall is near or Alt is held.
   */
  const snapFixture = (c: Pt, b: { w: number; d: number; h: number; z0: number }, rot: number, free: boolean, exclude?: string): Placement | null => {
    if (free) return null;
    // Reach: a little more than for corners, and never under 10 cm when zoomed right in.
    const reach = Math.max(snapTol * 1.5, 0.1 * ppm);
    const onWall = snapToWall(c, b.w * ppm, b.d * ppm, faceLines, reach, rot);
    if (!onWall) return null;
    const others = footprints.filter((f) => f.id !== exclude);
    return abutNeighbours(onWall, b.w * ppm, b.d * ppm, b.z0, b.z0 + b.h, others, reach);
  };
  /** Points worth snapping to: room corners, wall ends and fixture corners. */
  const corners = useMemo(
    () => [
      ...floor.rooms.flatMap((r) => r.polygon),
      ...(floor.walls ?? []).flatMap((w) => [w.a, w.b]),
      ...solids.flatMap((s) => s.corners),
    ],
    [floor.rooms, floor.walls, solids],
  );

  const toImage = (e: { clientX: number; clientY: number }): Pt => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: px * (e.clientX - r.left) + (cam?.x ?? 0), y: px * (e.clientY - r.top) + (cam?.y ?? 0) };
  };
  const toScreen = (p: Pt): Pt => ({ x: (p.x - (cam?.x ?? 0)) / px, y: (p.y - (cam?.y ?? 0)) / px });

  /** Snap to room corners and wall ends, then to their x / y lines, so walls line up. */
  const snapTargets = useMemo(() => [...floor.rooms.flatMap((r) => r.polygon), ...(floor.walls ?? []).flatMap((w) => [w.a, w.b])], [floor.rooms, floor.walls]);
  const snap = (p: Pt, exclude?: Pt) => snapPoint(p, snapTargets.filter((v) => v !== exclude), snapTol).p;

  const select = (s: Selection) => {
    setSelectedOpeningId(s.opening ?? null);
    setSelectedWallId(s.wall ?? null);
    setSelectedFixtureId(s.fixture ?? null);
    setSelectedCanopy(s.canopy ?? null);
    setLitEdge(null);
    setUi({ selectedRoomId: s.room ?? null, selectedEdge: null });
    setEdgeEdit(null);
    setActiveCorner(null);
  };

  const setFixtures = (fn: (fx: Fixture[]) => Fixture[]) => updateFloor(variant, floor.id, (f) => ({ ...f, fixtures: fn(f.fixtures ?? []) }));
  const patchFixture = (id: string, p: Partial<Fixture>) => setFixtures((all) => all.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const duplicateFixture = (id: string) => {
    const src = (floor.fixtures ?? []).find((x) => x.id === id);
    if (!src) return;
    const copy: Fixture = { ...src, id: uid(), x: src.x + 0.2 * ppm, y: src.y + 0.2 * ppm };
    setFixtures((all) => [...all, copy]);
    select({ fixture: copy.id });
  };
  const copyFixture = (id: string) => {
    const src = (floor.fixtures ?? []).find((x) => x.id === id);
    if (src) setClipboardFixture(src);
  };
  /** Paste the clipboard's fixture onto this floor (any layout or floor), selecting the copy. */
  const pasteFixture = (where?: Pt) => {
    const src = getClipboardFixture();
    if (!src || !byId(src.type)) return;
    const centre = where ?? (cam && size ? { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 } : { x: floor.imageW / 2, y: floor.imageH / 2 });
    const at = pasteAt(src, floor.fixtures ?? [], { w: floor.imageW, h: floor.imageH }, centre, ppm);
    const copy: Fixture = { ...src, id: uid(), x: at.x, y: at.y };
    setFixtures((all) => [...all, copy]);
    select({ fixture: copy.id });
  };
  const canopies = floor.canopies ?? [];
  const setCanopies = (fn: (c: Pt[][]) => Pt[][]) => updateFloor(variant, floor.id, (f) => ({ ...f, canopies: fn(f.canopies ?? []) }));
  const removeSelected = () => {
    if (selectedCanopy !== null) {
      setCanopies((all) => removeCanopy(all, selectedCanopy));
      setSelectedCanopy(null);
    } else if (selectedFixtureId) {
      setFixtures((all) => all.filter((x) => x.id !== selectedFixtureId));
      setSelectedFixtureId(null);
    } else if (selectedOpeningId) {
      updateFloor(variant, floor.id, (f) => ({ ...f, openings: f.openings.filter((o) => o.id !== selectedOpeningId) }));
      setSelectedOpeningId(null);
    } else if (selectedWallId) {
      updateFloor(variant, floor.id, (f) => ({ ...f, walls: (f.walls ?? []).filter((w) => w.id !== selectedWallId) }));
      setSelectedWallId(null);
    }
  };

  /** Move the selection by (dx, dy) image px; false when nothing selected can move that way. */
  const nudgeSelection = (dx: number, dy: number): boolean => {
    if (!build && !furnish) return false;
    if (selectedCanopy !== null) {
      if (!canopies[selectedCanopy]) return false;
      setCanopies((all) => moveCanopy(all, selectedCanopy, dx, dy));
    } else if (selectedFixtureId) {
      const fx = (floor.fixtures ?? []).find((x) => x.id === selectedFixtureId);
      if (!fx) return false;
      patchFixture(fx.id, { x: fx.x + dx, y: fx.y + dy });
    } else if (selectedOpeningId) {
      const o = floor.openings.find((x) => x.id === selectedOpeningId);
      if (!o) return false;
      // The wall it sits on: the nearest one running the same way.
      const along = segs.filter((s) => segOrientation(s) === o.orientation);
      const near = nearestSegment({ x: o.x, y: o.y }, along.length ? along : segs);
      if (near) {
        const at = slideOpening(o, near.seg, dx, dy, ppm);
        updateFloor(variant, floor.id, (f) => ({ ...f, openings: f.openings.map((x) => (x.id === o.id ? { ...x, ...at } : x)) }));
      }
    } else if (selectedWallId) {
      if (!(floor.walls ?? []).some((w) => w.id === selectedWallId)) return false;
      updateFloor(variant, floor.id, (f) => ({ ...f, walls: (f.walls ?? []).map((w) => (w.id === selectedWallId ? { ...w, a: { x: w.a.x + dx, y: w.a.y + dy }, b: { x: w.b.x + dx, y: w.b.y + dy } } : w)) }));
    } else if (activeCorner && selectedRoomId === activeCorner.roomId) {
      const room = floor.rooms.find((r) => r.id === activeCorner.roomId);
      if (!room?.polygon[activeCorner.idx]) return false;
      updateFloor(variant, floor.id, (f) => ({
        ...f,
        rooms: f.rooms.map((r) => (r.id === room.id ? { ...r, polygon: r.polygon.map((v, i) => (i === activeCorner.idx ? { x: v.x + dx, y: v.y + dy } : v)) } : r)),
      }));
    } else return false;
    return true;
  };

  // Keyboard shortcuts read the latest state through a ref so the listener is attached once.
  const onKey = (e: KeyboardEvent) => {
    if (keyBelongsElsewhere(e.target, document) || useStore.getState().peek) return;
    const mod = e.ctrlKey || e.metaKey;
    const act = planKeyAction(e, { mode, fixtureSelected: !!selectedFixtureId, placing: !!placing });
    const arrow = !mod && !e.altKey ? arrowDelta(e.key, e.shiftKey) : null;
    if (arrow) {
      if (!placing && tool === "select" && nudgeSelection(arrow.x * ppm, arrow.y * ppm)) e.preventDefault();
    } else if (mod && e.key.toLowerCase() === "c" && selectedFixtureId) {
      e.preventDefault();
      copyFixture(selectedFixtureId);
    } else if (mod && e.key.toLowerCase() === "v" && getClipboardFixture()) {
      e.preventDefault();
      // Furniture only lives in Furnish: switch there, then paste.
      if (!furnish) setMode("furnish");
      pasteFixture();
    } else if (e.key === "Escape" && !e.defaultPrevented) {
      setDraft([]);
      setCalib([]);
      setMeasure([]);
      select({});
      if (placing) {
        setPlacing(null);
        setTool("select");
      }
    } else if (mod && e.key.toLowerCase() === "d" && selectedFixtureId) {
      e.preventDefault();
      duplicateFixture(selectedFixtureId);
    } else if (act) {
      e.preventDefault();
      if ("tool" in act) pick(act.tool);
      else if ("rotate" in act) {
        if (placing) setPlacing({ ...placing, rot: turn(placing.rot, act.rotate) });
        else if (selectedFixtureId) {
          const fx = (floor.fixtures ?? []).find((x) => x.id === selectedFixtureId);
          if (fx) patchFixture(fx.id, { rot: turn(fx.rot, act.rotate) });
        }
      } else if ("image" in act) setUi({ planImage: { ...planImage, show: !planImage.show } });
      else if ("zoom" in act) zoomBy(act.zoom > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
      else if ("fit" in act) fit();
      else if ("add" in act) setAddOpen(true);
    } else if ((e.key === "Delete" || e.key === "Backspace") && (build || furnish)) {
      removeSelected();
    }
  };
  // A room picked from elsewhere (the 3D view) takes over from the canopy.
  useEffect(() => {
    if (selectedRoomId) setSelectedCanopy(null);
  }, [selectedRoomId]);
  const keyRef = useRef(onKey);
  keyRef.current = onKey;
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ---- Pointer handling. Every press is tracked so a second touch point (a trackpad pinch) turns any gesture into a zoom.
  const local = (p: Pt): Pt => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: p.x - r.left, y: p.y - r.top };
  };
  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    return { m: local({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  };

  const onPointerDownCapture = (e: React.PointerEvent) => {
    // A mouse has one pointer; clear any press whose release happened off the plan.
    if (e.pointerType === "mouse") pointers.current.clear();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && cam) {
      // Second touch point: stop whatever the first started and pinch instead; don't let the press reach a handle.
      e.stopPropagation();
      const { m, d } = pinchState();
      drag.current = { kind: "pinch", cam0: cam, m0: m, d0: d };
      suppressClick.current = true;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Only presses on the background or a room get here; handles stop propagation.
    if (e.button !== 0 || !cam) return;
    suppressClick.current = false;
    drag.current = { kind: "pan", x0: e.clientX, y0: e.clientY, cam0: cam, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    const raw = toImage(e);
    if (!d) {
      setAltHeld(e.altKey);
      // Only the drawing tools and placing follow the mouse; in Select mode a move must not redraw the plan.
      if (e.pointerType === "mouse" && tool !== "select" && tool !== "door" && tool !== "window" && tool !== "gap" && tool !== "calibrate")
        setHover(tool === "place" ? raw : snapMeasure(raw));
      return;
    }
    if (d.kind === "fixture" || d.kind === "canopy") {
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < CLICK_SLOP) return;
      d.moved = true;
    }
    // A drag that ends off its handle must not also click the room under the pointer.
    if (d.kind !== "pan" && d.kind !== "pinch") suppressClick.current = true;
    switch (d.kind) {
      case "pinch": {
        if (pointers.current.size < 2) return;
        const { m, d: dd } = pinchState();
        setCam(pinchCam(d.cam0, d.m0, m, d.d0, dd, limits.current.min, limits.current.max));
        return;
      }
      case "pan": {
        const dx = e.clientX - d.x0;
        const dy = e.clientY - d.y0;
        if (!d.moved && Math.hypot(dx, dy) < CLICK_SLOP) return;
        d.moved = true;
        suppressClick.current = true;
        setCam(panCam(d.cam0, dx, dy));
        return;
      }
      case "fixture": {
        const fx = (floor.fixtures ?? []).find((x) => x.id === d.fixtureId);
        const item = fx && byId(fx.type);
        if (!fx || !item) return;
        const target = { x: raw.x + d.dx, y: raw.y + d.dy };
        const b = fixtureBox(fx, item);
        patchFixture(fx.id, snapFixture(target, b, fx.rot, e.altKey, fx.id) ?? target);
        return;
      }
      case "wallEnd": {
        const w = (floor.walls ?? []).find((x) => x.id === d.wallId);
        const p = snap(raw, w?.[d.end]);
        updateFloor(variant, floor.id, (f) => ({ ...f, walls: (f.walls ?? []).map((x) => (x.id === d.wallId ? { ...x, [d.end]: p } : x)) }));
        return;
      }
      case "corner": {
        const room = floor.rooms.find((r) => r.id === d.roomId);
        const p = snap(raw, room?.polygon[d.idx]);
        updateFloor(variant, floor.id, (f) => ({
          ...f,
          rooms: f.rooms.map((r) => (r.id === d.roomId ? { ...r, polygon: r.polygon.map((v, i) => (i === d.idx ? p : v)) } : r)),
        }));
        return;
      }
      case "canopyCorner":
        if (selectedCanopy !== null) setCanopies((all) => moveCanopyCorner(all, selectedCanopy, d.idx, snap(raw)));
        return;
      case "canopy": {
        // Shift the whole canopy; one of its corners snaps to a room corner or wall end unless Alt is held.
        const shift = { dx: raw.x - d.p0.x, dy: raw.y - d.p0.y };
        const poly = d.list0[d.idx];
        const adj = poly && !e.altKey ? snapShift(poly, shift.dx, shift.dy, snapTargets, snapTol) : shift;
        setCanopies(() => moveCanopy(d.list0, d.idx, adj.dx, adj.dy));
        return;
      }
      case "stairs":
        updateFloor(variant, floor.id, { stairs: raw });
        return;
      case "opening": {
        // Slide along the nearest wall, turning with it; off any wall it follows the pointer.
        const near = nearestSegment(raw, segs);
        const onWall = near && near.d < snapTol * 2.5 ? { x: near.q.x, y: near.q.y, orientation: segOrientation(near.seg) } : raw;
        updateFloor(variant, floor.id, (f) => ({ ...f, openings: f.openings.map((o) => (o.id === d.openingId ? { ...o, ...onWall } : o)) }));
        return;
      }
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.kind === "fixture" && !d.moved && d.wasSelected && e.type === "pointerup") {
      // Clicking the selected item again reaches whatever is under it (a base unit below a wall cabinet).
      const p = toImage(e);
      const under = [...drawOrder]
        .reverse()
        .filter((fx) => solids.find((s) => s.id === fx.id && pointInPolygon(p, s.corners)))
        .map((fx) => fx.id);
      const i = under.indexOf(d.fixtureId);
      if (under.length > 1 && i >= 0) select({ fixture: under[(i + 1) % under.length] });
    }
    if (d?.kind === "pinch") {
      if (pointers.current.size < 2) drag.current = null;
    } else drag.current = null;
  };

  const startDrag = (e: React.PointerEvent, d: Drag) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    suppressClick.current = false;
    drag.current = d;
  };

  /** Measure and drawing tools snap to corners, wall ends and fixture corners. */
  const snapMeasure = (p: Pt) => (tool === "measure" ? snapPoint(p, corners, snapTol).p : snap(p));

  const addRoom = async (polygon: Pt[]) => {
    const name = await askText("Room name:", `Room ${floor.rooms.length + 1}`);
    if (name === null) return;
    const room: Room = { id: uid(), name: name || `Room ${floor.rooms.length + 1}`, polygon };
    updateFloor(variant, floor.id, (f) => ({ ...f, rooms: [...f.rooms, room] }));
    setUi({ selectedRoomId: room.id });
  };

  /** Drop a door, window or gap on the wall nearest `raw` (on the spot itself when no wall is near) and select it. */
  const placeOpeningAt = (kind: "door" | "window" | "gap", raw: Pt) => {
    const near = nearestSegment(raw, segs);
    const at = near && near.d < snapTol * 3 ? near.q : raw;
    const op: Opening = {
      id: uid(),
      kind,
      x: at.x,
      y: at.y,
      orientation: near ? segOrientation(near.seg) : "h",
      widthM: kind === "door" ? 0.85 : kind === "gap" ? 1.5 : 1.2,
    };
    updateFloor(variant, floor.id, (f) => ({ ...f, openings: [...f.openings, op] }));
    select({ opening: op.id });
  };

  const onClickCanvas = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const raw = toImage(e);
    if (tool === "place" && placing) {
      const fx: Fixture = { id: uid(), type: placing.item.id, x: raw.x, y: raw.y, rot: placing.rot };
      const snapped = snapFixture(raw, { ...placing.item, z0: placing.item.mount ?? 0 }, placing.rot, e.altKey);
      setFixtures((all) => [...all, { ...fx, ...snapped }]);
      return; // stay in place mode for the next one
    }
    if (tool === "door" || tool === "window" || tool === "gap") {
      placeOpeningAt(tool, raw);
    } else if (tool === "wall") {
      const p = snap(raw);
      if (draft.length === 0) setDraft([p]);
      else {
        const a = draft[0];
        setDraft([]);
        if (dist(a, p) < snapTol) return;
        const wall: Wall = { id: uid(), a, b: p };
        updateFloor(variant, floor.id, (f) => ({ ...f, walls: [...(f.walls ?? []), wall] }));
        select({ wall: wall.id });
      }
    } else if (tool === "measure") {
      const p = snapMeasure(raw);
      setMeasure(measure.length === 1 ? [measure[0], p] : [p]);
    } else if (tool === "calibrate") {
      const next = [...calib, raw];
      if (next.length === 2) {
        const d = dist(next[0], next[1]);
        void askText("Real-world distance between those two points, in metres:", "3.0").then((v) => {
          const m = parseFloat(v ?? "");
          if (m > 0 && d > 0) updateFloor(variant, floor.id, { pxPerM: d / m });
        });
        setCalib([]);
      } else setCalib(next);
    } else if (tool === "canopy") {
      const p = snap(raw);
      if (draft.length === 0) setDraft([p]);
      else {
        const a = draft[0];
        setDraft([]);
        if (Math.abs(a.x - p.x) < snapTol || Math.abs(a.y - p.y) < snapTol) return;
        setCanopies((all) => addCanopy(all, a, p));
        setTool("select");
        select({ canopy: canopies.length });
      }
    } else if (tool === "rect") {
      const p = snap(raw);
      if (draft.length === 0) setDraft([p]);
      else {
        const a = draft[0];
        setDraft([]);
        if (Math.abs(a.x - p.x) < snapTol || Math.abs(a.y - p.y) < snapTol) return;
        addRoom([
          { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y) },
          { x: Math.max(a.x, p.x), y: Math.min(a.y, p.y) },
          { x: Math.max(a.x, p.x), y: Math.max(a.y, p.y) },
          { x: Math.min(a.x, p.x), y: Math.max(a.y, p.y) },
        ]);
      }
    } else if (tool === "room") {
      const p = snap(raw);
      // Clicking the first point again closes the polygon.
      if (draft.length >= 3 && dist(p, draft[0]) < snapTol) {
        addRoom(draft);
        setDraft([]);
      } else setDraft([...draft, p]);
    } else if (decorate) {
      const hit = pickInPlan(floor.rooms.map((r) => ({ id: r.id, poly: r.polygon })), raw, 8 * px + 0.12 * ppm);
      select({ room: hit?.roomId });
      if (hit) {
        setUi({ selectedEdge: hit.edge === null ? null : { edge: hit.edge, side: hit.side } });
        if (hit.edge === null) usePanelPrefs.getState().setOpen("decorate.floor", true);
      }
    } else if (furnish) {
      select({});
    } else if (build) {
      // Rooms sit over canopies, so they win where the two overlap.
      const hit = [...floor.rooms].reverse().find((r) => pointInPolygon(raw, r.polygon));
      // Shift+click a neighbour of the selected room: knock the two through.
      const from = floor.rooms.find((r) => r.id === selectedRoomId);
      if (e.shiftKey && from && hit && hit.id !== from.id && knockThroughNeighbours(floor, from.id).some((r) => r.id === hit.id)) {
        void confirmKnockThrough(variant, floor, from, hit);
        return;
      }
      const roof = hit ? -1 : canopyAt(canopies, raw);
      select(roof >= 0 ? { canopy: roof } : { room: hit?.id });
    }
  };

  const finishRoom = () => {
    if (draft.length >= 3) addRoom(draft);
    setDraft([]);
  };

  // ---- Right-click menu: actions for whatever is under the pointer (lib/planHit decides what that is).
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!cam || peeking) return;
    drag.current = null;
    // Right-click while drawing cancels the unfinished shape instead of opening a menu.
    if (draft.length || calib.length || measure.length) {
      setDraft([]);
      setCalib([]);
      setMeasure([]);
      return;
    }
    const raw = toImage(e);
    const shapes = drawOrder.flatMap((fx) => solids.filter((s) => s.id === fx.id));
    const target = planTargetAt(floor, raw, mode, { hit: px * 10, edge: px * 12 }, shapes);
    const items = menuItemsFor(target, raw);
    if (items.length) setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const toggleImage = () => setUi({ planImage: { ...planImage, show: !planImage.show } });
  const menuItemsFor = (t: PlanTarget, raw: Pt): MenuItem[] => {
    const empty: MenuItem[] = [
      ...(clipboard && (build || furnish)
        ? [
            {
              label: `Paste ${byId(clipboard.type)?.name ?? "item"} here`,
              hint: "Ctrl V",
              run: () => {
                if (!furnish) setMode("furnish");
                pasteFixture(raw);
              },
            } satisfies MenuItem,
          ]
        : []),
      { label: "Fit the rooms", hint: "F", run: () => fit() },
      { label: planImage.show ? "Hide floorplan image" : "Show floorplan image", hint: "I", run: toggleImage },
    ];
    if (t.kind === "fixture" && furnish) {
      const id = t.id;
      return [
        { label: "Turn 90°", hint: "R", run: () => { select({ fixture: id }); const fx = (floor.fixtures ?? []).find((x) => x.id === id); if (fx) patchFixture(id, { rot: turn(fx.rot, 90) }); } },
        { label: "Duplicate", hint: "Ctrl D", run: () => duplicateFixture(id) },
        { label: "Copy", hint: "Ctrl C", run: () => { select({ fixture: id }); copyFixture(id); } },
        "sep",
        { label: "Remove", hint: "Del", danger: true, run: () => { setFixtures((all) => all.filter((x) => x.id !== id)); select({}); } },
      ];
    }
    if (t.kind === "opening" && build) {
      const o = floor.openings.find((x) => x.id === t.id);
      if (!o) return empty;
      const patch = (p: Partial<Opening>) => updateFloor(variant, floor.id, (f) => ({ ...f, openings: f.openings.map((x) => (x.id === o.id ? { ...x, ...p } : x)) }));
      const pair = o.kind === "door" && o.widthM > DOUBLE_DOOR_M && outsideSide(o, floor.rooms, 0.3 * ppm) === 0;
      const swing = SWING_KINDS.includes(o.kind);
      const asKinds = (["door", "window", "gap"] as const).filter((k) => k !== o.kind);
      return [
        ...(swing && o.kind !== "french" && !pair ? [{ label: "Flip hinge", run: () => { select({ opening: o.id }); patch({ flipHinge: !o.flipHinge || undefined }); } } satisfies MenuItem] : []),
        ...(swing ? [{ label: "Flip swing", run: () => { select({ opening: o.id }); patch({ flipSwing: !o.flipSwing || undefined }); } } satisfies MenuItem] : []),
        ...(swing ? (["sep"] as MenuItem[]) : []),
        ...asKinds.map((k): MenuItem => ({ label: `Make it a ${k}`, run: () => { select({ opening: o.id }); patch({ kind: k }); } })),
        "sep",
        { label: "Delete", hint: "Del", danger: true, run: () => { updateFloor(variant, floor.id, (f) => ({ ...f, openings: f.openings.filter((x) => x.id !== o.id) })); select({}); } },
      ];
    }
    if (t.kind === "wall") {
      const w = (floor.walls ?? []).find((x) => x.id === t.id);
      if (!w) return empty;
      if (decorate) return [{ label: "Decorate this wall", run: () => select({ wall: w.id }) }];
      const at = closestOnSegment(raw, w.a, w.b).q;
      return [
        { label: "Add door here", run: () => placeOpeningAt("door", at) },
        { label: "Add window here", run: () => placeOpeningAt("window", at) },
        "sep",
        { label: "Delete wall", hint: "Del", danger: true, run: () => { updateFloor(variant, floor.id, (f) => ({ ...f, walls: (f.walls ?? []).filter((x) => x.id !== w.id) })); select({}); } },
      ];
    }
    if (t.kind === "room") {
      const room = floor.rooms.find((r) => r.id === t.id);
      if (!room) return empty;
      const edge = t.edge;
      if (decorate) {
        const hit = pickInPlan(floor.rooms.map((r) => ({ id: r.id, poly: r.polygon })), raw, px * 12);
        return [
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
        {
          label: "Rename…",
          run: async () => {
            select({ room: room.id });
            const name = await askText("Room name:", room.name);
            if (name) updateRoom(variant, floor.id, room.id, { name });
          },
        },
        { label: "Decorate this room", run: () => { select({ room: room.id }); setMode("decorate"); } },
        ...(onEdge
          ? [
              { label: "Add door here", run: () => placeOpeningAt("door", onEdge) } satisfies MenuItem,
              { label: "Add window here", run: () => placeOpeningAt("window", onEdge) } satisfies MenuItem,
            ]
          : []),
        ...(neighbours.length
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

  const selected = floor.rooms.find((r) => r.id === selectedRoomId);
  const selectedCanopyPoly = selectedCanopy !== null ? canopies[selectedCanopy] : undefined;
  const selectedOpening = floor.openings.find((o) => o.id === selectedOpeningId);
  const selectedWall = (floor.walls ?? []).find((w) => w.id === selectedWallId);
  const selectedFixture = (floor.fixtures ?? []).find((x) => x.id === selectedFixtureId);
  const selectedFixtureItem = selectedFixture ? byId(selectedFixture.type) : undefined;
  // Draw the selected room last so its outline and drag handles sit above its neighbours.
  const orderedRooms = [...floor.rooms.filter((r) => r.id !== selectedRoomId), ...(selected ? [selected] : [])];
  const pick = (t: Tool) => {
    setTool(t);
    setCalib([]);
    setDraft([]);
    setMeasure([]);
    setEdgeEdit(null);
    if (t !== "place") setPlacing(null);
  };
  // A mode change drops the tool in hand and any selection the new mode cannot hold.
  const prevMode = useRef(mode);
  useEffect(() => {
    if (prevMode.current === mode) return;
    prevMode.current = mode;
    drag.current = null;
    pick("select");
    setPlacing(null);
    setAddOpen(false);
    const keep = pruneSelection(mode, {
      room: selectedRoomId ?? undefined,
      opening: selectedOpeningId ?? undefined,
      wall: selectedWallId ?? undefined,
      fixture: selectedFixtureId ?? undefined,
      canopy: selectedCanopy ?? undefined,
    });
    select(keep);
    if (mode === "decorate" && selectedEdge) setUi({ selectedEdge });
  }, [mode]);
  // A tool asked for from outside (Floor settings' "Calibrate from two points…"): on mount, or while the plan is open.
  const pickRef = useRef(pick);
  pickRef.current = pick;
  useEffect(() => {
    const take = () => {
      const t = takePendingTool();
      if (t) pickRef.current(t);
    };
    take();
    window.addEventListener(PLAN_TOOL_EVENT, take);
    return () => window.removeEventListener(PLAN_TOOL_EVENT, take);
  }, []);
  // Peeking at the other layout: drop any press in progress, and close the menu.
  useEffect(() => {
    if (!peeking) return;
    drag.current = null;
    pointers.current.clear();
    setMenu(null);
    setHover(null);
  }, [peeking]);
  // The image options popover closes on an outside click or Esc.
  const imagePop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!imageOpen) return;
    const away = (e: PointerEvent) => {
      if (!imagePop.current?.parentElement?.contains(e.target as Node)) setImageOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setImageOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [imageOpen]);
  // Leaving the plan must not leave a room lit in 3D.
  useEffect(() => () => setUi({ hoveredRoomId: null }), []);
  const startPlacing = (item: CatalogueItem) => {
    setPlacing({ item, rot: placing?.rot ?? 0 });
    setTool("place");
    setCalib([]);
    setDraft([]);
    setMeasure([]);
  };
  // Build and Decorate light the edge the panel is hovering; Decorate also keeps the picked wall lit.
  const litShown = litEdge ?? (decorate && selectedEdge ? selectedEdge.edge : null);
  const editRoom = edgeEdit && floor.rooms.find((r) => r.id === edgeEdit.roomId);
  const vb = cam && size ? viewBoxOf(cam, size) : { x: 0, y: 0, w: floor.imageW, h: floor.imageH };
  const measureEnd = measure.length === 1 ? hover : measure[1];
  // Where the item being placed would land: snapped to a wall like a drag, unless Alt is held.
  const ghost =
    tool === "place" && placing && hover
      ? snapFixture(hover, { ...placing.item, z0: placing.item.mount ?? 0 }, placing.rot, altHeld) ?? { ...hover, rot: placing.rot }
      : null;
  const halo = { paintOrder: "stroke" as const, stroke: "#fff", strokeWidth: px * 3, strokeLinejoin: "round" as const };

  const imgOpacity = Math.min(1, Math.max(0.1, planImage.opacity));

  // ---- The tool rail: only the tools the mode offers, grouped, with the image controls last.
  const has = (t: Tool) => PLAN_TOOLS[mode].includes(t);
  const toolItems = (list: [Tool, IconName][]): RailItem[] =>
    list.filter(([t]) => has(t)).map(([t, icon]) => ({ id: t, icon, label: TOOL_LABEL[t], shortcut: TOOL_KEY[t], active: tool === t, onClick: () => pick(t) }));
  const railGroups: RailItem[][] = [
    furnish
      ? [
          {
            id: "add",
            icon: "plus",
            label: "Add furniture",
            shortcut: "A",
            active: addOpen,
            onClick: () => setAddOpen(!addOpen),
            extra: <AddPopover activeId={placing?.item.id} onPick={startPlacing} open={addOpen} onOpenChange={setAddOpen} />,
          },
          ...(clipboard
            ? [{ id: "paste", icon: "paste" as const, label: `Paste ${byId(clipboard.type)?.name ?? "item"}`, shortcut: "Ctrl V", onClick: () => pasteFixture() }]
            : []),
        ]
      : [],
    toolItems([["select", "select"]]),
    toolItems([["rect", "rect"], ["room", "polygon"], ["wall", "wall"], ["canopy", "canopy"]]),
    toolItems([["door", "door"], ["window", "window"], ["gap", "gap"]]),
    toolItems([["measure", "measure"]]),
    [
      {
        id: "image",
        icon: "image",
        label: planImage.show ? "Hide floorplan image" : "Show floorplan image",
        shortcut: "I",
        toggle: true,
        active: planImage.show,
        onClick: toggleImage,
        extra: (
          <>
            <button type="button" className="rail-chev" aria-label="Image and wall options" aria-expanded={imageOpen} title="Image and wall options" onClick={() => setImageOpen(!imageOpen)}>
              <Icon name="chevronRight" size={10} />
            </button>
            {imageOpen && (
              <div className="rail-pop popover" ref={imagePop}>
                <label className="rail-opacity">
                  <span>Image opacity</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={Math.round(imgOpacity * 100)}
                    aria-label="Floorplan image opacity"
                    onChange={(e) => setUi({ planImage: { show: true, opacity: Number(e.target.value) / 100 } })}
                  />
                  <span className="num">{Math.round(imgOpacity * 100)}%</span>
                </label>
                <label className="rail-check" title="Draw the walls at their real thickness, so furniture can be placed against the true wall faces">
                  <input type="checkbox" checked={wallsOn} onChange={() => setUi({ planWalls: !wallsOn })} /> Walls at real thickness
                </label>
              </div>
            )}
          </>
        ),
      },
    ],
  ];

  /** What the status line says while a drawing tool is in hand. */
  const statusText = (() => {
    switch (tool) {
      case "canopy":
        return draft.length ? "Click the opposite corner of the canopy." : "Click one corner of the porch canopy, then the opposite corner. Corners snap to walls and rooms.";
      case "rect":
        return draft.length ? "Click the opposite corner." : "Click one corner of the room, then the opposite corner. Corners snap to existing ones.";
      case "room":
        return "Click each corner in order, then click the first corner again (or Finish room). Esc cancels.";
      case "door":
        return "Click on a wall to place a door.";
      case "window":
        return "Click on a wall to place a window.";
      case "gap":
        return "Click on a wall to knock a full-height opening through it.";
      case "wall":
        return draft.length ? "Click the other end of the wall." : "Click where the wall starts, then where it ends. Ends snap to corners.";
      case "measure":
        return measure.length === 1 ? "Click the second point." : "Click two points to measure between them; they snap to corners. Esc clears.";
      case "calibrate":
        return `Click two points a known distance apart (${calib.length}/2).`;
      case "place":
        return placing ? `Click to place ${placing.item.name}; it snaps to walls (Alt places freely). R turns 90°, Shift+R 15°, Esc finishes.` : null;
      default:
        return null;
    }
  })();
  const selectHint =
    mode === "build"
      ? "Click a room, canopy, opening or wall to edit it. Drag corners; drag the background or swipe with two fingers to pan, pinch or use the mouse wheel to zoom. Arrows nudge (Shift ×10). Shift+click a neighbouring room to knock through. Right-click for actions."
      : mode === "decorate"
        ? "Click a floor, or a wall near its edge, to decorate it. Drag the background or swipe with two fingers to pan; pinch or use the mouse wheel to zoom. Right-click for actions."
        : mode === "furnish"
          ? "Click an item to edit it; drag to move. Arrows nudge (Shift ×10) · R turns 90°, Shift+R 15° · Ctrl/⌘C, V copy and paste · Ctrl/⌘D duplicates · Delete removes. Right-click for actions."
          : "Drag the background or swipe with two fingers to pan; pinch or use the mouse wheel to zoom. Use Measure to check a distance.";
  const hovered = hoveredRoomId && hoveredRoomId !== selectedRoomId ? floor.rooms.find((r) => r.id === hoveredRoomId) : undefined;

  return (
    <div className="plan-editor">
      <div className="plan-canvas" ref={wrapRef}>
          <svg
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            onPointerDownCapture={onPointerDownCapture}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onPointerLeave={(e) => {
              endPointer(e);
              setHover(null);
            }}
            onClick={onClickCanvas}
            onContextMenu={onContextMenu}
            className={`tool-${tool}${peeking ? " peeking" : ""}`}
          >
            {planImage.show && <image href={floor.image} x={0} y={0} width={floor.imageW} height={floor.imageH} opacity={imgOpacity} />}
            <defs>
              <pattern id="canopy-hatch" patternUnits="userSpaceOnUse" width={px * 8} height={px * 8} patternTransform="rotate(45)">
                <rect width={px * 8} height={px * 8} fill="#67e8f9" fillOpacity={0.16} />
                <line x1={0} y1={0} x2={0} y2={px * 8} stroke="#0e7490" strokeOpacity={0.55} strokeWidth={px * 1.2} />
              </pattern>
            </defs>
            {canopies.map((c, i) => {
              const sel = i === selectedCanopy;
              return (
                <polygon
                  key={"c" + i}
                  points={c.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="url(#canopy-hatch)"
                  stroke={sel ? "#d97706" : "#0e7490"}
                  strokeWidth={stroke * (sel ? 2.2 : 1.5)}
                  strokeDasharray={`${px * 7} ${px * 4}`}
                  strokeLinejoin="round"
                  className="plan-canopy"
                  onPointerDown={(e) => {
                    // Only the selected canopy drags, so a swipe over an unselected one still pans the plan.
                    if (!build || tool !== "select" || !sel) return;
                    startDrag(e, { kind: "canopy", idx: i, p0: toImage(e), x0: e.clientX, y0: e.clientY, list0: canopies, moved: false });
                  }}
                >
                  <title>Porch canopy. Click to edit; drag the selected one to move it.</title>
                </polygon>
              );
            })}
            {floor.rooms.length === 0 && tool === "select" && build && (
              <text x={vb.x + vb.w / 2} y={vb.y + vb.h * 0.08} fontSize={fontSize * 1.2} textAnchor="middle" fill="#2563eb" fontWeight={600} {...halo}>
                No rooms yet. Pick "Rectangle room" and click two opposite corners of each room.
              </text>
            )}
            {orderedRooms.map((r) => (
              <polygon
                key={r.id}
                points={r.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={roomColor(r)}
                fillOpacity={r.id === selectedRoomId ? 0.7 : 0.42}
                stroke={wallsOn ? "none" : r.id === selectedRoomId ? "#d97706" : "#1f2937"}
                strokeWidth={stroke * (r.id === selectedRoomId ? 2.2 : 1.2)}
                strokeLinejoin="round"
                onPointerEnter={() => {
                  if (!drag.current) setUi({ hoveredRoomId: r.id });
                }}
                onPointerLeave={() => {
                  if (useStore.getState().hoveredRoomId === r.id) setUi({ hoveredRoomId: null });
                }}
              />
            ))}
            {wallsOn && (
              <g className="plan-walls" style={{ pointerEvents: "none" }}>
                {/* Outline pass then fill pass: the stroke only survives round the outside of the joined walls, not along the seams between them. */}
                {wallShapes.map((w, i) => (
                  <polygon key={"wo" + i} points={w.poly.map((p) => `${p.x},${p.y}`).join(" ")} fill={WALL_FILL} stroke={WALL_EDGE} strokeWidth={px * 3} strokeLinejoin="round" />
                ))}
                {wallShapes.map((w, i) => (
                  <polygon key={"wf" + i} points={w.poly.map((p) => `${p.x},${p.y}`).join(" ")} fill={WALL_FILL} />
                ))}
                {orderedRooms
                  .filter((r) => r.id === selectedRoomId)
                  .map((r) => (
                    <polygon key={"rs" + r.id} points={r.polygon.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#d97706" strokeWidth={stroke * 2.2} strokeLinejoin="round" />
                  ))}
              </g>
            )}
            {hovered && (
              <polygon
                className="plan-hover-room"
                points={hovered.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
                fillOpacity={0.08}
                strokeWidth={px * 2}
                strokeLinejoin="round"
                style={{ pointerEvents: "none", fill: "var(--hover-room, #0f6e66)", stroke: "var(--hover-room, #0f6e66)" }}
              />
            )}
            {canopies.map((c, i) => (
              <CanopyLabel key={"cl" + i} poly={c} ppm={ppm} px={px} fontSize={fontSize} />
            ))}
            {orderedRooms.map((r) => (
              <RoomLabel key={"l" + r.id} room={r} ppm={ppm} px={px} fontSize={fontSize} />
            ))}

            {drawOrder.map((fx) => {
              const item = byId(fx.type);
              if (!item) return null;
              const b = fixtureBox(fx, item);
              return (
                <g
                  key={fx.id}
                  transform={`translate(${fx.x} ${fx.y}) rotate(${fx.rot})`}
                  className="plan-fixture"
                  style={furnish ? undefined : { pointerEvents: "none", opacity: 0.55 }}
                  onPointerDown={(e) => {
                    if (!furnish || tool !== "select") return;
                    const wasSelected = fx.id === selectedFixtureId;
                    select({ fixture: fx.id });
                    const p = toImage(e);
                    startDrag(e, { kind: "fixture", fixtureId: fx.id, dx: fx.x - p.x, dy: fx.y - p.y, x0: e.clientX, y0: e.clientY, moved: false, wasSelected });
                  }}
                  onClick={(e) => {
                    if (furnish && tool === "select") e.stopPropagation();
                  }}
                  onDoubleClick={(e) => {
                    if (!furnish) return;
                    e.stopPropagation();
                    patchFixture(fx.id, { rot: turn(fx.rot, 90) });
                  }}
                >
                  <FixtureSymbol
                    item={item}
                    w={b.w * ppm}
                    d={b.d * ppm}
                    m={ppm}
                    stroke={stroke}
                    color={fx.color}
                    selected={fx.id === selectedFixtureId}
                    clash={clashes.has(fx.id)}
                  />
                  <title>
                    {fx.label ?? item.name} ({b.w.toFixed(2)} × {b.d.toFixed(2)} m)
                  </title>
                </g>
              );
            })}
            {(floor.fixtures ?? []).map(
              (fx) =>
                fx.label && (
                  <text key={"t" + fx.id} x={fx.x} y={fx.y} dy="0.35em" fontSize={fontSize * 0.85} textAnchor="middle" fill="#111" className="plan-text" {...halo}>
                    {fx.label}
                  </text>
                ),
            )}
            {ghost && placing && (
              <g transform={`translate(${ghost.x} ${ghost.y}) rotate(${ghost.rot})`} style={{ pointerEvents: "none" }}>
                <FixtureSymbol item={placing.item} w={placing.item.w * ppm} d={placing.item.d * ppm} m={ppm} stroke={stroke} ghost />
              </g>
            )}

            {(floor.walls ?? []).map((w) => {
              const sel = w.id === selectedWallId;
              return (
                <g key={w.id}>
                  {(!wallsOn || sel) && (
                    <line
                      x1={w.a.x}
                      y1={w.a.y}
                      x2={w.b.x}
                      y2={w.b.y}
                      stroke={sel ? "#d97706" : w.color ?? "#1f2937"}
                      strokeOpacity={wallsOn ? 0.6 : 1}
                      strokeWidth={Math.max(WALL_T * ppm, stroke * 3)}
                      strokeLinecap={wallsOn ? "butt" : "round"}
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  <line
                    x1={w.a.x}
                    y1={w.a.y}
                    x2={w.b.x}
                    y2={w.b.y}
                    stroke="transparent"
                    strokeWidth={handleR * 2}
                    className="plan-hit"
                    style={build || decorate ? undefined : { pointerEvents: "none" }}
                    onPointerDown={(e) => {
                      if (tool !== "select") return;
                      e.stopPropagation();
                      select({ wall: w.id });
                    }}
                    onClick={(e) => tool === "select" && e.stopPropagation()}
                  >
                    <title>Wall{w.height !== undefined ? ` (${w.height} m high)` : ""}. Click to edit, drag the ends to move.</title>
                  </line>
                  {tool === "select" && build &&
                    (["a", "b"] as const).map((end) => (
                      <Handle
                        key={end}
                        at={w[end]}
                        r={sel ? handleR : dotR}
                        hit={sel ? hitR : hitSmall}
                        fill="#fff"
                        ink={sel ? "#d97706" : "#6b7280"}
                        sw={stroke * 1.5}
                        onPointerDown={(e) => {
                          select({ wall: w.id });
                          startDrag(e, { kind: "wallEnd", wallId: w.id, end });
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ))}
                </g>
              );
            })}
            {tool === "wall" && draft.length === 1 && hover && (
              <line x1={draft[0].x} y1={draft[0].y} x2={hover.x} y2={hover.y} stroke="#16a34a" strokeWidth={stroke * 3} strokeLinecap="round" style={{ pointerEvents: "none" }} />
            )}
            {floor.stairs && <StairsMarker floor={floor} stroke={stroke} handleR={handleR} interactive={build && tool === "select"} onPointerDown={(e) => startDrag(e, { kind: "stairs" })} />}

            {floor.openings.map((o) => {
              const len = o.widthM * ppm;
              const outside = outsideSide(o, floor.rooms, 0.3 * ppm);
              const t = (outside ? EXT_WALL_T : WALL_T) * ppm;
              const sel = o.id === selectedOpeningId;
              const hitT = Math.max(t * 1.5, px * 14);
              return (
                <g key={o.id} transform={`translate(${o.x} ${o.y}) rotate(${o.orientation === "v" ? 90 : 0})`}>
                  <OpeningSymbol opening={o} len={len} t={t} m={ppm} px={px} outside={outside} selected={sel} />
                  <rect
                    x={-len / 2}
                    y={-hitT / 2}
                    width={len}
                    height={hitT}
                    fill={sel ? "#d97706" : "transparent"}
                    fillOpacity={sel ? 0.18 : 0}
                    className="plan-hit plan-opening"
                    style={build ? undefined : { pointerEvents: "none" }}
                    onPointerDown={(e) => {
                      if (tool !== "select") return;
                      select({ opening: o.id });
                      startDrag(e, { kind: "opening", openingId: o.id });
                    }}
                    onClick={(e) => {
                      // Other tools (measure, place, draw) click straight through to the plan.
                      if (tool !== "select") return;
                      e.stopPropagation();
                      select({ opening: o.id });
                    }}
                  >
                    <title>
                      {o.kind} ({o.widthM} m). Drag along the wall, click to edit.
                    </title>
                  </rect>
                </g>
              );
            })}

            {build && tool === "select" &&
              orderedRooms.map((r) => {
                const sel = r.id === selectedRoomId;
                return (
                  <g key={"h" + r.id}>
                    {sel &&
                      r.polygon.map((p, i) => {
                        const q = r.polygon[(i + 1) % r.polygon.length];
                        return (
                          <Handle
                            key={"m" + i}
                            at={{ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }}
                            r={handleR * 0.6}
                            hit={hitSmall}
                            fill="#fff"
                            ink="#d97706"
                            sw={stroke}
                            className="plan-handle add"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateRoom(variant, floor.id, r.id, insertCorner(r, i, { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }));
                            }}
                          >
                            <title>Add a corner here</title>
                          </Handle>
                        );
                      })}
                    {r.polygon.map((p, i) => (
                      <Handle
                        key={i}
                        at={p}
                        r={sel ? handleR : dotR}
                        hit={sel ? hitR : hitSmall}
                        fill={sel ? "#fff7ed" : "#fff"}
                        ink={sel ? "#d97706" : "#2563eb"}
                        sw={stroke * (sel ? 2 : 1.3)}
                        onPointerDown={(e) => {
                          select({ room: r.id });
                          setActiveCorner({ roomId: r.id, idx: i });
                          startDrag(e, { kind: "corner", roomId: r.id, idx: i });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (r.polygon.length > 3) updateRoom(variant, floor.id, r.id, removeCorner(r, i));
                        }}
                      >
                        <title>Drag to move; double-click to remove the corner</title>
                      </Handle>
                    ))}
                  </g>
                );
              })}
            {build && tool === "select" &&
              selectedCanopyPoly?.map((p, i) => (
                <Handle
                  key={"ch" + i}
                  at={p}
                  r={handleR}
                  hit={hitR}
                  fill="#fff7ed"
                  ink="#d97706"
                  sw={stroke * 2}
                  onPointerDown={(e) => startDrag(e, { kind: "canopyCorner", idx: i })}
                  onClick={(e) => e.stopPropagation()}
                >
                  <title>Drag to resize the canopy</title>
                </Handle>
              ))}
            {selected && litShown !== null && litShown < selected.polygon.length && <LitEdge room={selected} idx={litShown} px={px} fontSize={fontSize} />}
            {selected && build && tool === "select" && (
              <EdgeLabels room={selected} ppm={ppm} px={px} fontSize={fontSize} editing={edgeEdit?.roomId === selected.id ? edgeEdit.idx : null} onEdit={(idx) => setEdgeEdit({ roomId: selected.id, idx })} />
            )}

            {measure.length > 0 && measureEnd && <MeasureLine a={measure[0]} b={measureEnd} ppm={ppm} px={px} fontSize={fontSize} />}
            {measure.length > 0 && <circle cx={measure[0].x} cy={measure[0].y} r={px * 4} fill="#7c3aed" style={{ pointerEvents: "none" }} />}
            {calib.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={handleR} fill="#ef4444" />
            ))}
            {(tool === "rect" || tool === "canopy") && draft.length === 1 && hover && (
              <rect
                x={Math.min(draft[0].x, hover.x)}
                y={Math.min(draft[0].y, hover.y)}
                width={Math.abs(hover.x - draft[0].x)}
                height={Math.abs(hover.y - draft[0].y)}
                fill="#16a34a"
                fillOpacity={0.2}
                stroke="#16a34a"
                strokeWidth={stroke * 2}
                style={{ pointerEvents: "none" }}
              />
            )}
            {tool === "room" && draft.length > 0 && (
              <polyline
                points={[...draft, ...(hover ? [hover] : [])].map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#16a34a"
                strokeWidth={stroke * 2}
                style={{ pointerEvents: "none" }}
              />
            )}
            {(tool === "rect" || tool === "canopy" || tool === "room" || tool === "wall" || tool === "measure") && hover && (
              <circle cx={hover.x} cy={hover.y} r={px * 4} fill={tool === "measure" ? "#7c3aed" : "#16a34a"} style={{ pointerEvents: "none" }} />
            )}
          </svg>

          {editRoom && edgeEdit && cam && size && (
            <EdgeLengthInput
              key={`${editRoom.id}/${edgeEdit.idx}`}
              room={editRoom}
              idx={edgeEdit.idx}
              ppm={ppm}
              toScreen={toScreen}
              px={px}
              bounds={size}
              onCommit={(m) => updateRoom(variant, floor.id, editRoom.id, { polygon: setEdgeLength(editRoom.polygon, edgeEdit.idx, m * ppm) })}
              onClose={() => setEdgeEdit(null)}
            />
          )}

        </div>

        {mode !== "review" && (
          <InspectorCard className="side">
            {furnish ? (
              selectedFixture && selectedFixtureItem ? (
                <FixtureInspector
                  fixture={selectedFixture}
                  item={selectedFixtureItem}
                  clash={clashes.has(selectedFixture.id)}
                  onChange={(p) => patchFixture(selectedFixture.id, p)}
                  onDuplicate={() => duplicateFixture(selectedFixture.id)}
                  onCopy={() => copyFixture(selectedFixture.id)}
                  onPaste={clipboard ? pasteFixture : undefined}
                  onRemove={removeSelected}
                />
              ) : (
                <FurnishSummary floor={floor} clashes={clashes.size} onAdd={() => setAddOpen(true)} onPaste={clipboard ? pasteFixture : undefined} />
              )
            ) : decorate ? (
              selected ? (
                <DecoratePanel key={selected.id} variant={variant} floor={floor} room={selected} edge={selectedEdge} onChange={(p) => updateRoom(variant, floor.id, selected.id, p)} onHighlightEdge={setLitEdge} />
              ) : selectedWall ? (
                <WallInspector
                  mode="decorate"
                  wall={selectedWall}
                  onChange={(p) => updateFloor(variant, floor.id, (f) => ({ ...f, walls: (f.walls ?? []).map((w) => (w.id === selectedWall.id ? { ...w, ...p } : w)) }))}
                  onDelete={removeSelected}
                />
              ) : (
                <DecorateSummary floor={floor} />
              )
            ) : selected ? (
              <BuildRoomPanel
                key={selected.id}
                variant={variant}
                floor={floor}
                room={selected}
                onChange={(p) => updateRoom(variant, floor.id, selected.id, p)}
                onHighlightEdge={setLitEdge}
              />
            ) : selectedCanopyPoly ? (
              <CanopyInspector
                key={selectedCanopy}
                poly={selectedCanopyPoly}
                ppm={ppm}
                onResize={(w, h, fixed) => setCanopies((all) => resizeCanopy(all, selectedCanopy!, w, h, fixed))}
                onDelete={() => {
                  setCanopies((all) => removeCanopy(all, selectedCanopy!));
                  setSelectedCanopy(null);
                }}
              />
            ) : selectedOpening ? (
              <OpeningInspector
                opening={selectedOpening}
                pair={selectedOpening.kind === "door" && selectedOpening.widthM > DOUBLE_DOOR_M && outsideSide(selectedOpening, floor.rooms, 0.3 * ppm) === 0}
                onChange={(p) => updateFloor(variant, floor.id, (f) => ({ ...f, openings: f.openings.map((o) => (o.id === selectedOpening.id ? { ...o, ...p } : o)) }))}
                onDelete={removeSelected}
              />
            ) : selectedWall ? (
              <WallInspector
                mode="build"
                wall={selectedWall}
                onChange={(p) => updateFloor(variant, floor.id, (f) => ({ ...f, walls: (f.walls ?? []).map((w) => (w.id === selectedWall.id ? { ...w, ...p } : w)) }))}
                onDelete={removeSelected}
              />
            ) : (
              <>
                <BuildSummary variant={variant} floor={floor} />
                <p className="hint-row muted small">
                  Nothing selected
                  <Info>Select a room to check its size and finishes, a porch canopy, an opening to change its type and size, or a wall.</Info>
                </p>
              </>
            )}
          </InspectorCard>
        )}

      {!peeking && <ToolRail groups={railGroups} footer={<Info label="How this works">{selectHint}</Info>} />}

      <div className="plan-zoom float-card" role="group" aria-label="Zoom">
        <button type="button" className="icon-btn" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in (+)" title="Zoom in (+)">
          <Icon name="zoomIn" size={20} />
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out (−)" title="Zoom out (−)">
          <Icon name="zoomOut" size={20} />
        </button>
        <button type="button" className="icon-btn" onClick={() => fit()} aria-label="Fit the rooms (F)" title="Fit the rooms (F)">
          <Icon name="fit" size={20} />
        </button>
        <button type="button" className="icon-btn" onClick={() => fit(imageRect)} aria-label="Show the whole floorplan image" title="Show the whole floorplan image">
          <Icon name="fitImage" size={20} />
        </button>
      </div>

      {!peeking && statusText && (
        <div className="plan-status float-card" role="status">
          <span>{statusText}</span>
          {tool === "room" && draft.length >= 3 && (
            <button type="button" className="primary" onClick={finishRoom}>
              Finish room
            </button>
          )}
        </div>
      )}

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}

/** A drag handle: a visible dot inside a larger transparent target that takes the pointer. */
function Handle({
  at,
  r,
  hit,
  fill,
  ink,
  sw,
  className = "plan-handle",
  children,
  ...events
}: {
  at: Pt;
  r: number;
  hit: number;
  fill: string;
  ink: string;
  sw: number;
  className?: string;
  children?: React.ReactNode;
} & Pick<React.SVGProps<SVGGElement>, "onPointerDown" | "onClick" | "onDoubleClick">) {
  return (
    <g className={className} {...events}>
      <circle cx={at.x} cy={at.y} r={hit} fill="transparent" />
      <circle cx={at.x} cy={at.y} r={r} fill={fill} stroke={ink} strokeWidth={sw} style={{ pointerEvents: "none" }} />
      {children}
    </g>
  );
}

/** Room name with its floor area underneath, sized in screen pixels; the area is dropped when the room is small on screen. */
function RoomLabel({ room, ppm, px, fontSize }: { room: Room; ppm: number; px: number; fontSize: number }) {
  const c = useMemo(() => polygonCentroid(room.polygon), [room.polygon]);
  const area = useMemo(() => areaM2(room.polygon, ppm), [room.polygon, ppm]);
  const b = bbox(room.polygon);
  const onScreen = Math.min(b.w, b.h) / px;
  if (onScreen < 28) return null;
  const halo = { paintOrder: "stroke" as const, stroke: "#fff", strokeWidth: px * 3, strokeLinejoin: "round" as const, strokeOpacity: 0.85 };
  return (
    <g className="plan-text">
      <text x={c.x} y={c.y} fontSize={fontSize} textAnchor="middle" fill="#111" fontWeight={600} {...halo}>
        {room.name}
      </text>
      {onScreen > 60 && (
        <text x={c.x} y={c.y + fontSize * 1.2} fontSize={fontSize * 0.82} textAnchor="middle" fill="#374151" {...halo}>
          {formatArea(area)}
        </text>
      )}
    </g>
  );
}

/** "Canopy" with its size, sized in screen pixels; the size is dropped when the canopy is small on screen. */
function CanopyLabel({ poly, ppm, px, fontSize }: { poly: Pt[]; ppm: number; px: number; fontSize: number }) {
  const c = polygonCentroid(poly);
  const b = bbox(poly);
  const onScreen = Math.min(b.w, b.h) / px;
  if (onScreen < 24) return null;
  const halo = { paintOrder: "stroke" as const, stroke: "#fff", strokeWidth: px * 3, strokeLinejoin: "round" as const, strokeOpacity: 0.85 };
  return (
    <g className="plan-text">
      <text x={c.x} y={c.y} fontSize={fontSize} textAnchor="middle" fill="#0e7490" fontWeight={600} {...halo}>
        Canopy
      </text>
      {onScreen > 50 && (
        <text x={c.x} y={c.y + fontSize * 1.2} fontSize={fontSize * 0.82} textAnchor="middle" fill="#155e75" {...halo}>
          {(b.w / ppm).toFixed(2)} × {(b.h / ppm).toFixed(2)} m
        </text>
      )}
    </g>
  );
}

/** Where an edge's length label sits: inside the room, just off the edge's midpoint. */
function edgeLabelAt(room: Room, i: number, px: number): { p: Pt; angle: number } {
  const a = room.polygon[i];
  const b = room.polygon[(i + 1) % room.polygon.length];
  const n = inwardNormals(room.polygon)[i];
  let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  return { p: { x: (a.x + b.x) / 2 + n.x * px * 16, y: (a.y + b.y) / 2 + n.y * px * 16 }, angle };
}

/** One of the room's walls picked out on the plan, numbered as in the inspector's list. */
function LitEdge({ room, idx, px, fontSize }: { room: Room; idx: number; px: number; fontSize: number }) {
  const a = room.polygon[idx];
  const b = room.polygon[(idx + 1) % room.polygon.length];
  const n = inwardNormals(room.polygon)[idx];
  // The number sits inside the room, clear of the edge's length label.
  const c = { x: (a.x + b.x) / 2 + n.x * px * 40, y: (a.y + b.y) / 2 + n.y * px * 40 };
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#db2777" strokeOpacity={0.45} strokeWidth={px * 12} strokeLinecap="round" />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#db2777" strokeWidth={px * 3} strokeLinecap="round" />
      <circle cx={c.x} cy={c.y} r={fontSize * 0.95} fill="#db2777" stroke="#fff" strokeWidth={px * 1.5} />
      <text x={c.x} y={c.y} dy="0.35em" fontSize={fontSize * 0.9} textAnchor="middle" fill="#fff" fontWeight={700}>
        {idx + 1}
      </text>
    </g>
  );
}

function EdgeLabels({ room, ppm, px, fontSize, editing, onEdit }: { room: Room; ppm: number; px: number; fontSize: number; editing: number | null; onEdit: (i: number) => void }) {
  const lens = edgeLengthsM(room.polygon, ppm);
  return (
    <g>
      {lens.map((len, i) => {
        if (i === editing || len * ppm < px * 30) return null;
        const { p, angle } = edgeLabelAt(room, i, px);
        const text = formatLength(len);
        const w = text.length * fontSize * 0.56 + px * 8;
        const h = fontSize * 1.35;
        return (
          <g
            key={i}
            transform={`translate(${p.x} ${p.y}) rotate(${angle})`}
            className="plan-edge-label"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(i);
            }}
          >
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill="#fff" stroke="#d97706" strokeWidth={px} />
            <text y={0} dy="0.35em" fontSize={fontSize * 0.85} textAnchor="middle" fill="#92400e" fontWeight={600}>
              {text}
            </text>
            <title>Click to type a new length; the edge's end corner moves</title>
          </g>
        );
      })}
    </g>
  );
}

/** A small field over the plan for typing an edge's new length. */
function EdgeLengthInput({
  room,
  idx,
  ppm,
  px,
  toScreen,
  bounds,
  onCommit,
  onClose,
}: {
  room: Room;
  idx: number;
  ppm: number;
  px: number;
  toScreen: (p: Pt) => Pt;
  bounds: Size;
  onCommit: (m: number) => void;
  onClose: () => void;
}) {
  // Pinned where it opened (the label moves as the length changes, the field should not), and kept on screen.
  const [s] = useState(() => {
    const p = toScreen(edgeLabelAt(room, idx, px).p);
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(Math.max(lo, hi), v));
    return { x: clamp(p.x, 72, bounds.w - 72), y: clamp(p.y, 24, bounds.h - 24) };
  });
  const len = edgeLengthsM(room.polygon, ppm)[idx];
  return (
    <div className="edge-input" style={{ left: s.x, top: s.y }} onBlur={onClose}>
      <NumberField value={len} label="Edge length in metres" autoFocus onCommit={onCommit} onDone={onClose} />
      <span>m</span>
    </div>
  );
}

function MeasureLine({ a, b, ppm, px, fontSize }: { a: Pt; b: Pt; ppm: number; px: number; fontSize: number }) {
  const len = dist(a, b);
  if (len < px) return null;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const tick = px * 7;
  let angle = (Math.atan2(uy, ux) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  const text = formatLength(len / ppm);
  const w = text.length * fontSize * 0.6 + px * 10;
  const h = fontSize * 1.5;
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#7c3aed" strokeWidth={px * 2} />
      {[a, b].map((p, i) => (
        <line key={i} x1={p.x - uy * tick} y1={p.y + ux * tick} x2={p.x + uy * tick} y2={p.y - ux * tick} stroke="#7c3aed" strokeWidth={px * 2} />
      ))}
      <g transform={`translate(${(a.x + b.x) / 2 - uy * px * 16} ${(a.y + b.y) / 2 + ux * px * 16}) rotate(${angle})`}>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={px * 4} fill="#7c3aed" />
        <text dy="0.35em" fontSize={fontSize} textAnchor="middle" fill="#fff" fontWeight={600}>
          {text}
        </text>
      </g>
    </g>
  );
}

function StairsMarker({
  floor,
  stroke,
  handleR,
  interactive,
  onPointerDown,
}: {
  floor: Floor;
  stroke: number;
  handleR: number;
  interactive: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const s = floor.stairs!;
  const len = (floor.stairsLen ?? 2.6) * floor.pxPerM;
  const w = (floor.stairsWidth ?? 0.9) * floor.pxPerM;
  const d = floor.stairsDir ?? "up";
  const horiz = d === "left" || d === "right";
  const rw = horiz ? len : w;
  const rh = horiz ? w : len;
  const ax = d === "left" ? -1 : d === "right" ? 1 : 0;
  const ay = d === "up" ? -1 : d === "down" ? 1 : 0;
  const tip = { x: s.x + (ax * len) / 2, y: s.y + (ay * len) / 2 };
  const tail = { x: s.x - (ax * len) / 2, y: s.y - (ay * len) / 2 };
  // Winder lines at a turned foot or head, in image px.
  const side = (t?: "left" | "right") => (t === "left" ? -1 : t === "right" ? 1 : 0);
  const winders = flightWinders({
    centre: s,
    dir: STAIRS_VECTOR[d],
    run: len,
    width: w,
    turn: side(floor.stairsTurn),
    topTurn: side(floor.stairsTopTurn),
    topWinders: floor.stairsTopWinders,
  });
  return (
    <g className={interactive ? "plan-handle" : undefined} style={interactive ? undefined : { pointerEvents: "none" }} onPointerDown={onPointerDown} onClick={(e) => e.stopPropagation()}>
      <rect x={s.x - rw / 2} y={s.y - rh / 2} width={rw} height={rh} fill="#7c3aed" fillOpacity={0.2} stroke="#7c3aed" strokeWidth={stroke} />
      {winders.map((pts, i) => (
        <polyline key={i} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#7c3aed" strokeWidth={stroke * 0.7} />
      ))}
      <line x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y} stroke="#7c3aed" strokeWidth={stroke * 2} />
      <circle cx={tip.x} cy={tip.y} r={handleR * 0.7} fill="#7c3aed" />
      <title>Stairs (rise towards the dot). Drag to move; set direction and size in the floor panel.</title>
    </g>
  );
}
