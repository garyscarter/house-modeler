import { useEffect, useRef, useState } from "react";
import { SITE_EDIT_ID, useStore } from "./store";
import { Viewer } from "./three/Viewer";
import { WipeCompare } from "./three/WipeCompare";
import { PlanEditor } from "./editor/PlanEditor";
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
import { SiteEditor } from "./editor/SiteEditor";
import { ModePanel } from "./components/ModePanel";
import { usePanelPrefs } from "./components/panelPrefs";
import { siteEditPatch } from "./lib/modes";
import { pickWallFace } from "./lib/decorPick";
import { EXT_WALL_T, roomWorldPolygon } from "./lib/geometry";
import { VARIANT_LABEL, type Floor, type VariantKey } from "./types";

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
  const other: VariantKey = activeVariant === "current" ? "proposed" : "current";
  const otherModel = variants[other];
  const both = !!variants.current && !!variants.proposed;
  const effectiveViewMode = both ? viewMode : "single";
  // On the plan, Plot always shows the site editor and no other mode does.
  const editingSite = mode === "plot";
  const editFloor = (editFloorId && editFloorId !== SITE_EDIT_ID ? model?.floors.find((f) => f.id === editFloorId) : undefined) ?? model?.floors[0];

  useEffect(() => {
    if (tab === "plan" && mode === "plot" && editFloorId !== SITE_EDIT_ID) setUi(siteEditPatch({ editFloorId }));
  }, [tab, mode, editFloorId, setUi]);

  const onSelectRoom = (floor: { id: string }, room: { id: string }) => {
    if (mode === "plot") return;
    if (mode === "build") setUi({ selectedRoomId: room.id, editFloorId: floor.id });
    else if (mode === "decorate") {
      setUi({ selectedRoomId: room.id, selectedEdge: null, editFloorId: floor.id });
      usePanelPrefs.getState().setOpen("decorate.floor", true);
    } else setUi({ editFloorId: floor.id });
  };

  // Decorate: a click on a wall in 3D picks that wall face of the room behind it.
  const onPickWall = (floor: Floor, hit: { x: number; y: number }, normal: { x: number; y: number }, bays: { id: string; poly: { x: number; y: number }[] }[] = []) => {
    const rooms = floor.rooms.map((r) => ({ id: r.id, poly: roomWorldPolygon(floor, r) }));
    const pick = pickWallFace(rooms, hit, normal, { probe: 0.05, through: EXT_WALL_T / 2 + 0.1, maxDist: 0.5 }, bays);
    if (!pick || pick.edge === null) return;
    setUi({ selectedRoomId: pick.roomId, selectedEdge: { edge: pick.edge, side: pick.side }, editFloorId: floor.id });
  };
  const pickWall = mode === "decorate" ? onPickWall : undefined;

  if (!hydrated) return <div className="loading">Loading…</div>;

  const showInspector = tab === "3d" && mode !== "review" && (!!model || mode === "plot");

  return (
    <div className="app" data-mode={mode} data-tab={tab} data-look={look}>
      <TopBar />
      <div className="narrow-note">House Modeler is designed for a desktop or laptop.</div>

      <main data-tab={tab}>
        {!model && (
          <div className="empty">
            <h2>Load the listing</h2>
            <p>Open Layouts and choose Load listing 91770873 to see the house in 3D.</p>
            <button className="primary" onClick={openLayouts}>
              Open layouts
            </button>
          </div>
        )}
        {model && tab === "3d" && effectiveViewMode === "single" && (
          <Viewer
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
        {model && tab === "3d" && effectiveViewMode === "side-by-side" && (
          <div className="split">
            {(["current", "proposed"] as VariantKey[]).map((k) => (
              <Viewer
                key={k}
                captureId={k}
                variant={k}
                model={variants[k]!}
                photos={photos}
                showLabels={showLabels}
                showCeilings={showCeilings}
                doorsOpen={doorsOpen}
                selectedRoomId={selectedRoomId}
                onSelectRoom={(f, r) => {
                  setUi({ activeVariant: k });
                  onSelectRoom(f, r);
                }}
                onPickWall={
                  pickWall &&
                  ((f, h, n) => {
                    setUi({ activeVariant: k });
                    pickWall(f, h, n);
                  })
                }
                title={VARIANT_LABEL[k]}
                maxLevel={maxLevel}
                showExterior={showExterior}
              />
            ))}
          </div>
        )}
        {model && tab === "3d" && effectiveViewMode === "overlay" && otherModel && (
          <Viewer
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
        {model && tab === "3d" && effectiveViewMode === "wipe" && (
          <WipeCompare
            photos={photos}
            showLabels={showLabels}
            showCeilings={showCeilings}
            doorsOpen={doorsOpen}
            selectedRoomId={selectedRoomId}
            onSelectRoom={(f, r, k) => {
              setUi({ activeVariant: k });
              onSelectRoom(f, r);
            }}
            maxLevel={maxLevel}
            showExterior={showExterior}
          />
        )}
        {model && tab === "plan" && editingSite && <SiteEditor />}
        {model && tab === "plan" && !editingSite && editFloor && <PlanEditor key={editFloor.id} variant={activeVariant} floor={editFloor} />}

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
