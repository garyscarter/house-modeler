import { useEffect, useMemo, useRef, useState } from "react";
import { flightWinders, STAIRS_VECTOR } from "../lib/stairs";
import type { Fixture, Floor, JoineryConfig, Pt, Room, VariantKey } from "../types";
import { byId, isFloorCovering, mountOf, type CatalogueItem } from "../lib/catalogue";
import { FixtureSymbol } from "./FixtureSymbol";
import { OpeningSymbol } from "./OpeningSymbol";
import { LockGlyph } from "./LockGlyph";
import { BuildRoomPanel, CanopyInspector, FixtureInspector, MultiFixtureInspector, NumberField, OpeningInspector, WallInspector } from "./Inspectors";
import { AddPopover } from "./AddItem";
import { ToolRail, type RailItem } from "./ToolRail";
import { ContextMenu } from "../components/ContextMenu";
import { InspectorCard } from "../components/InspectorCard";
import { Info } from "../components/Info";
import { Icon, type IconName } from "../components/icons";
import { TOOL_KEY, TOOL_LABEL } from "../lib/shortcuts";
import { DecoratePanel } from "./DecoratePanel";
import { BuildSummary, DecorateSummary, FurnishSummary } from "./ModeSummaries";
import { usePanelPrefs } from "../components/panelPrefs";
import { PLAN_TOOLS, pruneSelection, type Tool } from "../lib/modes";
import { StairsSymbol } from "./StairsSymbol";
import { useStore } from "../store";
import { bbox, EXT_WALL_T, polygonCentroid, WALL_T } from "../lib/geometry";
import {
  areaM2,
  dist,
  edgeLengthsM,
  fixtureBox,
  fixtureSolids,
  formatArea,
  formatLength,
  inwardNormals,
  outsideSide,
  overlappingIds,
  setEdgeLength,
  snapToWall,
  wallLines,
  abutNeighbours,
  DOUBLE_DOOR_M,
  type Placement,
  type Seg,
  type Size,
  rectCorners,
  svgPoints,
  edgeChipCentre,
  viewBoxOf,
  imageClipRect,
  imageForState,
  imageStateOf,
  type ImageState,
} from "../lib/planMath";
import { roomColor } from "../lib/roomColor";
import { planWallLines, planWalls } from "../lib/planWalls";
import { defaultFit, fitProblem, fitRecess, fitWindow, floorFaces, refitFixture } from "../lib/recess";
import { resizeCanopy, removeCanopy } from "../lib/canopy";
import { useClipboardFixtures } from "../lib/clipboard";
import { exactGroup, expandToGroups, rotateFixtures, selectionBounds, ungroupFixtures } from "../lib/fixtureGroups";
import { wallClearances } from "../lib/planGuides";
import { ZOOM_STEP } from "../lib/editorCore";
import { EdgeHit, Handle, MidpointHandle, useCanvasCamera } from "./core";
import { usePlanSelection } from "./plan/useSelection";
import { usePlanTools } from "./plan/useTools";
import { usePlanDrag } from "./plan/useDrag";
import { usePlanKeys, IMAGE_STATES } from "./plan/useKeys";
import { usePlanMenu } from "./plan/useMenu";
import "./PlanEditor.css";

/** Real-thickness walls in the plan: near-black fill with a lighter edge so they read on the floorplan image and on white. */
const WALL_FILL = "#27272a";
const WALL_EDGE = "#a1a1aa";

const IMAGE_STATE_LABEL: Record<ImageState, string> = { off: "Off", faint: "Faint", trace: "Trace" };

/**
 * 2D check-and-fix view: the geometry drawn over the source image. Used to
 * correct the traced plan and to lay out furniture. Coordinates are image px; the camera only changes the view
 * box, and strokes, handles and text are sized in screen pixels. The camera, the pointer machine and the polygon
 * editing come from the shared editor core (./core); the plan's own state lives in ./plan/use*.
 */
export function PlanEditor({ variant, floor }: { variant: VariantKey; floor: Floor }) {
  const updateRoom = useStore((s) => s.updateRoom);
  const selectedRoomId = useStore((s) => s.selectedRoomId);
  const selectedEdge = useStore((s) => s.selectedEdge);
  const mode = useStore((s) => s.mode);
  const ceilingHeight = useStore((s) => s.variants[variant]?.ceilingHeight);
  const build = mode === "build";
  const decorate = mode === "decorate";
  const furnish = mode === "furnish";
  const setUi = useStore((s) => s.setUi);
  const planImage = useStore((s) => s.planImage);
  const wallsOn = useStore((s) => s.planWalls);
  const clipboard = useClipboardFixtures();
  const [addOpen, setAddOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const quiet = usePanelPrefs((s) => s.quiet);
  const peeking = useStore((s) => s.peek);
  const hoveredRoomId = useStore((s) => s.hoveredRoomId);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const ppm = floor.pxPerM;

  const roomsRect = useMemo(() => {
    const all = floor.rooms.flatMap((r) => r.polygon);
    return all.length >= 3 ? bbox(all) : { x0: 0, y0: 0, x1: floor.imageW, y1: floor.imageH };
  }, [floor.rooms, floor.imageW, floor.imageH]);
  const imageRect = { x0: 0, y0: 0, x1: floor.imageW, y1: floor.imageH };
  // Scale limits: from 1 m filling about 2000 screen px to the whole image at a third of the element.
  const camera = useCanvasCamera(wrapRef, {
    home: roomsRect,
    fitKey: floor.id,
    unitsPerM: ppm,
    limits: (s) => ({ minS: ppm / 2000, maxS: Math.max(floor.imageW / s.w, floor.imageH / s.h) * 3 }),
  });
  const { size, cam } = camera;

  // One screen pixel in image px: everything drawn is sized with it so it reads the same at any zoom.
  const px = camera.px;
  const stroke = px * 1.25;
  const handleR = px * 6;
  const fontSize = px * 13;
  const snapTol = px * 10;
  const vb = cam && size ? viewBoxOf(cam, size) : { x: 0, y: 0, w: floor.imageW, h: floor.imageH };

  const selection = usePlanSelection(variant, floor, () => (cam && size ? { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 } : { x: floor.imageW / 2, y: floor.imageH / 2 }));
  const {
    edgeEdit, setEdgeEdit, litEdge, setLitEdge, selectedOpeningId, selectedWallId, hoverGroup, setHoverGroup, selectedCanopy, roomHint,
    allFixtures, canopies, liveIds, selectedFixtureId, select, removeSelected, setFixtures, patchFixture, patchOpening, patchWall, setCanopies,
    duplicateFixtureIds, copyFixtureIds, pasteFixtures, groupSelected, anyLocked, lockFixtures,
  } = selection;
  const tools = usePlanTools(mode, floor, () => setEdgeEdit(null));
  const { tool, calib, draft, hover, altHeld, measure, placing, setPlacing, pick, startPlacing } = tools;

  // Only the geometry matters for these, so fixture drags and the like do not rebuild them.
  const { rooms: fRooms, walls: fWalls, openings: fOpenings, pxPerM: fPpm, origin: fOrigin, offset: fOffset } = floor;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lines = useMemo(() => wallLines(floor, WALL_T, EXT_WALL_T), [fRooms, fPpm]);
  const segs = useMemo(() => lines.map((l) => [l.a, l.b] as Seg), [lines]);
  // The walls as the 3D shell builds them, with real thickness: drawn as the wall layer and used to sit furniture flush on the faces.
  const wallShapes = useMemo(() => (wallsOn ? planWalls(floor) : []), [wallsOn, fRooms, fWalls, fOpenings, fPpm, fOrigin, fOffset]);
  const faceLines = useMemo(() => planWallLines(floor), [fRooms, fWalls, fPpm, fOrigin, fOffset]);
  const faces = useMemo(() => floorFaces(floor), [fRooms, fWalls, fOpenings, fPpm, fOrigin, fOffset]);
  const solids = useMemo(() => fixtureSolids(floor.fixtures ?? [], ppm, byId), [floor.fixtures, ppm]);
  const clashes = useMemo(() => overlappingIds(solids, 0.5), [solids]);
  // Fitted joinery that no longer fits its recess or window, with why.
  const misfits = useMemo(() => {
    const out = new Map<string, string>();
    for (const fx of floor.fixtures ?? []) {
      if (!fx.joinery?.fit) continue;
      const item = byId(fx.type);
      const why = item && fitProblem(floor, fx, item, faces);
      if (why) out.set(fx.id, why);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor.fixtures, faces]);
  /**
   * A built-in or window seat fitted to the recess or window under c (a placed unit takes the recess's width and depth);
   * null for other items, when Alt is held, or when nothing is in reach (a built-in then places like any unit).
   */
  const fitPlacing = (c: Pt, item: CatalogueItem, free: boolean): (Placement & { w: number; d?: number; h?: number; joinery?: JoineryConfig }) | null => {
    if (free) return null;
    if (item.symbol === "built-in") {
      const f = fitRecess(floor, c, { defaultW: item.w, defaultD: item.d }, faces);
      if (!f) return null;
      return { x: f.x, y: f.y, rot: f.rot, w: f.w, d: f.d, ...(f.sides >= 1 ? { joinery: { fit: "recess" as const } } : {}) };
    }
    if (item.symbol === "window-seat") {
      const f = fitWindow(floor, c, { defaultD: item.d, h: item.h }, faces);
      if (!f) return null;
      return { x: f.x, y: f.y, rot: f.rot, w: f.w, d: f.d, ...(f.h !== undefined ? { h: f.h } : {}), joinery: { fit: "window" as const } };
    }
    return null;
  };
  /** Put a fitted unit back in its recess (or at its window), undoably. */
  const refit = (fx: Fixture) => {
    const item = byId(fx.type);
    const p = item && refitFixture(floor, fx, item, faces);
    if (p) patchFixture(fx.id, p);
  };
  // Rugs draw under everything, and wall-hung and worktop items over the units below them, whatever order they were placed in.
  const mountedAt = (fx: Fixture) => { const it = byId(fx.type); return !it ? 0 : isFloorCovering(it) ? -1 : mountOf(fx, it); };
  const drawOrder = useMemo(() => [...(floor.fixtures ?? [])].sort((a, b) => mountedAt(a) - mountedAt(b)), [floor.fixtures]);
  const hitShapes = useMemo(
    () =>
      drawOrder.flatMap((fx) => {
        const item = byId(fx.type);
        if (!item) return [];
        const b = fixtureBox(fx, item);
        return [{ id: fx.id, corners: rectCorners(fx, b.w * ppm, b.d * ppm, fx.rot) }];
      }),
    [drawOrder, ppm],
  );
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
  const toScreen = (p: Pt): Pt => ({ x: (p.x - (cam?.x ?? 0)) / px, y: (p.y - (cam?.y ?? 0)) / px });

  /** Snap to room corners and wall ends, then to their x / y lines, so walls line up. */
  const snapTargets = useMemo(() => [...floor.rooms.flatMap((r) => r.polygon), ...(floor.walls ?? []).flatMap((w) => [w.a, w.b])], [floor.rooms, floor.walls]);

  const drag = usePlanDrag({
    variant, floor, mode, peeking, svgRef, camera, sel: selection, tools,
    geo: { segs, snapTargets, corners, hitShapes, faceLines, fitPlacing, snapFixture },
    selectedRoomId,
  });
  const { guides, marquee, hoverRoom, unhoverRoom, addRoom, placeOpeningAt } = drag;
  usePlanKeys({ variant, floor, mode, segs, camera, sel: selection, tools, selectedRoomId, setAddOpen });

  const finishRoom = () => {
    if (draft.length >= 3) addRoom(draft);
    tools.setDraft([]);
  };

  const pasteLabel = clipboard.length > 1 ? `Paste ${clipboard.length} items` : `Paste ${byId(clipboard[0]?.type ?? "")?.name ?? "item"}`;
  const { menu, setMenu, onContextMenu } = usePlanMenu({
    variant, floor, mode, peeking, camera, drag, sel: selection, tools, hitShapes,
    clipboardCount: clipboard.length, pasteLabel, placeOpeningAt, refit,
  });

  const selected = floor.rooms.find((r) => r.id === selectedRoomId);
  const selectedCanopyPoly = selectedCanopy !== null ? canopies[selectedCanopy] : undefined;
  const selectedOpening = floor.openings.find((o) => o.id === selectedOpeningId);
  const selectedWall = (floor.walls ?? []).find((w) => w.id === selectedWallId);
  const selectedFixture = (floor.fixtures ?? []).find((x) => x.id === selectedFixtureId);
  /** Dashed box around a multi-item or group selection, and around the group under the pointer. */
  const selBox = useMemo(() => {
    const grouped = liveIds.length === 1 && allFixtures.find((x) => x.id === liveIds[0])?.groupId;
    return liveIds.length >= 2 || grouped ? selectionBounds(allFixtures, liveIds, ppm) : null;
  }, [allFixtures, liveIds, ppm]);
  /** Gaps from the selected furniture (or the box around several) to the walls on each side. */
  const clearances = useMemo(() => {
    if (!furnish || tool !== "select" || !liveIds.length) return [];
    const maxPx = 6 * ppm;
    if (liveIds.length === 1) {
      const fx = allFixtures.find((x) => x.id === liveIds[0]);
      const item = fx && byId(fx.type);
      if (!fx || !item) return [];
      const b = fixtureBox(fx, item);
      return wallClearances({ c: fx, w: b.w * ppm, d: b.d * ppm, rot: fx.rot }, faceLines, maxPx);
    }
    const sel = selectionBounds(allFixtures, liveIds, ppm);
    if (!sel) return [];
    return wallClearances({ c: { x: (sel.x0 + sel.x1) / 2, y: (sel.y0 + sel.y1) / 2 }, w: sel.x1 - sel.x0, d: sel.y1 - sel.y0, rot: 0 }, faceLines, maxPx);
  }, [furnish, tool, liveIds, allFixtures, faceLines, ppm]);
  const hoverBox = useMemo(() => {
    if (!hoverGroup || drag.drag.active()) return null;
    const members = allFixtures.filter((x) => x.groupId === hoverGroup).map((x) => x.id);
    return members.length && !members.every((id) => liveIds.includes(id)) ? selectionBounds(allFixtures, members, ppm) : null;
  }, [hoverGroup, allFixtures, liveIds, ppm]);
  const selectedFixtureItem = selectedFixture ? byId(selectedFixture.type) : undefined;
  // Draw the selected room last so its outline and drag handles sit above its neighbours.
  const orderedRooms = [...floor.rooms.filter((r) => r.id !== selectedRoomId), ...(selected ? [selected] : [])];

  // A mode change drops the tool in hand, any drag in progress and any selection the new mode cannot hold.
  const prevMode = useRef(mode);
  useEffect(() => {
    if (prevMode.current === mode) return;
    prevMode.current = mode;
    drag.drag.cancel();
    setHoverGroup(null);
    pick("select");
    setPlacing(null);
    setAddOpen(false);
    const keep = pruneSelection(mode, {
      room: selectedRoomId ?? undefined,
      opening: selectedOpeningId ?? undefined,
      wall: selectedWallId ?? undefined,
      fixtures: liveIds,
      canopy: selectedCanopy ?? undefined,
    });
    select(keep);
    if (mode === "decorate" && selectedEdge) setUi({ selectedEdge });
  }, [mode]);
  // Peeking at the other layout: drop any press in progress (the core ignores pointer input meanwhile).
  useEffect(() => {
    if (!peeking) return;
    drag.drag.cancel();
    setHoverGroup(null);
    tools.setHover(null);
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
  // Build and Decorate light the edge the panel is hovering; Decorate also keeps the picked wall lit.
  const litShown = litEdge ?? (decorate && selectedEdge ? selectedEdge.edge : null);
  const editRoom = edgeEdit && floor.rooms.find((r) => r.id === edgeEdit.roomId);
  const measureEnd = measure.length === 1 ? hover : measure[1];
  // Where the item being placed would land: snapped to a wall like a drag, unless Alt is held.
  const ghostFit = tool === "place" && placing && hover ? fitPlacing(hover, placing.item, altHeld) : null;
  const ghost =
    ghostFit ??
    (tool === "place" && placing && hover
      ? snapFixture(hover, { ...placing.item, z0: placing.item.mount ?? 0 }, placing.rot, altHeld) ?? { ...hover, rot: placing.rot }
      : null);
  const halo = { paintOrder: "stroke" as const, stroke: "#fff", strokeWidth: px * 3, strokeLinejoin: "round" as const };

  const imgOpacity = Math.min(1, Math.max(0.1, planImage.opacity));
  const imageState = imageStateOf(planImage);
  const setImageState = (st: ImageState) => setUi({ planImage: imageForState(st, planImage.opacity) });
  const cycleImage = () => setImageState(IMAGE_STATES[(IMAGE_STATES.indexOf(imageState) + 1) % IMAGE_STATES.length]);
  const clip = imageClipRect(roomsRect, ppm, { w: floor.imageW, h: floor.imageH });
  const neutralFills = quiet && (build || furnish);
  const showRoomLabels = !(planImage.show && imageState === "trace");
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
            extra: <AddPopover activeId={placing?.item.piece ?? placing?.item.id} onPick={startPlacing} open={addOpen} onOpenChange={setAddOpen} />,
          },
          ...(clipboard.length
            ? [{ id: "paste", icon: "paste" as const, label: pasteLabel, shortcut: "Ctrl V", onClick: () => pasteFixtures() }]
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
        label: `Floorplan image: ${IMAGE_STATE_LABEL[imageState]}`,
        shortcut: "I",
        toggle: true,
        active: planImage.show,
        onClick: cycleImage,
        extra: (
          <>
            <button type="button" className="rail-chev" aria-label="Image and wall options" aria-expanded={imageOpen} title="Image and wall options" onClick={() => setImageOpen(!imageOpen)}>
              <Icon name="chevronRight" size={10} />
            </button>
            {imageOpen && (
              <div className="rail-pop popover" ref={imagePop}>
                <div className="seg rail-image-state" role="group" aria-label="Floorplan image">
                  {IMAGE_STATES.map((st) => (
                    <button key={st} type="button" className={st === imageState ? "active" : undefined} aria-pressed={st === imageState} onClick={() => setImageState(st)}>
                      {IMAGE_STATE_LABEL[st]}
                    </button>
                  ))}
                </div>
                <details className="rail-more">
                <summary>More…</summary>
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
                </details>
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
        if (placing?.item.symbol === "built-in") return "Click in an alcove to fit it between the walls, floor to ceiling (Alt places freely). R turns 90°, Esc finishes.";
        if (placing?.item.symbol === "window-seat") return "Click in front of a window to fit the seat to it (Alt places freely). R turns 90°, Esc finishes.";
        return placing ? `Click to place ${placing.item.name}; it snaps to walls (Alt places freely). R turns 90°, Shift+R 15°, Esc finishes.` : null;
      default:
        if (drag.movingWall) return "Drag to move the wall · Esc cancels";
        return roomHint && selectedRoomId ? "Right-click a room for more" : null;
    }
  })();
  const selectHint =
    mode === "build"
      ? "Click a room, canopy, opening or wall to edit it. Drag corners; drag the background or swipe with two fingers to pan, pinch or use the mouse wheel to zoom. Arrows nudge (Shift ×10). Shift+click a neighbouring room to knock through. Esc while dragging puts it back. Right-click for actions."
      : mode === "decorate"
        ? "Click a floor, or a wall near its edge, to decorate it. Drag the background or swipe with two fingers to pan; pinch or use the mouse wheel to zoom. Right-click for actions."
        : mode === "furnish"
          ? "Click an item to edit it; drag to move; Shift+click adds to the selection, Shift+drag selects an area, Ctrl/⌘G groups. Arrows nudge (Shift ×10) · R turns 90°, Shift+R 15° · Ctrl/⌘C, V copy and paste · Ctrl/⌘D duplicates · Delete removes. Esc while dragging puts it back. Right-click for actions."
          : "Drag the background or swipe with two fingers to pan; pinch or use the mouse wheel to zoom. Use Measure to check a distance.";
  const hovered = hoveredRoomId && hoveredRoomId !== selectedRoomId ? floor.rooms.find((r) => r.id === hoveredRoomId) : undefined;

  return (
    <div className="plan-editor">
      <div className="plan-canvas" ref={wrapRef}>
          <svg
            ref={svgRef}
            viewBox={cam ? camera.viewBox : `0 0 ${floor.imageW} ${floor.imageH}`}
            {...drag.svgProps}
            onContextMenu={onContextMenu}
            className={`tool-${tool}${peeking ? " peeking" : ""}`}
          >
          <g ref={camera.layerRef}>
            {planImage.show && (
              <image
                href={floor.image}
                x={0}
                y={0}
                width={floor.imageW}
                height={floor.imageH}
                opacity={imgOpacity}
                clipPath={imageState === "faint" ? "url(#plan-image-clip)" : undefined}
              />
            )}
            <defs>
              <clipPath id="plan-image-clip">
                <rect x={clip.x0} y={clip.y0} width={clip.x1 - clip.x0} height={clip.y1 - clip.y0} />
              </clipPath>
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
                  stroke={sel ? "var(--plan-sel)" : "#0e7490"}
                  strokeWidth={stroke * (sel ? 2.2 : 1.5)}
                  strokeDasharray={`${px * 7} ${px * 4}`}
                  strokeLinejoin="round"
                  className="plan-canopy"
                  onPointerDown={(e) => drag.canopyDown(e, i, sel)}
                >
                  <title>Porch canopy. Click to edit; drag the selected one to move it.</title>
                </polygon>
              );
            })}
            {floor.rooms.length === 0 && tool === "select" && build && (
              <text x={vb.x + vb.w / 2} y={vb.y + vb.h * 0.08} fontSize={fontSize * 1.2} textAnchor="middle" fill="var(--plan-handle)" fontWeight={600} {...halo}>
                No rooms yet. Pick "Rectangle room" and click two opposite corners of each room.
              </text>
            )}
            {orderedRooms.map((r) => (
              <polygon
                key={r.id}
                points={r.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={
                  neutralFills
                    ? r.id === selectedRoomId
                      ? "var(--plan-sel-soft)"
                      : `color-mix(in srgb, ${roomColor(r)} 8%, white)`
                    : roomColor(r)
                }
                fillOpacity={neutralFills ? (r.id === selectedRoomId ? 0.85 : 0.7) : r.id === selectedRoomId ? 0.7 : 0.42}
                stroke={wallsOn ? "none" : r.id === selectedRoomId ? "var(--plan-sel)" : "#1f2937"}
                strokeWidth={stroke * (r.id === selectedRoomId ? 2.2 : 1.2)}
                strokeLinejoin="round"
                data-room={r.id}
                onPointerEnter={() => hoverRoom(r.id)}
                onPointerLeave={(e) => unhoverRoom(e, r.id)}
              />
            ))}
            {wallsOn && (
              <g className="plan-walls" style={{ pointerEvents: "none" }}>
                {/* Outline pass then fill pass: the stroke only survives round the outside of the joined walls, not along the seams between them. */}
                {wallShapes.map((w, i) => (
                  <polygon key={"wo" + i} points={svgPoints(w.poly)} fill={WALL_FILL} stroke={WALL_EDGE} strokeWidth={px * 3} strokeLinejoin="round" />
                ))}
                {wallShapes.map((w, i) => (
                  <polygon key={"wf" + i} points={svgPoints(w.poly)} fill={WALL_FILL} />
                ))}
                {orderedRooms
                  .filter((r) => r.id === selectedRoomId)
                  .map((r) => (
                    <polygon key={"rs" + r.id} points={r.polygon.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--plan-sel)" strokeWidth={stroke * 2.2} strokeLinejoin="round" />
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
                style={{ pointerEvents: "none", fill: "var(--hover-room, var(--plan-sel))", stroke: "var(--hover-room, var(--plan-sel))" }}
              />
            )}
            {canopies.map((c, i) => (
              <CanopyLabel key={"cl" + i} poly={c} ppm={ppm} px={px} fontSize={fontSize} />
            ))}
            {showRoomLabels && orderedRooms.map((r) => <RoomLabel key={"l" + r.id} room={r} ppm={ppm} px={px} fontSize={fontSize} />)}

            {drawOrder.map((fx) => {
              const item = byId(fx.type);
              if (!item) return null;
              const b = fixtureBox(fx, item);
              return (
                <g
                  key={fx.id}
                  transform={`translate(${fx.x} ${fx.y}) rotate(${fx.rot})`}
                  className="plan-fixture"
                  data-fixture-id={fx.id}
                  style={furnish ? undefined : { pointerEvents: "none", opacity: 0.55 }}
                  onPointerDown={(e) => drag.fixtureDown(e, fx)}
                  onPointerEnter={() => furnish && tool === "select" && setHoverGroup(fx.groupId ?? null)}
                  onPointerLeave={() => setHoverGroup(null)}
                >
                  <FixtureSymbol
                    item={item}
                    w={b.w * ppm}
                    d={b.d * ppm}
                    m={ppm}
                    stroke={stroke}
                    color={fx.color}
                    selected={liveIds.includes(fx.id)}
                    clash={clashes.has(fx.id) || misfits.has(fx.id)}
                    fixture={fx}
                  />
                  <title>
                    {fx.label ?? item.name} ({b.w.toFixed(2)} × {b.d.toFixed(2)} m)
                  </title>
                </g>
              );
            })}
            {furnish && tool === "select" && selBox && (
              <rect
                x={selBox.x0 - px * 6}
                y={selBox.y0 - px * 6}
                width={selBox.x1 - selBox.x0 + px * 12}
                height={selBox.y1 - selBox.y0 + px * 12}
                rx={px * 6}
                fill="none"
                stroke="var(--plan-sel)"
                strokeWidth={px * 1.5}
                strokeDasharray={`${px * 6} ${px * 4}`}
                style={{ pointerEvents: "none" }}
              />
            )}
            {furnish && hoverBox && (
              <rect
                x={hoverBox.x0 - px * 4}
                y={hoverBox.y0 - px * 4}
                width={hoverBox.x1 - hoverBox.x0 + px * 8}
                height={hoverBox.y1 - hoverBox.y0 + px * 8}
                rx={px * 5}
                fill="none"
                stroke="var(--plan-sel)"
                strokeOpacity={0.45}
                strokeWidth={px}
                strokeDasharray={`${px * 4} ${px * 4}`}
                style={{ pointerEvents: "none" }}
              />
            )}
            {marquee && (
              <rect
                x={Math.min(marquee.a.x, marquee.b.x)}
                y={Math.min(marquee.a.y, marquee.b.y)}
                width={Math.abs(marquee.a.x - marquee.b.x)}
                height={Math.abs(marquee.a.y - marquee.b.y)}
                fill="var(--plan-sel)"
                fillOpacity={0.08}
                stroke="var(--plan-sel)"
                strokeWidth={px * 1.25}
                strokeDasharray={`${px * 5} ${px * 3}`}
                style={{ pointerEvents: "none" }}
              />
            )}
            {(floor.fixtures ?? []).map(
              (fx) =>
                fx.label && (
                  <text key={"t" + fx.id} x={fx.x} y={fx.y} dy="0.35em" fontSize={fontSize * 0.85} textAnchor="middle" fill="#111" className="plan-text" {...halo}>
                    {fx.label}
                  </text>
                ),
            )}
            {(floor.fixtures ?? []).map((fx) => {
              if (!fx.locked) return null;
              const item = byId(fx.type);
              if (!item) return null;
              const b = fixtureBox(fx, item);
              const cs = rectCorners({ x: fx.x, y: fx.y }, b.w * ppm, b.d * ppm, fx.rot);
              return <LockGlyph key={"k" + fx.id} at={{ x: Math.max(...cs.map((c) => c.x)) - px * 6, y: Math.min(...cs.map((c) => c.y)) + px * 6 }} px={px * 10} />;
            })}
            {ghost && placing && (
              <g transform={`translate(${ghost.x} ${ghost.y}) rotate(${ghost.rot})`} style={{ pointerEvents: "none" }}>
                <FixtureSymbol
                  item={placing.item}
                  w={(ghostFit?.w ?? placing.item.w) * ppm}
                  d={(ghostFit?.d ?? placing.item.d) * ppm}
                  m={ppm}
                  stroke={stroke}
                  fixture={{ joinery: ghostFit?.joinery }}
                  ghost
                />
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
                      stroke={sel ? "var(--plan-sel)" : w.color ?? "#1f2937"}
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
                    onPointerDown={(e) => drag.wallDown(e, w, sel)}
                  >
                    <title>Wall{w.height !== undefined ? ` (${w.height} m high)` : ""}. Click to edit, drag the ends or the selected wall to move.</title>
                  </line>
                  {tool === "select" && build &&
                    (["a", "b"] as const).map((end) => (
                      <Handle
                        key={end}
                        at={w[end]}
                        px={px}
                        r={sel ? 6 : 3.6}
                        hit={sel ? 8 : 6}
                        fill="#fff"
                        ink={sel ? "var(--plan-sel)" : "#6b7280"}
                        sw={1.25 * 1.5}
                        onPointerDown={(e) => drag.wallEndDown(e, w.id, end)}
                      />
                    ))}
                </g>
              );
            })}
            {tool === "wall" && draft.length === 1 && hover && (
              <line x1={draft[0].x} y1={draft[0].y} x2={hover.x} y2={hover.y} stroke="#16a34a" strokeWidth={stroke * 3} strokeLinecap="round" style={{ pointerEvents: "none" }} />
            )}
            {floor.stairs && <StairsMarker floor={floor} px={px} active={drag.drag.kind === "stairs"} interactive={build && tool === "select"} onPointerDown={drag.stairsDown} />}

            {build && tool === "select" && selected && !selected.locked && (() => {
              const r = selected;
              return (
                <g>
                {
                  r.polygon.map((p, i) => {
                      const q = r.polygon[(i + 1) % r.polygon.length];
                      return (
                        <EdgeHit key={"e" + i} a={p} b={q} px={px} width={10} title="Drag to move the wall" onPointerDown={(e) => drag.edgeDown(e, r.id, i)} />
                      );
                    })}
                </g>
              );
            })()}

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
                    fill={sel ? "var(--plan-sel)" : "transparent"}
                    fillOpacity={sel ? 0.18 : 0}
                    className="plan-hit plan-opening"
                    style={build ? undefined : { pointerEvents: "none" }}
                    onPointerDown={(e) => drag.openingDown(e, o)}
                  >
                    <title>
                      {o.kind} ({o.widthM} m). Drag along the wall, click to edit.
                    </title>
                  </rect>
                </g>
              );
            })}

            {build && tool === "select" &&
              orderedRooms.filter((r) => !quiet || r.id === selectedRoomId || r.id === hoveredRoomId).map((r) => {
                const sel = r.id === selectedRoomId;
                return (
                  <g
                    key={"h" + r.id}
                    opacity={quiet && !sel ? 0.5 : undefined}
                    data-room={r.id}
                    onPointerEnter={() => hoverRoom(r.id)}
                    onPointerLeave={(e) => unhoverRoom(e, r.id)}
                  >
                    {sel && !r.locked &&
                      r.polygon.map((p, i) => {
                        const q = r.polygon[(i + 1) % r.polygon.length];
                        return (
                          <MidpointHandle
                            key={"m" + i}
                            a={p}
                            b={q}
                            px={px}
                            r={3.6}
                            hit={6}
                            fill="#fff"
                            ink="var(--plan-sel)"
                            sw={1.25}
                            title="Add a corner here"
                            onPointerDown={(e) => drag.midDown(e, r.id, i)}
                          />
                        );
                      })}
                    {r.polygon.map((p, i) => (
                      <Handle
                        key={i}
                        at={p}
                        px={px}
                        r={sel ? 6 : 3.6}
                        hit={sel ? 8 : 6}
                        fill={sel ? "var(--plan-sel-soft)" : "#fff"}
                        ink={sel ? "var(--plan-sel)" : "var(--plan-handle)"}
                        sw={1.25 * (sel ? 2 : 1.3)}
                        style={r.locked ? { pointerEvents: "none" } : undefined}
                        title="Drag to move; double-click to remove the corner"
                        onPointerDown={(e) => drag.cornerDown(e, r.id, i)}
                      />
                    ))}
                  </g>
                );
              })}
            {build && tool === "select" &&
              selectedCanopyPoly?.map((p, i) => (
                <Handle
                  key={"ch" + i}
                  at={p}
                  px={px}
                  r={6}
                  hit={8}
                  fill="var(--plan-sel-soft)"
                  ink="var(--plan-sel)"
                  sw={1.25 * 2}
                  title="Drag to resize the canopy"
                  onPointerDown={(e) => drag.canopyCornerDown(e, i)}
                />
              ))}
            {selected && litShown !== null && litShown < selected.polygon.length && <LitEdge room={selected} idx={litShown} px={px} fontSize={fontSize} />}
            {guides.length > 0 && (
              <g className="plan-guides" pointerEvents="none">
                {guides.map((g, i) => (
                  <line
                    key={i}
                    className="plan-guide"
                    x1={g.axis === "x" ? g.at : g.from}
                    x2={g.axis === "x" ? g.at : g.to}
                    y1={g.axis === "x" ? g.from : g.at}
                    y2={g.axis === "x" ? g.to : g.at}
                    stroke="#db2777"
                    strokeWidth={px}
                    strokeDasharray={`${px * 5} ${px * 4}`}
                  />
                ))}
              </g>
            )}
            {clearances.length > 0 && (
              <g className="plan-distances" pointerEvents="none">
                {clearances
                  .filter((c) => c.px / ppm >= 0.005)
                  .map((c) => {
                    const tx = c.to.y - c.from.y;
                    const ty = -(c.to.x - c.from.x);
                    const tl = Math.hypot(tx, ty) || 1;
                    const t = { x: (tx / tl) * px * 4, y: (ty / tl) * px * 4 };
                    return (
                      <g key={c.dir} className="plan-distance-line" stroke="#0e7490" strokeWidth={px * 1.25}>
                        <line x1={c.from.x} y1={c.from.y} x2={c.to.x} y2={c.to.y} />
                        <line x1={c.from.x - t.x} y1={c.from.y - t.y} x2={c.from.x + t.x} y2={c.from.y + t.y} />
                        <line x1={c.to.x - t.x} y1={c.to.y - t.y} x2={c.to.x + t.x} y2={c.to.y + t.y} />
                        <text
                          className="plan-distance"
                          x={(c.from.x + c.to.x) / 2}
                          y={(c.from.y + c.to.y) / 2}
                          dy="0.35em"
                          fontSize={fontSize * 0.85}
                          textAnchor="middle"
                          fill="#0e7490"
                          fontWeight={600}
                          {...halo}
                          strokeOpacity={0.9}
                        >
                          {formatLength(c.px / ppm)}
                        </text>
                      </g>
                    );
                  })}
              </g>
            )}
            {selected && build && tool === "select" && (
              <EdgeLabels room={selected} ppm={ppm} px={px} fontSize={fontSize} editing={edgeEdit?.roomId === selected.id ? edgeEdit.idx : null} onChipDown={(e, idx) => drag.chipDown(e, selected.id, idx, !!selected.locked)} />
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
          </g>
          </svg>

          {editRoom && edgeEdit && cam && size && (
            <EdgeLengthInput
              key={`${editRoom.id}/${edgeEdit.idx}`}
              room={editRoom}
              idx={edgeEdit.idx}
              ppm={ppm}
              toScreen={toScreen}
              px={px}
              fontSize={fontSize}
              bounds={size}
              onCommit={(m) => updateRoom(variant, floor.id, editRoom.id, { polygon: setEdgeLength(editRoom.polygon, edgeEdit.idx, m * ppm) })}
              onClose={() => setEdgeEdit(null)}
            />
          )}

        </div>

        {mode !== "review" && (
          <InspectorCard className="side">
            {furnish ? (
              liveIds.length >= 2 ? (
                <MultiFixtureInspector
                  fixtures={allFixtures.filter((x) => liveIds.includes(x.id))}
                  isGroup={exactGroup(allFixtures, liveIds) !== null}
                  onPick={(id) => select({ fixtures: [id] })}
                  onGroup={() => groupSelected(liveIds)}
                  onUngroup={() => setFixtures((all) => ungroupFixtures(all, liveIds))}
                  onTurn={() => anyLocked(liveIds) || setFixtures((all) => rotateFixtures(all, liveIds, 90))}
                  onLock={(on) => lockFixtures(liveIds, on)}
                  onDuplicate={() => duplicateFixtureIds(liveIds)}
                  onCopy={() => copyFixtureIds(liveIds)}
                  onRemove={removeSelected}
                  onColour={(color) => setFixtures((all) => all.map((x) => (liveIds.includes(x.id) ? { ...x, color } : x)))}
                />
              ) : selectedFixture && selectedFixtureItem ? (
                <FixtureInspector
                  fixture={selectedFixture}
                  item={selectedFixtureItem}
                  ceiling={ceilingHeight}
                  clash={clashes.has(selectedFixture.id)}
                  misfit={misfits.get(selectedFixture.id)}
                  onRefit={defaultFit(selectedFixtureItem) && !selectedFixture.locked ? () => refit(selectedFixture) : undefined}
                  groupSize={selectedFixture.groupId ? allFixtures.filter((x) => x.groupId === selectedFixture.groupId).length : undefined}
                  onSelectGroup={() => select({ fixtures: expandToGroups([selectedFixture.id], allFixtures) })}
                  onChange={(p) => patchFixture(selectedFixture.id, p)}
                  onDuplicate={() => duplicateFixtureIds([selectedFixture.id])}
                  onCopy={() => copyFixtureIds([selectedFixture.id])}
                  onPaste={clipboard.length ? pasteFixtures : undefined}
                  onRemove={removeSelected}
                />
              ) : (
                <FurnishSummary floor={floor} clashes={clashes.size} onAdd={() => setAddOpen(true)} onPaste={clipboard.length ? pasteFixtures : undefined} />
              )
            ) : decorate ? (
              selected ? (
                <DecoratePanel key={selected.id} variant={variant} floor={floor} room={selected} edge={selectedEdge} onChange={(p) => updateRoom(variant, floor.id, selected.id, p)} onHighlightEdge={setLitEdge} />
              ) : selectedWall ? (
                <WallInspector
                  mode="decorate"
                  wall={selectedWall}
                  onChange={(p) => patchWall(selectedWall.id, p)}
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
                  selection.setSelectedCanopy(null);
                }}
              />
            ) : selectedOpening ? (
              <OpeningInspector
                opening={selectedOpening}
                pair={selectedOpening.kind === "door" && selectedOpening.widthM > DOUBLE_DOOR_M && outsideSide(selectedOpening, floor.rooms, 0.3 * ppm) === 0}
                floor={floor}
                onChange={(p) => patchOpening(selectedOpening.id, p)}
                onDelete={removeSelected}
              />
            ) : selectedWall ? (
              <WallInspector
                mode="build"
                wall={selectedWall}
                onChange={(p) => patchWall(selectedWall.id, p)}
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
        <button type="button" className="icon-btn" onClick={() => camera.zoomBy(ZOOM_STEP)} aria-label="Zoom in (+)" title="Zoom in (+)">
          <Icon name="zoomIn" size={20} />
        </button>
        <button type="button" className="icon-btn" onClick={() => camera.zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out (−)" title="Zoom out (−)">
          <Icon name="zoomOut" size={20} />
        </button>
        <button type="button" className="icon-btn" onClick={() => camera.fit()} aria-label="Fit the rooms (F)" title="Fit the rooms (F)">
          <Icon name="fit" size={20} />
        </button>
        <button type="button" className="icon-btn" onClick={() => camera.fit(imageRect)} aria-label="Show the whole floorplan image" title="Show the whole floorplan image">
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
      {room.locked && <LockGlyph at={{ x: c.x - (room.name.length * fontSize * 0.3 + px * 8), y: c.y - fontSize * 0.3 }} px={px * 10} />}
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

/** Size of an edge chip for its text, in image px. */
function chipSize(text: string, px: number, fontSize: number) {
  return { w: text.length * fontSize * 0.56 + px * 8, h: fontSize * 1.35 };
}

/** Where an edge's length chip sits: horizontal, just outside the edge's midpoint. */
function edgeLabelAt(room: Room, i: number, px: number, fontSize: number, ppm: number): Pt {
  const a = room.polygon[i];
  const b = room.polygon[(i + 1) % room.polygon.length];
  const { w, h } = chipSize(formatLength(edgeLengthsM(room.polygon, ppm)[i]), px, fontSize);
  return edgeChipCentre(a, b, inwardNormals(room.polygon)[i], w, h, px * 3);
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

function EdgeLabels({ room, ppm, px, fontSize, editing, onChipDown }: { room: Room; ppm: number; px: number; fontSize: number; editing: number | null; onChipDown: (e: React.PointerEvent, i: number) => void }) {
  const lens = edgeLengthsM(room.polygon, ppm);
  return (
    <g>
      {lens.map((len, i) => {
        if (i === editing || len * ppm < px * 30) return null;
        const p = edgeLabelAt(room, i, px, fontSize, ppm);
        const text = formatLength(len);
        const { w, h } = chipSize(text, px, fontSize);
        return (
          <g
            key={i}
            transform={`translate(${p.x} ${p.y})`}
            className="plan-edge-label"
            onPointerDown={(e) => onChipDown(e, i)}
          >
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h / 2} fill="var(--plan-chip-bg)" stroke="var(--plan-sel)" strokeWidth={px} />
            <text y={0} dy="0.35em" fontSize={fontSize * 0.85} textAnchor="middle" fill="var(--plan-sel-ink)" fontWeight={600}>
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
  fontSize,
  toScreen,
  bounds,
  onCommit,
  onClose,
}: {
  room: Room;
  idx: number;
  ppm: number;
  px: number;
  fontSize: number;
  toScreen: (p: Pt) => Pt;
  bounds: Size;
  onCommit: (m: number) => void;
  onClose: () => void;
}) {
  // Pinned where it opened (the label moves as the length changes, the field should not), and kept on screen.
  const [s] = useState(() => {
    const p = toScreen(edgeLabelAt(room, idx, px, fontSize, ppm));
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
  px,
  active,
  interactive,
  onPointerDown,
}: {
  floor: Floor;
  px: number;
  active: boolean;
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
    <g className={interactive ? "plan-handle" : undefined} style={interactive ? undefined : { pointerEvents: "none" }} onPointerDown={onPointerDown}>
      <rect x={s.x - rw / 2} y={s.y - rh / 2} width={rw} height={rh} fill="transparent" />
      <StairsSymbol centre={s} run={len} width={w} ppm={floor.pxPerM} dir={d} winders={winders} px={px} active={active} label="UP" />
      <title>Stairs (they rise towards the arrow). Drag to move; set direction and size in the floor panel.</title>
    </g>
  );
}
