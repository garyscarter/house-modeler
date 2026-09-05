import { useEffect, useState } from "react";
import { useStore } from "./store";
import { Viewer } from "./three/Viewer";
import { PlanEditor } from "./editor/PlanEditor";
import { ImportPanel } from "./components/ImportPanel";
import { PhotosPanel } from "./components/PhotosPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { PhotoLightbox } from "./components/PhotoLightbox";
import { VARIANT_LABEL, type VariantKey } from "./types";

type Tab = "3d" | "plan";
type Side = "floorplans" | "photos" | "settings";

export default function App() {
  const variants = useStore((s) => s.variants);
  const photos = useStore((s) => s.photos);
  const activeVariant = useStore((s) => s.activeVariant);
  const viewMode = useStore((s) => s.viewMode);
  const cameraMode = useStore((s) => s.cameraMode);
  const walkFloorId = useStore((s) => s.walkFloorId);
  const showLabels = useStore((s) => s.showLabels);
  const showCeilings = useStore((s) => s.showCeilings);
  const maxLevel = useStore((s) => s.maxLevel);
  const selectedRoomId = useStore((s) => s.selectedRoomId);
  const setUi = useStore((s) => s.setUi);
  const updateModel = useStore((s) => s.updateModel);
  const [tab, setTab] = useState<Tab>("3d");
  const [side, setSide] = useState<Side>("floorplans");
  const [editFloorId, setEditFloorId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());

  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), []);

  const model = variants[activeVariant];
  const other: VariantKey = activeVariant === "current" ? "proposed" : "current";
  const otherModel = variants[other];
  const both = !!variants.current && !!variants.proposed;
  const editFloor = model?.floors.find((f) => f.id === editFloorId) ?? model?.floors[0];

  const onSelectRoom = (floor: { id: string }, room: { id: string }) => {
    setUi({ selectedRoomId: room.id });
    setEditFloorId(floor.id);
  };

  if (!hydrated) return <div className="loading">Loading…</div>;

  return (
    <div className="app">
      <header>
        <h1>House Modeler</h1>
        <div className="seg">
          {(["current", "proposed"] as VariantKey[]).map((k) => (
            <button key={k} className={activeVariant === k ? "active" : ""} disabled={!variants[k]} onClick={() => setUi({ activeVariant: k, selectedRoomId: null })}>
              {VARIANT_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="seg">
          <button className={tab === "3d" ? "active" : ""} onClick={() => setTab("3d")}>
            3D view
          </button>
          <button className={tab === "plan" ? "active" : ""} onClick={() => setTab("plan")} disabled={!model}>
            Check plan
          </button>
        </div>
        {tab === "3d" && (
          <>
            <div className="seg">
              <button className={viewMode === "single" ? "active" : ""} onClick={() => setUi({ viewMode: "single" })}>
                Single
              </button>
              <button className={viewMode === "side-by-side" ? "active" : ""} disabled={!both} onClick={() => setUi({ viewMode: "side-by-side" })}>
                Side by side
              </button>
              <button className={viewMode === "overlay" ? "active" : ""} disabled={!both} onClick={() => setUi({ viewMode: "overlay" })}>
                Overlay
              </button>
            </div>
            <div className="seg">
              <button className={cameraMode === "orbit" ? "active" : ""} onClick={() => setUi({ cameraMode: "orbit" })}>
                Orbit
              </button>
              <button className={cameraMode === "walk" ? "active" : ""} disabled={!model} onClick={() => setUi({ cameraMode: "walk", viewMode: "single" })}>
                Walk
              </button>
              {cameraMode === "walk" && model && (
                <select value={walkFloorId ?? model.floors[0]?.id} onChange={(e) => setUi({ walkFloorId: e.target.value })}>
                  {model.floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {model && model.floors.length > 1 && cameraMode !== "walk" && (
              <label className="check">
                Show up to
                <select value={maxLevel ?? ""} onChange={(e) => setUi({ maxLevel: e.target.value === "" ? null : parseInt(e.target.value) })}>
                  <option value="">all floors</option>
                  {model.floors.map((f) => (
                    <option key={f.id} value={f.level}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="check">
              <input type="checkbox" checked={showLabels} onChange={(e) => setUi({ showLabels: e.target.checked })} /> Labels
            </label>
            <label className="check">
              <input type="checkbox" checked={showCeilings} onChange={(e) => setUi({ showCeilings: e.target.checked })} /> Ceilings
            </label>
            {model && (
              <label className="check">
                Ceiling height
                <input
                  type="number"
                  step="0.1"
                  min="2"
                  max="4"
                  value={model.ceilingHeight}
                  onChange={(e) => updateModel(activeVariant, { ceilingHeight: parseFloat(e.target.value) || 2.4 })}
                  style={{ width: 56 }}
                />
                m
              </label>
            )}
          </>
        )}
        {tab === "plan" && model && (
          <div className="seg">
            {model.floors.map((f) => (
              <button key={f.id} className={editFloor?.id === f.id ? "active" : ""} onClick={() => setEditFloorId(f.id)}>
                {f.name}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="body">
        <aside>
          <div className="seg vertical">
            <button className={side === "floorplans" ? "active" : ""} onClick={() => setSide("floorplans")}>
              Floorplans
            </button>
            <button className={side === "photos" ? "active" : ""} onClick={() => setSide("photos")}>
              Photos ({photos.length})
            </button>
            <button className={side === "settings" ? "active" : ""} onClick={() => setSide("settings")}>
              Settings
            </button>
          </div>
          <div className="side-content">
            {side === "floorplans" && (
              <>
                <ImportPanel variant="current" />
                <ImportPanel variant="proposed" />
              </>
            )}
            {side === "photos" && <PhotosPanel />}
            {side === "settings" && <SettingsPanel />}
          </div>
        </aside>

        <main>
          {!model && (
            <div className="empty">
              <h2>Start with a floorplan</h2>
              <p>Add your API key in Settings, then upload the listing's floorplan image under Floorplans. Or load the sample house to try the viewer.</p>
            </div>
          )}
          {model && tab === "3d" && viewMode === "single" && (
            <Viewer
              model={model}
              photos={photos}
              cameraMode={cameraMode}
              walkFloorId={walkFloorId}
              showLabels={showLabels}
              showCeilings={showCeilings}
              selectedRoomId={selectedRoomId}
              onSelectRoom={onSelectRoom}
              title={VARIANT_LABEL[activeVariant]}
              maxLevel={maxLevel}
            />
          )}
          {model && tab === "3d" && viewMode === "side-by-side" && both && (
            <div className="split">
              {(["current", "proposed"] as VariantKey[]).map((k) => (
                <Viewer
                  key={k}
                  model={variants[k]!}
                  photos={photos}
                  cameraMode="orbit"
                  walkFloorId={null}
                  showLabels={showLabels}
                  showCeilings={showCeilings}
                  selectedRoomId={selectedRoomId}
                  onSelectRoom={(f, r) => {
                    setUi({ activeVariant: k });
                    onSelectRoom(f, r);
                  }}
                  title={VARIANT_LABEL[k]}
                  maxLevel={maxLevel}
                />
              ))}
            </div>
          )}
          {model && tab === "3d" && viewMode === "overlay" && both && otherModel && (
            <Viewer
              model={model}
              ghost={otherModel}
              photos={photos}
              cameraMode="orbit"
              walkFloorId={null}
              showLabels={showLabels}
              showCeilings={showCeilings}
              selectedRoomId={selectedRoomId}
              onSelectRoom={onSelectRoom}
              title={`${VARIANT_LABEL[activeVariant]} (solid) vs ${VARIANT_LABEL[other]} (red = removed, green = new)`}
              maxLevel={maxLevel}
            />
          )}
          {model && tab === "plan" && editFloor && <PlanEditor variant={activeVariant} floor={editFloor} />}
        </main>
      </div>
      <PhotoLightbox />
    </div>
  );
}
