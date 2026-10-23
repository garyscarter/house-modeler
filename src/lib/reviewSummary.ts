import type { AreaReport, CostEstimate } from "./report";
import { fmtDelta, fmtGBP, fmtM2 } from "./report";
import type { PlanningCheck } from "./planning";
import type { VariantKey } from "../types";
import { VARIANT_LABEL } from "../types";

export interface HouseTile {
  /** "112.4 m² → 139.5 m²", or one layout's area. */
  line: string;
  /** "+27.1 m²" when both layouts exist. */
  delta?: string;
}

export function houseTile(report: AreaReport): HouseTile {
  const { current, proposed } = report;
  if (current !== undefined && proposed !== undefined) {
    return {
      line: `${fmtM2(current)} m² → ${fmtM2(proposed)} m²`,
      delta: `${fmtDelta(proposed - current)} m²`,
    };
  }
  const only = current ?? proposed;
  return { line: only === undefined ? "–" : `${fmtM2(only)} m²` };
}

export interface CostTile {
  kind: "none" | "total" | "partial";
  /** Headline figure or call to action. */
  label: string;
  detail?: string;
}

/** The cost tile: the total once every priced line has a rate, a partial figure if some rates are missing, otherwise a nudge. */
export function costTile(estimate?: CostEstimate): CostTile {
  if (!estimate || !estimate.lines.length) return { kind: "none", label: "Add your rates", detail: "Nothing to price yet" };
  const priced = estimate.lines.filter((l) => l.total !== undefined).length;
  if (priced === 0) return { kind: "none", label: "Add your rates", detail: "Enter local quotes to get a rough total" };
  if (estimate.missing.length > 0) {
    return {
      kind: "partial",
      label: `${fmtGBP(estimate.total)} so far`,
      detail: `${estimate.missing.length} line${estimate.missing.length > 1 ? "s" : ""} still without a rate`,
    };
  }
  return { kind: "total", label: fmtGBP(estimate.total), detail: "Rough estimate incl. contingency" };
}

export type PlanningTone = "bad" | "warn" | "good" | "neutral";

export interface PlanningTile {
  label: string;
  tone: PlanningTone;
}

export function planningTile(check?: PlanningCheck): PlanningTile {
  if (!check) return { label: "Needs a Proposed layout", tone: "neutral" };
  switch (check.verdict) {
    case "permission":
      return { label: "Needs planning permission", tone: "bad" };
    case "prior":
      return { label: "Permitted development, after prior approval", tone: "warn" };
    case "pd":
      return { label: "Permitted development", tone: "good" };
    default:
      return { label: "No building work found", tone: "neutral" };
  }
}

/** "Listing 91770873 · As listed → Proposed", or just the one layout's name. */
export function reviewSubtitle(present: VariantKey[]): string {
  const names = present.map((k) => VARIANT_LABEL[k]);
  return `Listing 91770873 · ${names.length ? names.join(" → ") : "No layout loaded"}`;
}
