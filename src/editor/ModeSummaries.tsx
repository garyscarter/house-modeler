import { useMemo } from "react";
import type { Floor, VariantKey } from "../types";
import { buildSummary, decorateSummary, furnishSummary } from "../lib/modeSummary";
import { byId } from "../lib/catalogue";
import { fixtureSolids, overlappingIds } from "../lib/planMath";
import { FloorSettings } from "./Inspectors";

/** How many furniture items on the floor overlap another (the plan's red outlines). */
export function useClashCount(floor: Floor): number {
  const fixtures = floor.fixtures;
  return useMemo(() => overlappingIds(fixtureSolids(fixtures ?? [], floor.pxPerM, byId), 0.5).size, [fixtures, floor.pxPerM]);
}

/** Build, nothing selected: a line about the floor, then its settings and stairs. */
export function BuildSummary({ variant, floor }: { variant: VariantKey; floor: Floor }) {
  return (
    <div className="mode-summary">
      <p className="summary-line">{buildSummary(floor)}</p>
      <FloorSettings variant={variant} floor={floor} />
    </div>
  );
}

/** Decorate, nothing selected. */
export function DecorateSummary({ floor }: { floor: Floor }) {
  return (
    <div className="mode-summary">
      <p className="summary-line">{decorateSummary(floor)}</p>
      <p className="muted small">Tap a floor or a wall to decorate it.</p>
    </div>
  );
}

/** Furnish, nothing selected: what is on the floor, with Add (and Paste when something is copied). */
export function FurnishSummary({ floor, clashes, onAdd, onPaste }: { floor: Floor; clashes: number; onAdd?: () => void; onPaste?: () => void }) {
  return (
    <div className="mode-summary">
      <p className="summary-line">{furnishSummary(floor, clashes)}</p>
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
    </div>
  );
}
