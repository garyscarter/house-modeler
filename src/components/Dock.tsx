import { useStore, type ViewMode } from "../store";
import { siteOf } from "../lib/sites";
import { dockFloorActive, dockFloorPick, floorDisplayName, floorsByLevel, tabSwitchPatch } from "../lib/studio";
import { usePanelPrefs } from "./panelPrefs";
import { Popover, ViewToggles } from "./ViewMenu";
import { Icon } from "./icons";
import "./Dock.css";

const COMPARE: [ViewMode, string][] = [
  ["single", "Single"],
  ["side-by-side", "Side by side"],
  ["overlay", "Overlay"],
  ["wipe", "Wipe"],
];

/** The floating bar at the bottom of the canvas: Plan / 3D, floors, and in 3D the compare mode, sun and view options. */
export function Dock() {
  const tab = useStore((s) => s.tab);
  const mode = useStore((s) => s.mode);
  const maxLevel = useStore((s) => s.maxLevel);
  const editFloorId = useStore((s) => s.editFloorId);
  const viewMode = useStore((s) => s.viewMode);
  const floors = useStore((s) => s.variants[s.activeVariant]?.floors);
  const both = useStore((s) => !!s.variants.current && !!s.variants.proposed);
  const hasSite = useStore((s) => !!siteOf(s.sites, s.activeVariant));
  const setUi = useStore((s) => s.setUi);
  const sunOpen = usePanelPrefs((s) => s.sunOpen);
  const setPrefs = usePanelPrefs((s) => s.setPrefs);
  if (!floors) return null;

  const ui = { tab, maxLevel, editFloorId };
  const sorted = floorsByLevel(floors);
  const active = dockFloorActive(ui, floors);
  const showFloors = tab === "3d" ? sorted.length > 0 : mode !== "plot" && sorted.length > 1;
  const keyOf = (i: number) => (i < 9 ? ` (${i + 1})` : "");
  const compareLabel = COMPARE.find(([k]) => k === viewMode)?.[1] ?? "Single";

  return (
    <div className="dock float-card" role="toolbar" aria-label="View">
      <div className="seg" role="group" aria-label="Plan or 3D">
        <button className={tab === "plan" ? "active" : ""} title="Plan (Tab)" onClick={() => setUi(tabSwitchPatch(ui, floors, "plan"))}>
          Plan
        </button>
        <button className={tab === "3d" ? "active" : ""} title="3D (Tab)" onClick={() => setUi(tabSwitchPatch(ui, floors, "3d"))}>
          3D
        </button>
      </div>

      {showFloors && (
        <div className="seg" role="group" aria-label="Floor">
          {tab === "3d" && (
            <button className={active === "all" ? "active" : ""} title="All floors (0)" onClick={() => setUi(dockFloorPick(ui, floors, "all"))}>
              All
            </button>
          )}
          {sorted.map((f, i) => (
            <button key={f.id} className={active === f.id ? "active" : ""} title={`${floorDisplayName(f.name)}${keyOf(i)}`} onClick={() => setUi(dockFloorPick(ui, floors, f.id))}>
              {floorDisplayName(f.name)}
            </button>
          ))}
        </div>
      )}

      {tab === "3d" && (
        <>
          <span className="dock-sep" aria-hidden="true" />
          <Popover className="dock-compare" label={`Compare: ${compareLabel}`} disabled={!both} title={both ? "Compare As listed and Proposed" : "Load both layouts to compare them"}>
            <div className="compare-rows" role="radiogroup" aria-label="Compare">
              {COMPARE.map(([k, label]) => (
                <button key={k} data-pick role="radio" aria-checked={viewMode === k} className="compare-row" onClick={() => setUi({ viewMode: k })}>
                  <span className="radio" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          </Popover>
          <button
            className={sunOpen ? "icon-btn active" : "icon-btn"}
            aria-label="Sun study"
            aria-pressed={sunOpen}
            disabled={!hasSite}
            title={hasSite ? "Sun study" : "Add a plot under Plot to use the sun study"}
            onClick={() => setPrefs({ sunOpen: !sunOpen })}
          >
            <Icon name="sun" />
          </button>
          <Popover className="dock-view" label="View">
            <ViewToggles />
          </Popover>
        </>
      )}
    </div>
  );
}
