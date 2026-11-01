import { useMemo } from "react";
import type { Floor, VariantKey } from "../types";
import { buildStats, decorateSummary, furnishSummary, houseStats } from "../lib/modeSummary";
import { floorDisplayName } from "../lib/studio";
import { Info } from "../components/Info";
import { byId } from "../lib/catalogue";
import { fixtureSolids, overlappingIds } from "../lib/planMath";
import { FloorSettings, NumberField } from "./inspectors";
import { Section } from "../components/Section";
import { useStore } from "../store";
import { MyFurnitureList } from "./MyFurniture";
import { useChassis } from "../components/useChassis";
import { FEATURES } from "../lib/chassis";

/** How many furniture items on the floor overlap another (the plan's red outlines). */
export function useClashCount(floor: Floor): number {
  const fixtures = floor.fixtures;
  return useMemo(() => overlappingIds(fixtureSolids(fixtures ?? [], floor.pxPerM, byId), 0.5).size, [fixtures, floor.pxPerM]);
}

/** Build, nothing selected: what to do, the floor at a glance, then the house and floor settings. */
export function BuildSummary({ variant, floor }: { variant: VariantKey; floor: Floor }) {
  const ceilingHeight = useStore((s) => s.variants[variant]?.ceilingHeight);
  const updateModel = useStore((s) => s.updateModel);
  const tab = useStore((s) => s.tab);
  const maxLevel = useStore((s) => s.maxLevel);
  const floors = useStore((s) => s.variants[variant]?.floors);
  const onPlan = tab === "plan";
  // In 3D with every floor showing, the numbers are the whole house; otherwise the floor, named.
  const wholeHouse = !onPlan && maxLevel === null && !!floors && floors.length > 1;
  const stats = wholeHouse ? houseStats(floors) : buildStats(floor);
  const caption = wholeHouse ? "Whole house" : floorDisplayName(floor.name);
  const touch = useChassis((s) => s.touch);
  // Drawing is a plan job: the hint about R belongs on the Plan tab only.
  const draw = useChassis((s) => FEATURES[s.chassis].draw) && onPlan;
  const verb = touch ? "Tap" : "Click";
  return (
    <div className="mode-summary">
      <p className="instruction">
        {floor.rooms.length ? (
          draw ? (
            <>
              {verb} a room to check its size, or draw one with <kbd className="keycap">R</kbd>
            </>
          ) : (
            <>{verb} a room to check its size</>
          )
        ) : draw ? (
          <>
            No rooms yet. Draw one with <kbd className="keycap">R</kbd>
          </>
        ) : onPlan ? (
          <>No rooms yet. Draw one on a tablet or desktop.</>
        ) : (
          <>No rooms yet. Open the Plan to draw one.</>
        )}
      </p>
      {stats.length > 0 && <p className="stat-caption muted small">{caption}</p>}
      {stats.length > 0 && (
        <div className="stat-row" aria-label={caption}>
          {stats.map((st) => (
            <div key={st.label}>
              <b>{st.value}</b>
              <span>{st.label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="inspector">
        <Section id="build.house" title="House" summary={`Ceiling ${(ceilingHeight ?? 0).toFixed(2)} m`}>
          <label>
            Ceiling height (m)
            <NumberField value={ceilingHeight} step={0.05} min={2} max={4} label="Ceiling height" onCommit={(h) => updateModel(variant, { ceilingHeight: h })} />
          </label>
        </Section>
      </div>
      {onPlan && <FloorSettings variant={variant} floor={floor} />}
    </div>
  );
}

/** Decorate, nothing selected. */
export function DecorateSummary({ floor }: { floor: Floor }) {
  const touch = useChassis((s) => s.touch);
  return (
    <div className="mode-summary">
      <p className="instruction">{touch ? "Tap" : "Click"} a floor, or a wall near its edge, to decorate it.</p>
      <p className="muted small">{decorateSummary(floor)}</p>
    </div>
  );
}

/** Furnish, nothing selected: what is on the floor, with one Add button (and Paste when something is copied). */
export function FurnishSummary({ floor, clashes, onAdd, onPaste }: { floor: Floor; clashes: number; onAdd: () => void; onPaste?: () => void }) {
  return (
    <div className="mode-summary">
      <p className="instruction with-info">
        {furnishSummary(floor, clashes)}
        <Info label="Selecting several pieces">Shift+click adds items to the selection; Ctrl/⌘+G groups them so they move together.</Info>
      </p>
      <div className="row">
        <button className="primary big" onClick={onAdd}>
          Add furniture
        </button>
        {onPaste && <button onClick={onPaste}>Paste</button>}
      </div>
      <MyFurnitureList />
    </div>
  );
}
