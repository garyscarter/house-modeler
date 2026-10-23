import { useMemo } from "react";
import type { Floor, VariantKey } from "../types";
import { buildSummary, decorateSummary, furnishSummary } from "../lib/modeSummary";
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

/** Build, nothing selected: a line about the floor, then its settings and stairs. */
export function BuildSummary({ variant, floor }: { variant: VariantKey; floor: Floor }) {
  const ceilingHeight = useStore((s) => s.variants[variant]?.ceilingHeight);
  const updateModel = useStore((s) => s.updateModel);
  const updateFloor = useStore((s) => s.updateFloor);
  const allLocked = floor.rooms.length > 0 && floor.rooms.every((r) => r.locked);
  return (
    <div className="mode-summary">
      <p className="summary-line">{buildSummary(floor)}</p>
      {floor.rooms.length > 0 && (
        <div className="row">
          <button
            title="Locked rooms keep their corners and size when you drag on the plan"
            onClick={() => updateFloor(variant, floor.id, (f) => ({ ...f, rooms: f.rooms.map((r) => ({ ...r, locked: allLocked ? undefined : true })) }))}
          >
            {allLocked ? "Unlock all rooms" : "Lock all rooms"}
          </button>
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
      <p className="summary-line">{decorateSummary(floor)}</p>
      <p className="muted small">Click a floor, or a wall near its edge, to decorate it.</p>
    </div>
  );
}

/** Furnish, nothing selected: what is on the floor, with Add (and Paste when something is copied). */
export function FurnishSummary({ floor, clashes, onAdd, onPaste }: { floor: Floor; clashes: number; onAdd?: () => void; onPaste?: () => void }) {
  return (
    <div className="mode-summary">
      <p className="summary-line">{furnishSummary(floor, clashes)}</p>
      {onAdd && <p className="muted small">Shift+click adds items to the selection; Ctrl/⌘+G groups them so they move together.</p>}
      {(onAdd || onPaste) && (
        <div className="row">
          {onAdd && (
            <button className="primary big" onClick={onAdd}>
              Add furniture
            </button>
          )}
          {onPaste && <button onClick={onPaste}>Paste</button>}
        </div>
      )}
      <MyFurnitureList />
    </div>
  );
}
