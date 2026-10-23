import { useModel, useSite, useStore } from "../store";
import { exteriorSummary, siteSummary } from "../lib/modeSummary";
import { Section } from "./Section";
import { SitePanel } from "./SitePanel";
import { ExteriorPanel } from "./ExteriorPanel";

/** Plot mode: the site (plot, orientation, neighbours, garden) and the house's exterior. */
export function PlotPanel() {
  const site = useSite();
  const model = useModel();
  const activeVariant = useStore((s) => s.activeVariant);
  return (
    <div className="plot-panel">
      <Section id="plot.site" title="Site" summary={siteSummary(site)} defaultOpen>
        <SitePanel />
      </Section>
      {model && (
        <Section id="plot.exterior" title="Exterior" summary={exteriorSummary(model)}>
          <ExteriorPanel variant={activeVariant} />
        </Section>
      )}
    </div>
  );
}
