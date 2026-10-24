import { useMemo } from "react";
import type { Floor, VariantKey } from "../types";
import { buildStats, decorateSummary, furnishSummary } from "../lib/modeSummary";
import { Info } from "../components/Info";
import { byId } from "../lib/catalogue";
import { fixtureSolids, overlappingIds } from "../lib/planMath";
import { FloorSettings, NumberField } from "./Inspectors";
import { Section } from "../components/Section";
import { useStore } from "../store";
import { MyFurnitureList } from "./MyFurniture";

/** How many furniture items on the floor overlap another (the plan's red outlines). */
export function useClashCount(floor: Floor): number {
  const fixtures = floor.fixtures;
  return useMemo(() => overlappingIds(fixtureSolids(fixtures ?? [], floor.pxPerM, byId), 0.5).size, [fixtures, floor.pxPerM]);
}

/** Build, nothing selected: what to do, the floor at a glance, then the house and floor settings. */
export function BuildSummary({ variant, floor }: { variant: VariantKey; floor: Floor }) {
  const ceilingHeight = useStore((s) => s.variants[variant]?.ceilingHeight);
  const updateModel = useStore((s) => s.updateModel);
  const stats = buildStats(floor);
  return (
    <div className="mode-summary">
      <p className="instruction">
        {floor.rooms.length ? (
          <>
            Click a room to check its size, or draw one with <kbd className="keycap">R</kbd>
          </>
        ) : (
          <>
            No rooms yet. Draw one with <kbd className="keycap">R</kbd>
          </>
        )}
      </p>
      {stats.length > 0 && (
        <div className="stat-row" aria-label="This floor">
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
      <FloorSettings variant={variant} floor={floor} />
    </div>
  );
}

/** Decorate, nothing selected. */
export function DecorateSummary({ floor }: { floor: Floor }) {
  return (
    <div className="mode-summary">
      <p className="instruction">Click a floor, or a wall near its edge, to decorate it.</p>
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
