import { useEffect, useRef, useState } from "react";
import { SITE_EDIT_ID, useStore } from "./store";
import { Viewer } from "./three/Viewer";
import { PlanEditor } from "./editor/PlanEditor";
import { ImportPanel } from "./components/ImportPanel";
import { PhotosPanel } from "./components/PhotosPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ExteriorPanel } from "./components/ExteriorPanel";
import { PhotoLightbox } from "./components/PhotoLightbox";
import { Dialogs } from "./components/Dialogs";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutSheet } from "./components/ShortcutSheet";
import { ListingUpdatesDialog } from "./components/ListingUpdatesDialog";
import { decideStartupPrompt, readRemembered } from "./lib/startupPrompt";
import { decideSiteUpdate } from "./lib/sitePreset";
import { startSync } from "./lib/sync";
import { runStartupPrompt } from "./components/startupDialog";
import { LISTING_PRESET, PRESETS } from "./lib/houses/listing91770873";
import { SitePanel } from "./components/SitePanel";
import { ReportPanel } from "./components/ReportPanel";
import { PlanningPanel } from "./components/PlanningPanel";
import { SiteEditor } from "./editor/SiteEditor";
import { ModeBar } from "./components/ModeBar";
import { ModePanel } from "./components/ModePanel";
import { usePanelPrefs } from "./components/panelPrefs";
import { siteEditPatch } from "./lib/modes";
import { pickWallFace } from "./lib/decorPick";
import { EXT_WALL_T, roomWorldPolygon } from "./lib/geometry";
import { PlanFloorSwitch, ViewControls, ViewMenu } from "./components/ViewMenu";
import { useMediaQuery } from "./components/useMediaQuery";
import { VARIANT_LABEL, type Floor, type VariantKey } from "./types";

type Side = "floorplans" | "photos" | "exterior" | "site" | "report" | "planning" | "settings";

/** Below this width the sidebar becomes a slide-over drawer (keep in step with styles.css). */
const DRAWER_QUERY = "(max-width: 899px)";
/** From this width the view controls fit inline in the header; narrower screens get the View popover. */
const INLINE_QUERY = "(min-width: 1680px)";

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
  const setTab = (t: "3d" | "plan") => setUi({ tab: t });
  const [side, setSide] = useState<Side>("floorplans");
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const mode = useStore((s) => s.mode);
  const drawer = useMediaQuery(DRAWER_QUERY);
  const inline = useMediaQuery(INLINE_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo. Text fields keep their own undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // A panel action that opens the plan editor or another floor should reveal it.
  useEffect(() => setDrawerOpen(false), [tab, editFloorId, drawer]);

  const model = variants[activeVariant];
  const other: VariantKey = activeVariant === "current" ? "proposed" : "current";
  const otherModel = variants[other];
  const both = !!variants.current && !!variants.proposed;
  const editingSite = editFloorId === SITE_EDIT_ID || mode === "plot";
  const editFloor = model?.floors.find((f) => f.id === editFloorId) ?? model?.floors[0];

  // On the plan, Plot always shows the site editor and no other mode does.
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

  // Decorate: a tap on a wall in 3D picks that wall face of the room behind it.
  const onPickWall = (floor: Floor, hit: { x: number; y: number }, normal: { x: number; y: number }, bays: { id: string; poly: { x: number; y: number }[] }[] = []) => {
    const rooms = floor.rooms.map((r) => ({ id: r.id, poly: roomWorldPolygon(floor, r) }));
    const pick = pickWallFace(rooms, hit, normal, { probe: 0.05, through: EXT_WALL_T / 2 + 0.1, maxDist: 0.5 }, bays);
    if (!pick || pick.edge === null) return;
    setUi({ selectedRoomId: pick.roomId, selectedEdge: { edge: pick.edge, side: pick.side }, editFloorId: floor.id });
  };
  const pickWall = mode === "decorate" ? onPickWall : undefined;

  if (!hydrated) return <div className="loading">Loading…</div>;

  const viewControls =
    tab === "3d" ? <ViewControls model={model} both={both} /> : model && mode !== "plot" ? <PlanFloorSwitch model={model} /> : null;
  const sides: [Side, string, boolean][] = [
    ["floorplans", "Floorplans", true],
    ["photos", `Photos (${photos.length})`, true],
    ["exterior", "Exterior", !!model],
    ["site", "Site", true],
    ["report", "Report", !!model],
    ["planning", "Planning check", !!model],
    ["settings", "Settings", true],
  ];

  return (
    <div className={drawer && drawerOpen ? "app drawer-open" : "app"} data-mode={mode}>
      <header>
        {drawer && (
          <button className="drawer-toggle" onClick={() => setDrawerOpen((o) => !o)} aria-expanded={drawerOpen} aria-label="Panels" title="Panels">
            <span aria-hidden="true">☰</span>
          </button>
        )}
        <h1>House Modeler</h1>
        <div className="seg hdr-undo">
          <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
            ↶
          </button>
          <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
            ↷
          </button>
        </div>
        <div className="hdr-break" />
        <div className="seg hdr-variant">
          {(["current", "proposed"] as VariantKey[]).map((k) => (
            <button key={k} className={activeVariant === k ? "active" : ""} disabled={!variants[k]} onClick={() => setUi({ activeVariant: k, selectedRoomId: null, selectedEdge: null })}>
              {VARIANT_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="seg hdr-tab">
          <button className={tab === "3d" ? "active" : ""} onClick={() => setTab("3d")}>
            3D view
          </button>
          <button className={tab === "plan" ? "active" : ""} onClick={() => setTab("plan")} disabled={!model}>
            Check plan
          </button>
        </div>
        {viewControls && (inline ? <div className="hdr-inline">{viewControls}</div> : <ViewMenu label="View">{viewControls}</ViewMenu>)}
      </header>

      <ModeBar />

      <div className="body">
        {drawer && drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}
        <aside className={drawer ? "drawer" : undefined} aria-hidden={drawer && !drawerOpen ? true : undefined} inert={drawer && !drawerOpen ? true : undefined}>
          {drawer && (
            <div className="drawer-head">
              <b>Panels</b>
              <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close panels">
                ×
              </button>
            </div>
          )}
          <div className="seg vertical">
            {sides.map(([key, label, enabled]) => (
              <button key={key} className={side === key ? "active" : ""} onClick={() => setSide(key)} disabled={!enabled}>
                {label}
              </button>
            ))}
          </div>
          <div className="side-content">
            {side === "floorplans" && (
              <>
                <ImportPanel variant="current" />
                <ImportPanel variant="proposed" />
              </>
            )}
            {side === "photos" && <PhotosPanel />}
            {side === "exterior" && model && <ExteriorPanel variant={activeVariant} />}
            {side === "site" && <SitePanel />}
            {side === "report" && model && <ReportPanel />}
            {side === "planning" && model && <PlanningPanel />}
            {side === "settings" && <SettingsPanel />}
          </div>
        </aside>

        <main>
          {!model && (
            <div className="empty">
              <h2>Load the listing</h2>
              <p>Open Floorplans and choose Load listing 91770873 to see the house in 3D.</p>
              {drawer && <button onClick={() => setDrawerOpen(true)}>Open floorplans</button>}
            </div>
          )}
          {model && tab === "3d" && viewMode === "single" && (
            <Viewer
              model={model}
              photos={photos}
              showLabels={showLabels}
              showCeilings={showCeilings}
              doorsOpen={doorsOpen}
              selectedRoomId={selectedRoomId}
              onSelectRoom={onSelectRoom}
              onPickWall={pickWall}
              title={VARIANT_LABEL[activeVariant]}
              maxLevel={maxLevel}
              showExterior={showExterior}
              variant={activeVariant}
            />
          )}
          {model && tab === "3d" && viewMode === "side-by-side" && both && (
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
          {model && tab === "3d" && viewMode === "overlay" && both && otherModel && (
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
          {model && tab === "plan" && editingSite && <SiteEditor />}
          {model && tab === "plan" && !editingSite && editFloor && <PlanEditor key={editFloor.id} variant={activeVariant} floor={editFloor} />}
        </main>
        {((model && (tab === "3d" || mode === "review")) || (!model && mode === "plot")) && <ModePanel />}
      </div>
      <PhotoLightbox />
      <Dialogs />
      <CommandPalette />
      <ShortcutSheet />
      <ListingUpdatesDialog />
    </div>
  );
}
