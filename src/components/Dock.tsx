import { useStore } from "../store";
import { siteOf } from "../lib/sites";
import { editsSite } from "../lib/modes";
import { dockFloorActive, dockFloorPick, floorDisplayName, floorShortName, floorsByLevel, tabSwitchPatch } from "../lib/studio";
import { usePanelPrefs } from "./panelPrefs";
import { Popover, ViewToggles } from "./ViewMenu";
import { Icon } from "./icons";
import { CaptureMenu } from "./CaptureMenu";
import { SavedViewsMenu } from "./SavedViewsMenu";
import { useChassis } from "./useChassis";
import { useWalk } from "../walkStore";
import { WalkBar } from "./walk/WalkBar";
import { WalkMap } from "./walk/WalkMap";
import { WalkHint } from "./walk/WalkHint";
import "./walk/walk.css";
import { FEATURES } from "../lib/chassis";
import "./Dock.css";

/** The floating bar at the bottom of the canvas: Plan / 3D, floors, and in 3D sun, view options and the measure and walk buttons. */
export function Dock() {
  const tab = useStore((s) => s.tab);
  const mode = useStore((s) => s.mode);
  const maxLevel = useStore((s) => s.maxLevel);
  const editFloorId = useStore((s) => s.editFloorId);
  const floors = useStore((s) => s.variants[s.activeVariant]?.floors);
  const hasSite = useStore((s) => !!siteOf(s.sites, s.activeVariant));
  const setUi = useStore((s) => s.setUi);
  const sunOpen = usePanelPrefs((s) => s.sunOpen);
  const setPrefs = usePanelPrefs((s) => s.setPrefs);
  const setSun = useStore((s) => s.setSun);
  const measuring = useStore((s) => s.measureTool);
  const chassis = useChassis((s) => s.chassis);
  const walking = useWalk((s) => s.on);
  if (!floors) return null;
  const phone = chassis === "phone";
  const features = FEATURES[chassis];

  const ui = { tab, maxLevel, editFloorId };
  const sorted = floorsByLevel(floors);
  const active = dockFloorActive(ui, floors);
  const showFloors = tab === "3d" ? sorted.length > 0 : !editsSite(mode) && sorted.length > 1;
  const keyOf = (i: number) => (i < 9 ? ` (${i + 1})` : "");
  const activeFloor = sorted.find((f) => f.id === active)?.name ?? "";
  const activeName = active === "all" ? "All" : floorDisplayName(activeFloor);

  if (walking) {
    return (
      <>
        <div className="dock float-card" role="group" aria-label="Walking" data-walking>
          <WalkBar />
        </div>
        <WalkMap />
        <WalkHint />
      </>
    );
  }

  const startWalk = () => {
    useWalk.getState().requestWalk({ kind: "front" });
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <div className="dock float-card" role="group" aria-label="View">
      <div className="seg" role="group" aria-label="Plan or 3D">
        <button className={tab === "plan" ? "active" : ""} aria-pressed={tab === "plan"} title="Plan (Tab)" onClick={() => setUi(tabSwitchPatch(ui, floors, "plan"))}>
          Plan
        </button>
        <button className={tab === "3d" ? "active" : ""} aria-pressed={tab === "3d"} title="3D (Tab)" onClick={() => setUi(tabSwitchPatch(ui, floors, "3d"))}>
          3D
        </button>
      </div>

      {showFloors && phone && (
        <Popover className="dock-floors" align="start" label={(active === "all" ? "All" : floorShortName(activeFloor)) || "Floor"} title="Floor" ariaLabel={`Floor: ${activeName}`}>
          <div className="compare-rows" role="radiogroup" aria-label="Floor">
            {tab === "3d" && (
              <button data-pick role="radio" aria-checked={active === "all"} className="compare-row" onClick={() => setUi(dockFloorPick(ui, floors, "all"))}>
                <span className="radio" aria-hidden="true" />
                All
              </button>
            )}
            {sorted.map((f) => (
              <button key={f.id} data-pick role="radio" aria-checked={active === f.id} className="compare-row" onClick={() => setUi(dockFloorPick(ui, floors, f.id))}>
                <span className="radio" aria-hidden="true" />
                {floorDisplayName(f.name)}
              </button>
            ))}
          </div>
        </Popover>
      )}
      {showFloors && !phone && (
        <div className="seg" role="group" aria-label="Floor">
          {tab === "3d" && (
            <button className={active === "all" ? "active" : ""} aria-pressed={active === "all"} title="All floors (0)" onClick={() => setUi(dockFloorPick(ui, floors, "all"))}>
              All
            </button>
          )}
          {sorted.map((f, i) => (
            <button key={f.id} className={active === f.id ? "active" : ""} aria-pressed={active === f.id} title={`${floorDisplayName(f.name)}${keyOf(i)}`} onClick={() => setUi(dockFloorPick(ui, floors, f.id))}>
              {floorDisplayName(f.name)}
            </button>
          ))}
        </div>
      )}

      {tab === "3d" && (
        <>
          <span className="dock-sep" aria-hidden="true" />
          <button
            className={sunOpen ? "icon-btn active" : "icon-btn"}
            aria-label="Sun study"
            aria-pressed={sunOpen}
            disabled={!hasSite}
            title={hasSite ? "Sun study" : "Add a plot under Plot to use the sun study"}
            onClick={() => {
              // Opening the panel turns the sun on; closing it turns it off.
              setSun({ enabled: !sunOpen });
              setPrefs({ sunOpen: !sunOpen });
            }}
          >
            <Icon name="sun" />
          </button>
          <Popover className="dock-view" align={phone ? "end" : undefined} label={phone ? <Icon name="eye" /> : "Show"} chevron={!phone} ariaLabel="Show options" title={phone ? "Show options" : undefined}>
            <ViewToggles />
          </Popover>
          {!phone && <CaptureMenu compact={chassis === "tablet"} />}
          <button
            className={measuring ? "icon-btn active" : "icon-btn"}
            aria-label="Measure"
            aria-pressed={measuring}
            title={measuring ? "Measuring: click two points (Esc to clear, M to stop)" : "Measure (M)"}
            onClick={() => setUi({ measureTool: !measuring })}
          >
            <Icon name="measure" />
          </button>
          <button className={phone ? "icon-btn" : "walk-start"} aria-label="Walk through the house" title="Walk through the house · Esc to stop" onClick={startWalk}>
            <Icon name="walk" />
            {!phone && "Walk"}
          </button>
          {features.savedViews && <SavedViewsMenu />}
        </>
      )}
    </div>
  );
}
