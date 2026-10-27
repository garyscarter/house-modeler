import { useStore } from "../store";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { downloadBlob, fileDate, slug } from "../lib/export";
import { downloadPrefix } from "../lib/brand";
import { houseName } from "../lib/studio";
import { siteOf } from "../lib/sites";
import { scheduleCsv, wiringGuideHtml } from "../lib/wiringGuide";

/** The report embeds the display font so it looks right offline; loaded only when a report or guide is made. */
export const reportFontCss = async () => {
  const { default: woff2 } = await import("@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?inline");
  return `@font-face{font-family:"Bricolage Grotesque Variable";src:url(${woff2}) format("woff2");font-weight:200 800}`;
};

/**
 * The wiring guide of the Proposed layout (the active one when there is no Proposed). "csv" saves
 * `${prefix}-wiring-guide-${date}.csv`; "html" opens a print window (opened inside the click, so call this from a
 * click handler) and falls back to saving `${prefix}-wiring-guide-${date}.html` when pop-ups are blocked.
 * One entry point for the Electrics panel and Review.
 */
export async function exportWiringGuide(kind: "html" | "csv"): Promise<string | void> {
  // Open the window before any await, or pop-up blockers stop it.
  const w = kind === "html" ? window.open("", "_blank") : null;
  const s = useStore.getState();
  const key: VariantKey = s.variants.proposed ? "proposed" : s.activeVariant;
  const model = s.variants[key];
  if (!model) {
    w?.close();
    return "Load a house first.";
  }
  const date = fileDate();
  const prefix = downloadPrefix(slug(houseName(model)));
  if (kind === "csv") {
    downloadBlob(new Blob(["\ufeff" + scheduleCsv(model)], { type: "text/csv;charset=utf-8" }), `${prefix}-wiring-guide-${date}.csv`);
    return;
  }
  const html = wiringGuideHtml({
    date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    houseName: houseName(model),
    variantLabel: VARIANT_LABEL[key],
    model,
    site: siteOf(s.sites, key),
    fontCss: await reportFontCss(),
  });
  if (!w) {
    downloadBlob(new Blob([html], { type: "text/html" }), `${prefix}-wiring-guide-${date}.html`);
    return "Pop-ups are blocked, so the wiring guide was saved as a web page instead. Open it and print from there.";
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
