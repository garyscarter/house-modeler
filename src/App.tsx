import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useStore } from "./store";
import { useWalk } from "./walkStore";
import { Dialogs } from "./components/Dialogs";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutSheet } from "./components/ShortcutSheet";
import { RenderHost } from "./components/RenderHost";
import { ReviewPage } from "./components/ReviewPage";
import { ListingUpdatesDialog } from "./components/ListingUpdatesDialog";
import { LayoutsDialog } from "./components/LayoutsDialog";
import { TopBar } from "./components/TopBar";
import { Dock } from "./components/Dock";
import { InspectorCard } from "./components/InspectorCard";
import { useStudioKeys } from "./components/useStudioKeys";
import { useGestureFade } from "./components/useGestureFade";
import { decideStartupPrompt, readRemembered } from "./lib/startupPrompt";
import { decideSiteUpdate } from "./lib/sitePreset";
import { startSync } from "./lib/sync";
import { runStartupPrompt } from "./components/startupDialog";
import { currentHouse } from "./lib/house";
import { ModePanel } from "./components/ModePanel";
import { usePanelPrefs } from "./components/panelPrefs";
import { editsSite, roomTapSelects, siteEditPatch, SITE_EDIT_ID } from "./lib/modes";
import { editFloorFor, houseName } from "./lib/studio";
import { pickWallFace } from "./lib/decorPick";
import { EXT_WALL_T, roomWorldPolygon } from "./lib/geometry";
import { VARIANT_LABEL, type Floor, type Room, type VariantKey } from "./types";
import { Loader } from "./components/Loader";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PanelProblem } from "./components/PanelProblem";
import { Recovery } from "./components/Recovery";
import { useHydration } from "./lib/persist";
import { Welcome } from "./components/Welcome";
import { CoachStrip } from "./components/CoachStrip";
import { SaveNotice } from "./components/SaveNotice";
import { startChassisWatch, useChassis } from "./components/useChassis";
import { TabBar } from "./components/mobile/TabBar";
import { useSheet } from "./components/mobile/sheet";
import { effectiveCompare } from "./lib/chassis";

// three.js, react-three-fiber and drei load with the 3D view, not with the app shell.
const Viewer = lazy(() => import("./three/Viewer").then((m) => ({ default: m.Viewer })));
const WipeCompare = lazy(() => import("./three/WipeCompare").then((m) => ({ default: m.WipeCompare })));
// The 2D editors load the first time the Plan tab opens.
const PlanEditor = lazy(() => import("./editor/PlanEditor").then((m) => ({ default: m.PlanEditor })));
const SiteEditor = lazy(() => import("./editor/SiteEditor").then((m) => ({ default: m.SiteEditor })));

export default function App() {
  // The shell subscribes to as little as it can: what each part draws it reads from the store itself (Viewer, WipeCompare,
  // PlanHost), so a drag on the plan does not re-render this component on every frame.
  const activeVariant = useStore((s) => s.activeVariant);
  const hasModel = useStore((s) => !!s.variants[s.activeVariant]);
  const title = useStore((s) => {
    const m = s.variants[s.activeVariant] ?? s.variants.current ?? s.variants.proposed;
    return m ? houseName(m) : null;
  });
  const setUi = useStore((s) => s.setUi);
  const tab = useStore((s) => s.tab);
  const editFloorId = useStore((s) => s.editFloorId);
  const mode = useStore((s) => s.mode);
  const peek = useStore((s) => s.peek);
  const chassis = useChassis((s) => s.chassis);
  const touch = useChassis((s) => s.touch);
  const walking = useWalk((s) => s.on);
  const hydrationError = useHydration((s) => s.error);
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());

  // Dev only: how often this component renders (the plan-drag check reads window.__appRenders).
  useEffect(() => {
    if (import.meta.env.DEV) {
      const w = window as unknown as { __appRenders?: number };
      w.__appRenders = (w.__appRenders ?? 0) + 1;
    }
  });

  useStudioKeys();
  useGestureFade();
  useEffect(startChassisWatch, []);
  useEffect(() => {
    const off = useStore.persist.onFinishHydration(() => setHydrated(true));
    // Loading can finish between the first render and this effect, and then no event follows: check again.
    if (useStore.persist.hasHydrated()) setHydrated(true);
    return off;
  }, []);

  // Once saved work has loaded, offer the listing's plans (or an update to them), at most once per page load.
  const asked = useRef(false);
  useEffect(() => {
    if (!hydrated || asked.current) return;
    asked.current = true;
    void (async () => {
      // Load the server's copy first (if there is a server), so the prompt below looks at what was loaded.
      await startSync();
      const { variants, sites } = useStore.getState();
      const house = currentHouse();
      const prompt = decideStartupPrompt(variants, house.presets, house.main, readRemembered(), decideSiteUpdate(variants, sites));
      // The first-run Welcome card handles "load"; only the update questions are asked as dialogs.
      if (prompt && prompt.kind !== "load") void runStartupPrompt(prompt);
    })();
  }, [hydrated]);

  useEffect(() => {
    document.title = title ? `${title} · Storey` : "Storey";
  }, [title]);
  // On the plan, Plot always shows the site editor and no other mode does.
  const editingSite = editsSite(mode);

  useEffect(() => {
    if (tab === "plan" && editsSite(mode) && editFloorId !== SITE_EDIT_ID) setUi(siteEditPatch({ editFloorId }));
  }, [tab, mode, editFloorId, setUi]);

  // Stable callbacks, so the 3D view's memoised floors don't re-render on every App render.
  const onSelectRoom = useCallback(
    (floor: Floor, room: Room) => {
      if (editsSite(mode)) return;
      if (chassis === "phone" && roomTapSelects(mode)) useSheet.getState().raise();
      if (mode === "build") setUi({ selectedRoomId: room.id, editFloorId: floor.id });
      else if (mode === "decorate") {
        setUi({ selectedRoomId: room.id, selectedEdge: null, editFloorId: floor.id });
        usePanelPrefs.getState().setOpen("decorate.floor", true);
      } else setUi({ editFloorId: floor.id });
    },
    [mode, setUi, chassis],
  );

  // Decorate: a click on a wall in 3D picks that wall face of the room behind it.
  const onPickWall = useCallback(
    (floor: Floor, hit: { x: number; y: number }, normal: { x: number; y: number }, bays: { id: string; poly: { x: number; y: number }[] }[] = []) => {
      const rooms = floor.rooms.map((r) => ({ id: r.id, poly: roomWorldPolygon(floor, r) }));
      const pick = pickWallFace(rooms, hit, normal, { probe: 0.05, through: EXT_WALL_T / 2 + 0.1, maxDist: 0.5 }, bays);
      if (!pick || pick.edge === null) return;
      if (chassis === "phone") useSheet.getState().raise();
      setUi({ selectedRoomId: pick.roomId, selectedEdge: { edge: pick.edge, side: pick.side }, editFloorId: floor.id });
    },
    [setUi, chassis],
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

  if (!hydrated && hydrationError) return <Recovery kind="open" error={hydrationError} />;
  if (!hydrated)
    return (
      <div className="loading" role="status">
        <Loader kind="blueprint" size={56} />
        Opening your project
      </div>
    );

  const showInspector = tab === "3d" && mode !== "review" && (hasModel || editingSite);

  return (
    <div className="app" data-mode={mode} data-tab={tab} data-chassis={chassis} data-touch={touch || undefined} data-walking={walking || undefined}>
      <TopBar />

      <main data-tab={tab}>
        {!hasModel && <Welcome />}
        {hasModel && opened3d && (
          <View3D show={show3d} onSelectRoom={onSelectRoom} onPickWall={pickWall} pickIn={pickIn} onWipeSelect={onWipeSelect} onWipePickWall={onWipePickWall} />
        )}
        {hasModel && tab === "plan" && (
          <ModelBoundary fallback={(error, reset) => <PanelProblem title="The plan hit a problem" button="Reload plan" error={error} reset={reset} />}>
            <Suspense
              fallback={
                <div className="viewer-loading" role="status">
                  <Loader kind="blueprint" size={40} />
                  Opening the plan
                </div>
              }
            >
              {editingSite && <SiteEditor key={mode} mode={mode === "garden" ? "garden" : "plot"} />}
              {!editingSite && <PlanHost />}
            </Suspense>
          </ModelBoundary>
        )}

        {showInspector && (
          <InspectorCard className="side">
            <ModePanel />
          </InspectorCard>
        )}
        {hasModel && <CoachStrip />}
        <SaveNotice />
        {hasModel && <Dock />}
        {peek && <div className="peek-badge">Showing {VARIANT_LABEL[activeVariant]} · release Space</div>}
      </main>
      {hasModel && chassis === "phone" && <TabBar />}

      <Dialogs />
      <CommandPalette />
      <ShortcutSheet />
      <RenderHost />
      <ReviewPage />
      <ListingUpdatesDialog />
      <LayoutsDialog />
    </div>
  );
}

/** An error boundary that tries again when the active layout changes (a fix made after an error), without its parent subscribing to edits. */
function ModelBoundary({ fallback, children }: { fallback: (error: unknown, reset: () => void) => ReactNode; children: ReactNode }) {
  const model = useStore((s) => s.variants[s.activeVariant]);
  return (
    <ErrorBoundary resetKeys={[model]} fallback={fallback}>
      {children}
    </ErrorBoundary>
  );
}

/** The floor plan editor: reads the floor it shows from the store (following the peek, see editFloorFor), so App does not. */
function PlanHost() {
  const variant = useStore((s) => s.activeVariant);
  const floor = useStore((s) => editFloorFor(s)?.floor);
  const key = useStore((s) => editFloorFor(s)?.key);
  if (!floor || !key) return null;
  return <PlanEditor key={key} variant={variant} floor={floor} />;
}

type Picks = {
  select: (floor: Floor, room: Room) => void;
  wall?: (floor: Floor, hit: { x: number; y: number }, normal: { x: number; y: number }, bays?: { id: string; poly: { x: number; y: number }[] }[]) => void;
};

/**
 * The 3D tab: one view, side by side, overlay or the wipe. It picks the arrangement; each viewer reads its own layout and
 * the view settings (labels, ceilings, doors, floor cap, selection) from the store.
 */
function View3D({
  show,
  onSelectRoom,
  onPickWall,
  pickIn,
  onWipeSelect,
  onWipePickWall,
}: {
  show: boolean;
  onSelectRoom: Picks["select"];
  onPickWall: Picks["wall"];
  pickIn: Record<VariantKey, Picks>;
  onWipeSelect: (f: Floor, r: Room, k: VariantKey) => void;
  onWipePickWall: ((f: Floor, hit: { x: number; y: number }, normal: { x: number; y: number }, bays: { id: string; poly: { x: number; y: number }[] }[] | undefined, k: VariantKey) => void) | undefined;
}) {
  const viewMode = useStore((s) => s.viewMode);
  const activeVariant = useStore((s) => s.activeVariant);
  const both = useStore((s) => !!s.variants.current && !!s.variants.proposed);
  const chassis = useChassis((s) => s.chassis);
  const mode = effectiveCompare(viewMode, chassis, both, "single", "wipe", "side-by-side");
  const other: VariantKey = activeVariant === "current" ? "proposed" : "current";
  return (
    <div className="view3d" hidden={!show}>
      <ModelBoundary fallback={(error, reset) => <PanelProblem title="The 3D view hit a problem" button="Reload 3D view" error={error} reset={reset} />}>
        <Suspense
          fallback={
            <div className="viewer-loading" role="status">
              <Loader kind="blueprint" size={40} />
              Loading the 3D view
            </div>
          }
        >
          {mode === "single" && <Viewer active={show} variant={activeVariant} onSelectRoom={onSelectRoom} onPickWall={onPickWall} />}
          {mode === "side-by-side" && (
            <div className="split">
              {(["current", "proposed"] as VariantKey[]).map((k) => (
                <Viewer key={k} active={show} captureId={k} variant={k} onSelectRoom={pickIn[k].select} onPickWall={pickIn[k].wall} title={VARIANT_LABEL[k]} />
              ))}
            </div>
          )}
          {mode === "overlay" && (
            <Viewer
              active={show}
              variant={activeVariant}
              ghostVariant={other}
              onSelectRoom={onSelectRoom}
              onPickWall={onPickWall}
              title={`${VARIANT_LABEL[activeVariant]} (solid) vs ${VARIANT_LABEL[other]} (teal = new, red = removed)`}
            />
          )}
          {mode === "wipe" && <WipeCompare onSelectRoom={onWipeSelect} onPickWall={onWipePickWall} />}
        </Suspense>
      </ModelBoundary>
    </div>
  );
}
