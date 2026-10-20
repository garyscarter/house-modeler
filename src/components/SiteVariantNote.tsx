import { useStore } from "../store";
import { siteSource } from "../lib/sites";
import { VARIANT_LABEL } from "../types";

/**
 * Which layout's plot the Site panel and site plan are editing. Shown only
 * when there are two layouts, since only then can their plots differ.
 */
export function SiteVariantNote() {
  const active = useStore((s) => s.activeVariant);
  const both = useStore((s) => !!s.variants.current && !!s.variants.proposed);
  const source = useStore((s) => siteSource(s.sites, s.activeVariant));
  const proposedBorrows = useStore((s) => siteSource(s.sites, "proposed") === "current");
  if (!both || !source) return null;
  const text =
    source !== active
      ? `Proposed is using the plot for ${VARIANT_LABEL[source]}. Your first change here gives Proposed its own copy; ${VARIANT_LABEL[source]} keeps its own.`
      : active === "proposed"
        ? "Editing the plot for Proposed. As listed keeps its own."
        : proposedBorrows
          ? "Editing the plot for As listed. Proposed uses it too until you change Proposed's plot."
          : "Editing the plot for As listed. Proposed keeps its own.";
  return <p className="note small site-variant-note">{text}</p>;
}
