import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SITE_EDIT_ID, useStore } from "./store";
import { PhotoLightbox } from "./components/PhotoLightbox";
import { Dialogs } from "./components/Dialogs";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutSheet } from "./components/ShortcutSheet";
import { ReviewPage } from "./components/ReviewPage";
import { ListingUpdatesDialog } from "./components/ListingUpdatesDialog";
import { LayoutsDialog, openLayouts } from "./components/LayoutsDialog";
import { PhotosDialog } from "./components/PhotosDialog";
import { TopBar } from "./components/TopBar";
import { Dock } from "./components/Dock";
import { InspectorCard } from "./components/InspectorCard";
import { useStudioKeys } from "./components/useStudioKeys";
import { decideStartupPrompt, readRemembered } from "./lib/startupPrompt";
import { decideSiteUpdate } from "./lib/sitePreset";
import { startSync } from "./lib/sync";
import { runStartupPrompt } from "./components/startupDialog";
import { LISTING_PRESET, PRESETS } from "./lib/houses/listing91770873";
import { ModePanel } from "./components/ModePanel";
import { usePanelPrefs } from "./components/panelPrefs";
import { siteEditPatch } from "./lib/modes";
import { floorAtLevel, houseName } from "./lib/studio";
import { pickWallFace } from "./lib/decorPick";
import { EXT_WALL_T, roomWorldPolygon } from "./lib/geometry";
import { VARIANT_LABEL, type Floor, type Room, type VariantKey } from "./types";
import { Loader } from "./components/Loader";
import { BrandMark } from "./components/BrandMark";

// three.js, react-three-fiber and drei load with the 3D view, not with the app shell.
const Viewer = lazy(() => import("./three/Viewer").then((m) => ({ default: m.Viewer })));
const WipeCompare = lazy(() => import("./three/WipeCompare").then((m) => ({ default: m.WipeCompare })));
// The 2D editors load the first time the Plan tab opens.
const PlanEditor = lazy(() => import("./editor/PlanEditor").then((m) => ({ default: m.PlanEditor })));
const SiteEditor = lazy(() => import("./editor/SiteEditor").then((m) => ({ default: m.SiteEditor })));

export default function App() {
  const variants = useStore((s) => s.variants);
  const photos = useStore((s) => s.photos);
  const activeVariant = useStore((s) => s.activeVariant);
  const viewMode = useStore((s) => s.viewMode);
  const showLabels = useStore((s) => s.showLabels);
  const showCeilings = useStore((s) => s.showCeilings);
  const doorsOpen = useStore((s) => s.doorsOpen);
  const maxLevel = useStore((s) => s.maxLevel);
  const showExterior = useStore((s) => s.showExterior);
  const selectedRoomId = useStore((s) => s.selectedRoomId);
  const setUi = useStore((s) => s.setUi);
  const tab = useStore((s) => s.tab);
  const editFloorId = useStore((s) => s.editFloorId);
  const mode = useStore((s) => s.mode);
  const peek = useStore((s) => s.peek);
  const peekReturn = useStore((s) => s.peekReturn);
  const look = usePanelPrefs((s) => s.look);
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());

  useStudioKeys();
  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), []);

  // Once saved work has loaded, offer the listing's plans (or an update to them), at most once per page load.
  const asked = useRef(false);
  useEffect(() => {
    if (!hydrated || asked.current) return;
    asked.current = true;
    void (async () => {
      // Load the server's copy first (if there is a server), so the prompt below looks at what was loaded.
      await startSync();
      const { variants, sites } = useStore.getState();
      const prompt = decideStartupPrompt(variants, PRESETS, LISTING_PRESET.id, readRemembered(), decideSiteUpdate(variants, sites));
      if (prompt) void runStartupPrompt(prompt);
    })();
  }, [hydrated]);

  const model = variants[activeVariant];
  const titleModel = variants[activeVariant] ?? variants.current ?? variants.proposed;
  useEffect(() => {
    document.title = titleModel ? `${houseName(titleModel)} · Storey` : "Storey";
  }, [titleModel]);
  const other: VariantKey = activeVariant === "current" ? "proposed" : "current";
  const otherModel = variants[other];
  const both = !!variants.current && !!variants.proposed;
  const effectiveViewMode = both ? viewMode : "single";
  // On the plan, Plot always shows the site editor and no other mode does.
  const editingSite = mode === "plot";
  // While peeking, the shown layout has other floor ids: follow the level of the floor you were on, and keep the editor's key.
  const homeModel = peek && peekReturn ? variants[peekReturn] : model;
  const homeFloor = (editFloorId && editFloorId !== SITE_EDIT_ID ? homeModel?.floors.find((f) => f.id === editFloorId) : undefined) ?? homeModel?.floors[0];
  const editFloor = peek && homeFloor && model ? floorAtLevel(model.floors, homeFloor.level) ?? model.floors[0] : (editFloorId && editFloorId !== SITE_EDIT_ID ? model?.floors.find((f) => f.id === editFloorId) : undefined) ?? model?.floors[0];

  useEffect(() => {
    if (tab === "plan" && mode === "plot" && editFloorId !== SITE_EDIT_ID) setUi(siteEditPatch({ editFloorId }));
  }, [tab, mode, editFloorId, setUi]);

  // Stable callbacks, so the 3D view's memoised floors don't re-render on every App render.
  const onSelectRoom = useCallback(
    (floor: Floor, room: Room) => {
      if (mode === "plot") return;
      if (mode === "build") setUi({ selectedRoomId: room.id, editFloorId: floor.id });
      else if (mode === "decorate") {
        setUi({ selectedRoomId: room.id, selectedEdge: null, editFloorId: floor.id });
        usePanelPrefs.getState().setOpen("decorate.floor", true);
      } else setUi({ editFloorId: floor.id });
    },
    [mode, setUi],
  );

  // Decorate: a click on a wall in 3D picks that wall face of the room behind it.
  const onPickWall = useCallback(
    (floor: Floor, hit: { x: number; y: number }, normal: { x: number; y: number }, bays: { id: string; poly: { x: number; y: number }[] }[] = []) => {
      const rooms = floor.rooms.map((r) => ({ id: r.id, poly: roomWorldPolygon(floor, r) }));
      const pick = pickWallFace(rooms, hit, normal, { probe: 0.05, through: EXT_WALL_T / 2 + 0.1, maxDist: 0.5 }, bays);
      if (!pick || pick.edge === null) return;
      setUi({ selectedRoomId: pick.roomId, selectedEdge: { edge: pick.edge, side: pick.side }, editFloorId: floor.id });
    },
    [setUi],
  );
  const pickWall = mode === "decorate" ? onPickWall : undefined;
  // Side by side and wipe: a pick in either view also makes that layout the active one.
  const pickIn = useMemo(() => {
    const per = (k: VariantKey) => ({
      select: (floor: Floor, room: Room) => {
        setUi({ activeVariant: k });
        onSelectRoom(floor, room);
      },
      wall:
        pickWall &&
        ((floor: Floor, hit: { x: number; y: number }, normal: { x: number; y: number }, bays?: { id: string; poly: { x: number; y: number }[] }[]) => {
          setUi({ activeVariant: k });
          pickWall(floor, hit, normal, bays);
        }),
    });
    return { current: per("current"), proposed: per("proposed") };
  }, [setUi, onSelectRoom, pickWall]);
  const onWipeSelect = useCallback((f: Floor, r: Room, k: VariantKey) => pickIn[k].select(f, r), [pickIn]);
  const onWipePickWall = useMemo(
    () =>
      pickWall &&
      ((f: Floor, hit: { x: number; y: number }, normal: { x: number; y: number }, bays: { id: string; poly: { x: number; y: number }[] }[] | undefined, k: VariantKey) =>
        pickIn[k].wall?.(f, hit, normal, bays)),
    [pickIn, pickWall],
  );

  // The 3D view stays mounted once opened, hidden on the Plan tab, so coming back doesn't rebuild it.
  const show3d = tab === "3d";
  const [opened3d, setOpened3d] = useState(show3d);
  if (show3d && !opened3d) setOpened3d(true);

  if (!hydrated)
    return (
      <div className="loading" role="status">
        <Loader kind="blueprint" size={56} />
        Opening your project
      </div>
    );

  const showInspector = tab === "3d" && mode !== "review" && (!!model || mode === "plot");

  return (
    <div className="app" data-mode={mode} data-tab={tab} data-look={look}>
      <TopBar />
      <div className="narrow-note">Storey is designed for a desktop or laptop.</div>

      <main data-tab={tab}>
        {!model && (
          <div className="empty">
            <BrandMark outline size={72} />
            <h2>Load the listing</h2>
            <p>Open Layouts and choose Load listing 91770873 to see the house in 3D.</p>
            <button className="primary" onClick={openLayouts}>
              Open layouts
            </button>
          </div>
        )}
        {model && opened3d && (
          <div className="view3d" hidden={!show3d}>
            <Suspense
              fallback={
                <div className="viewer-loading" role="status">
                  <Loader kind="blueprint" size={40} />
                  Loading the 3D view
                </div>
              }
            >
              {effectiveViewMode === "single" && (
                <Viewer
                  active={show3d}
                  model={model}
                  photos={photos}
                  showLabels={showLabels}
                  showCeilings={showCeilings}
                  doorsOpen={doorsOpen}
                  selectedRoomId={selectedRoomId}
                  onSelectRoom={onSelectRoom}
                  onPickWall={pickWall}
                  maxLevel={maxLevel}
                  showExterior={showExterior}
                  variant={activeVariant}
                />
              )}
              {effectiveViewMode === "side-by-side" && (
                <div className="split">
                  {(["current", "proposed"] as VariantKey[]).map((k) => (
                    <Viewer
                      key={k}
                      active={show3d}
                      captureId={k}
                      variant={k}
                      model={variants[k]!}
                      photos={photos}
                      showLabels={showLabels}
                      showCeilings={showCeilings}
                      doorsOpen={doorsOpen}
                      selectedRoomId={selectedRoomId}
                      onSelectRoom={pickIn[k].select}
                      onPickWall={pickIn[k].wall}
                      title={VARIANT_LABEL[k]}
                      maxLevel={maxLevel}
                      showExterior={showExterior}
                    />
                  ))}
                </div>
              )}
              {effectiveViewMode === "overlay" && otherModel && (
                <Viewer
                  active={show3d}
                  model={model}
                  ghost={otherModel}
                  variant={activeVariant}
                  ghostVariant={other}
                  photos={photos}
                  showLabels={showLabels}
                  showCeilings={showCeilings}
                  doorsOpen={doorsOpen}
                  selectedRoomId={selectedRoomId}
                  onSelectRoom={onSelectRoom}
                  onPickWall={pickWall}
                  title={`${VARIANT_LABEL[activeVariant]} (solid) vs ${VARIANT_LABEL[other]} (red = removed, green = new)`}
                  maxLevel={maxLevel}
                  showExterior={showExterior}
                />
              )}
              {effectiveViewMode === "wipe" && (
                <WipeCompare
                  photos={photos}
                  showLabels={showLabels}
                  showCeilings={showCeilings}
                  doorsOpen={doorsOpen}
                  selectedRoomId={selectedRoomId}
                  onSelectRoom={onWipeSelect}
                  onPickWall={onWipePickWall}
                  maxLevel={maxLevel}
                  showExterior={showExterior}
                />
              )}
            </Suspense>
          </div>
        )}
        {model && tab === "plan" && (
          <Suspense
            fallback={
              <div className="viewer-loading" role="status">
                <Loader kind="blueprint" size={40} />
                Opening the plan
              </div>
            }
          >
            {editingSite && <SiteEditor />}
            {!editingSite && editFloor && <PlanEditor key={homeFloor?.id ?? editFloor.id} variant={activeVariant} floor={editFloor} />}
          </Suspense>
        )}

        {showInspector && (
          <InspectorCard className="side">
            <ModePanel />
          </InspectorCard>
        )}
        {model && <Dock />}
        {peek && <div className="peek-badge">Showing {VARIANT_LABEL[activeVariant]} · release Space</div>}
      </main>

      <PhotoLightbox />
      <Dialogs />
      <CommandPalette />
      <ShortcutSheet />
      <ReviewPage />
      <ListingUpdatesDialog />
      <LayoutsDialog />
      <PhotosDialog />
    </div>
  );
}
