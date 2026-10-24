import { useEffect, useMemo, useRef, useState } from "react";
import type { Fixture, Floor, Pt, VariantKey } from "../types";
import { byId } from "../lib/catalogue";
import { ContextMenu } from "../components/ContextMenu";
import { usePanelPrefs } from "../components/panelPrefs";
import { pruneSelection } from "../lib/modes";
import { useStore } from "../store";
import { bbox } from "../lib/geometry";
import { fixtureBox, imageClipRect, imageStateOf, setEdgeLength, viewBoxOf } from "../lib/planMath";
import { refitFixture } from "../lib/recess";
import { useClipboardFixtures } from "../lib/clipboard";
import { selectionBounds } from "../lib/fixtureGroups";
import { wallClearances } from "../lib/planGuides";
import { useCanvasCamera } from "./core";
import { usePlanSelection } from "./plan/useSelection";
import { usePlanTools } from "./plan/useTools";
import { usePlanDrag } from "./plan/useDrag";
import { usePlanKeys } from "./plan/useKeys";
import { usePlanMenu } from "./plan/useMenu";
import { usePlanGeometry } from "./plan/useGeometry";
import { EMPTY, sameList, useEvent, useSame, useStableHandlers } from "./plan/layers/shared";
import { Backdrop } from "./plan/layers/Backdrop";
import { CanopyLabels, CanopyShapes } from "./plan/layers/Canopies";
import { NoRoomsHint, RoomFills, RoomHover, RoomLabels } from "./plan/layers/Rooms";
import { FreeWalls, WallBands, WallDraft } from "./plan/layers/Walls";
import { FixtureLabels, FixtureLocks, FixtureSymbols, HoverBox, PlacingGhost, SelectionBox } from "./plan/layers/Fixtures";
import { StairsMarker } from "./plan/layers/Stairs";
import { CanopyHandles, RoomEdgeHits, RoomHandles } from "./plan/layers/Handles";
import { Openings } from "./plan/layers/Openings";
import { CalibDots, Clearances, Draft, EdgeLabels, Guides, LitEdge, Marquee, MeasureOverlay } from "./plan/layers/Overlays";
import { PlanRail } from "./plan/chrome/PlanRail";
import { PlanInspector } from "./plan/chrome/PlanInspector";
import { PlanStatus, statusTextFor } from "./plan/chrome/PlanStatus";
import { PlanZoom } from "./plan/chrome/PlanZoom";
import { EdgeLengthInput } from "./plan/chrome/EdgeLengthInput";
import "./PlanEditor.css";

/**
 * 2D check-and-fix view: the geometry drawn over the source image. Used to
 * correct the traced plan and to lay out furniture. Coordinates are image px; the camera only changes the view
 * box, and strokes, handles and text are sized in screen pixels. The camera, the pointer machine and the polygon
 * editing come from the shared editor core (./core); the plan's own state lives in ./plan/use*; each thing drawn
 * is a memoised layer in ./plan/layers, fed only what it draws, so a drag redraws only the layers it changes.
 */
export function PlanEditor({ variant, floor }: { variant: VariantKey; floor: Floor }) {
  const updateRoom = useStore((s) => s.updateRoom);
  const selectedRoomId = useStore((s) => s.selectedRoomId);
  const selectedEdge = useStore((s) => s.selectedEdge);
  const mode = useStore((s) => s.mode);
  const build = mode === "build";
  const decorate = mode === "decorate";
  const furnish = mode === "furnish";
  const setUi = useStore((s) => s.setUi);
  const planImage = useStore((s) => s.planImage);
  const wallsOn = useStore((s) => s.planWalls);
  const clipboard = useClipboardFixtures();
  const [addOpen, setAddOpen] = useState(false);
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
  const fontSize = px * 13;
  const vb = cam && size ? viewBoxOf(cam, size) : { x: 0, y: 0, w: floor.imageW, h: floor.imageH };

  const selection = usePlanSelection(variant, floor, () => (cam && size ? { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 } : { x: floor.imageW / 2, y: floor.imageH / 2 }));
  const { edgeEdit, setEdgeEdit, litEdge, selectedOpeningId, selectedWallId, setHoverGroup, hoverGroup, selectedCanopy, roomHint, allFixtures, canopies, select, patchFixture, pasteFixtures } = selection;
  const liveIds = useSame(selection.liveIds, sameList);
  const tools = usePlanTools(mode, floor, () => setEdgeEdit(null));
  const { tool, calib, draft, hover, altHeld, measure, placing, setPlacing, pick, startPlacing } = tools;

  const geo = usePlanGeometry(floor, wallsOn, px * 10);
  const { fitPlacing, snapFixture, faceLines, hitShapes } = geo;
  const toScreen = (p: Pt): Pt => ({ x: (p.x - (cam?.x ?? 0)) / px, y: (p.y - (cam?.y ?? 0)) / px });
  /** Put a fitted unit back in its recess (or at its window), undoably. */
  const refit = (fx: Fixture) => {
    const item = byId(fx.type);
    const p = item && refitFixture(floor, fx, item, geo.faces);
    if (p) patchFixture(fx.id, p);
  };

  const drag = usePlanDrag({
    variant, floor, mode, peeking, svgRef, camera, sel: selection, tools,
    geo: { segs: geo.segs, snapTargets: geo.snapTargets, corners: geo.corners, hitShapes, faceLines, fitPlacing, snapFixture },
    selectedRoomId,
  });
  const { guides, marquee, addRoom, placeOpeningAt } = drag;
  const h = useStableHandlers(drag);
  usePlanKeys({ variant, floor, mode, segs: geo.segs, camera, sel: selection, tools, selectedRoomId, setAddOpen });
  const pickEvent = useEvent(pick);
  const startPlacingEvent = useEvent(startPlacing);
  const pasteEvent = useEvent(() => pasteFixtures());
  const finishRoom = useEvent(() => {
    if (draft.length >= 3) addRoom(draft);
    tools.setDraft([]);
  });

  const pasteLabel = clipboard.length > 1 ? `Paste ${clipboard.length} items` : `Paste ${byId(clipboard[0]?.type ?? "")?.name ?? "item"}`;
  const { menu, setMenu, onContextMenu } = usePlanMenu({
    variant, floor, mode, peeking, camera, drag, sel: selection, tools, hitShapes,
    clipboardCount: clipboard.length, pasteLabel, placeOpeningAt, refit,
  });

  const selected = floor.rooms.find((r) => r.id === selectedRoomId);
  const fixtures = floor.fixtures ?? EMPTY;
  // Draw the selected room last so its outline and drag handles sit above its neighbours.
  const orderedRooms = useMemo(() => [...floor.rooms.filter((r) => r.id !== selectedRoomId), ...(selected ? [selected] : [])], [floor.rooms, selectedRoomId, selected]);
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
  const hovered = hoveredRoomId && hoveredRoomId !== selectedRoomId ? floor.rooms.find((r) => r.id === hoveredRoomId) : undefined;

  const imgOpacity = Math.min(1, Math.max(0.1, planImage.opacity));
  const imageState = imageStateOf(planImage);
  const clip = useMemo(() => imageClipRect(roomsRect, ppm, { w: floor.imageW, h: floor.imageH }), [roomsRect, ppm, floor.imageW, floor.imageH]);
  const neutralFills = quiet && (build || furnish);
  const showRoomLabels = !(planImage.show && imageState === "trace");
  const editSelect = build && tool === "select";

  const statusText = statusTextFor({
    tool, draftLen: draft.length, measureLen: measure.length, calibLen: calib.length, placing,
    movingWall: drag.movingWall, roomHint, hasSelectedRoom: !!selectedRoomId,
  });

  return (
    <div className="plan-editor">
      <div className="plan-canvas" ref={wrapRef}>
        <svg ref={svgRef} viewBox={cam ? camera.viewBox : `0 0 ${floor.imageW} ${floor.imageH}`} {...drag.svgProps} onContextMenu={onContextMenu} className={`tool-${tool}${peeking ? " peeking" : ""}`}>
          <g ref={camera.layerRef}>
            <Backdrop show={planImage.show} href={floor.image} w={floor.imageW} h={floor.imageH} opacity={imgOpacity} faint={imageState === "faint"} clip={clip} px={px} />
            <CanopyShapes canopies={canopies} selected={selectedCanopy} px={px} onDown={h.canopyDown} />
            {floor.rooms.length === 0 && tool === "select" && build && <NoRoomsHint x={vb.x + vb.w / 2} y={vb.y + vb.h * 0.08} px={px} />}
            <RoomFills rooms={orderedRooms} selectedId={selectedRoomId} neutral={neutralFills} wallsOn={wallsOn} px={px} onEnter={h.hoverRoom} onLeave={h.unhoverRoom} />
            {wallsOn && <WallBands shapes={geo.wallShapes} selectedRoom={selected} px={px} />}
            {hovered && <RoomHover room={hovered} px={px} />}
            <CanopyLabels canopies={canopies} ppm={ppm} px={px} />
            {showRoomLabels && <RoomLabels rooms={orderedRooms} ppm={ppm} px={px} />}

            <FixtureSymbols
              ordered={geo.drawOrder}
              furnish={furnish}
              hoverable={furnish && tool === "select"}
              selectedIds={liveIds}
              flagged={geo.flagged}
              ppm={ppm}
              px={px}
              onDown={h.fixtureDown}
              onHoverGroup={setHoverGroup}
            />
            {furnish && tool === "select" && selBox && <SelectionBox box={selBox} px={px} />}
            {furnish && hoverBox && <HoverBox box={hoverBox} px={px} />}
            {marquee && <Marquee a={marquee.a} b={marquee.b} px={px} />}
            <FixtureLabels fixtures={fixtures} px={px} />
            <FixtureLocks fixtures={fixtures} ppm={ppm} px={px} />
            {ghost && placing && (
              <PlacingGhost
                item={placing.item}
                x={ghost.x}
                y={ghost.y}
                rot={ghost.rot}
                w={ghostFit?.w ?? placing.item.w}
                d={ghostFit?.d ?? placing.item.d}
                joinery={ghostFit?.joinery}
                ppm={ppm}
                px={px}
              />
            )}

            <FreeWalls
              walls={floor.walls ?? EMPTY}
              selectedId={selectedWallId}
              wallsOn={wallsOn}
              hittable={build || decorate}
              ends={editSelect}
              ppm={ppm}
              px={px}
              onDown={h.wallDown}
              onEndDown={h.wallEndDown}
            />
            {tool === "wall" && draft.length === 1 && hover && <WallDraft from={draft[0]} to={hover} px={px} />}
            {floor.stairs && (
              <StairsMarker
                stairs={floor.stairs}
                stairsLen={floor.stairsLen}
                stairsWidth={floor.stairsWidth}
                stairsDir={floor.stairsDir}
                stairsTurn={floor.stairsTurn}
                stairsTopTurn={floor.stairsTopTurn}
                stairsTopWinders={floor.stairsTopWinders}
                ppm={ppm}
                px={px}
                active={drag.drag.kind === "stairs"}
                interactive={editSelect}
                onPointerDown={h.stairsDown}
              />
            )}

            {editSelect && selected && !selected.locked && <RoomEdgeHits room={selected} px={px} onDown={h.edgeDown} />}
            <Openings openings={floor.openings} rooms={floor.rooms} selectedId={selectedOpeningId} build={build} ppm={ppm} px={px} onDown={h.openingDown} />
            {editSelect && (
              <RoomHandles
                rooms={orderedRooms}
                selectedId={selectedRoomId}
                quiet={quiet}
                hoveredId={quiet ? hoveredRoomId : null}
                px={px}
                onEnter={h.hoverRoom}
                onLeave={h.unhoverRoom}
                onCornerDown={h.cornerDown}
                onMidDown={h.midDown}
              />
            )}
            {editSelect && canopies[selectedCanopy ?? -1] && <CanopyHandles poly={canopies[selectedCanopy!]} px={px} onDown={h.canopyCornerDown} />}
            {selected && litShown !== null && litShown < selected.polygon.length && <LitEdge room={selected} idx={litShown} px={px} />}
            {guides.length > 0 && <Guides guides={guides} px={px} />}
            {clearances.length > 0 && <Clearances clearances={clearances} ppm={ppm} px={px} />}
            {selected && editSelect && <EdgeLabels room={selected} ppm={ppm} px={px} editing={edgeEdit?.roomId === selected.id ? edgeEdit.idx : null} onChipDown={h.chipDown} />}

            {measure.length > 0 && <MeasureOverlay a={measure[0]} b={measureEnd ?? undefined} ppm={ppm} px={px} />}
            <CalibDots points={calib} px={px} />
            <Draft tool={tool} draft={draft} hover={hover} px={px} />
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
        <PlanInspector
          variant={variant}
          floor={floor}
          mode={mode}
          sel={selection}
          selectedRoom={selected}
          clashes={geo.clashes}
          misfits={geo.misfits}
          clipboardCount={clipboard.length}
          onRefit={refit}
          onAdd={() => setAddOpen(true)}
        />
      )}

      {!peeking && (
        <PlanRail
          mode={mode}
          tool={tool}
          addOpen={addOpen}
          onAddOpen={setAddOpen}
          activeId={placing?.item.piece ?? placing?.item.id}
          onPick={pickEvent}
          onStartPlacing={startPlacingEvent}
          clipboardCount={clipboard.length}
          pasteLabel={pasteLabel}
          onPaste={pasteEvent}
        />
      )}
      <PlanZoom zoomBy={camera.zoomBy} fit={camera.fit} imageW={floor.imageW} imageH={floor.imageH} />
      {!peeking && statusText && <PlanStatus text={statusText} finish={tool === "room" && draft.length >= 3} onFinish={finishRoom} />}
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
