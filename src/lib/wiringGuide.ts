import type { Floor, HouseModel, Site } from "../types";
import { esc, toCsv, type PlanFrame } from "./export";
import { numberPoints, pointRows, type NumberedPoint } from "./electrics";

/**
 * The wiring guide for the electrician (Electrics mode and Review): per floor, the scaled plan (export.ts planSvg)
 * with an electrical layer (numbered point symbols, dashed switch-to-light arcs), a legend of the symbols used, the
 * per-room schedule and the totals; and the schedule as CSV, one row per point. Pure strings, like export.ts.
 * Dua Lipa implements the bodies; the signatures are the contract (docs/electrics-plan.md).
 */

export interface WiringGuideInput {
  /** Long date for the title blocks and footer, already formatted. */
  date: string;
  /** "Listing 91770873". */
  houseName?: string;
  /** The layout the guide is of (the Proposed one when it exists), e.g. "Proposed". */
  variantLabel: string;
  model: HouseModel;
  /** For the plans' north arrow. */
  site?: Site;
  /** CSS inserted into the style block (the report's embedded font). */
  fontCss?: string;
}

/** The electrical layer of one floor in a planSvg frame (pass it as PlanSvgOptions.overlay). */
export function electricalLayerSvg(_model: HouseModel, _floor: Floor, _numbered: NumberedPoint[], _frame: PlanFrame): string {
  return "";
}

/** The printable guide: a self-contained HTML page like printHtml's. */
export function wiringGuideHtml(p: WiringGuideInput): string {
  const n = numberPoints(p.model).length;
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(p.houseName ?? "House")} wiring guide</title></head><body><h1>Wiring guide</h1><p>${n} points · ${esc(p.date)}</p></body></html>`;
}

/** The schedule as CSV, one row per point (lib/electrics.ts pointRows). */
export function scheduleCsv(model: HouseModel): string {
  const rows = pointRows(model);
  return toCsv([["Floor", "Room", "Point", "Type", "Quantity", "Height", "Circuit", "Notes"], ...rows.map((r) => [r.floor, r.room, r.label, r.type, r.quantity, r.height, r.circuit, r.notes])]);
}
