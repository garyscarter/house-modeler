import { useStore } from "../store";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { downloadBlob, fileDate, slug } from "../lib/export";
import { downloadPrefix } from "../lib/brand";
import { houseName } from "../lib/studio";
import { siteOf } from "../lib/sites";
import { scheduleCsv, wiringGuideHtml } from "../lib/wiringGuide";

/**
 * Save the wiring guide of the Proposed layout (the active one when there is no Proposed) as
 * `${prefix}-wiring-guide-${date}.html` or `.csv`. One entry point for the Electrics panel and Review.
 * Dua Lipa may add the report font and a print window (like ReportPanel's print); the signature stays.
 */
export async function exportWiringGuide(kind: "html" | "csv"): Promise<string | void> {
  const s = useStore.getState();
  const key: VariantKey = s.variants.proposed ? "proposed" : s.activeVariant;
  const model = s.variants[key];
  if (!model) return "Load a house first.";
  const date = fileDate();
  const prefix = downloadPrefix(slug(houseName(model)));
  if (kind === "csv") {
    downloadBlob(new Blob(["﻿" + scheduleCsv(model)], { type: "text/csv;charset=utf-8" }), `${prefix}-wiring-guide-${date}.csv`);
    return;
  }
  const html = wiringGuideHtml({ date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), houseName: houseName(model), variantLabel: VARIANT_LABEL[key], model, site: siteOf(s.sites, key) });
  downloadBlob(new Blob([html], { type: "text/html" }), `${prefix}-wiring-guide-${date}.html`);
}
