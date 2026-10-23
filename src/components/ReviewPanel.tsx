import { useStore, type ViewMode } from "../store";
import { usePanelPrefs } from "./panelPrefs";
import { ReportPanel } from "./ReportPanel";
import { PlanningPanel } from "./PlanningPanel";

const COMPARE: [ViewMode, string][] = [
  ["single", "Single"],
  ["side-by-side", "Side by side"],
  ["overlay", "Overlay"],
];

/** Review mode: the report and the planning check, with the As listed vs Proposed comparison on the 3D view. */
export function ReviewPanel() {
  const tab = usePanelPrefs((s) => s.reviewTab);
  const setPrefs = usePanelPrefs((s) => s.setPrefs);
  const model = useStore((s) => !!s.variants[s.activeVariant]);
  const both = useStore((s) => !!s.variants.current && !!s.variants.proposed);
  const viewMode = useStore((s) => s.viewMode);
  const onViewer = useStore((s) => s.tab === "3d");
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="review-panel">
      <div className="seg review-tabs" role="group" aria-label="Review">
        <button className={tab === "report" ? "active" : ""} onClick={() => setPrefs({ reviewTab: "report" })}>
          Report
        </button>
        <button className={tab === "planning" ? "active" : ""} onClick={() => setPrefs({ reviewTab: "planning" })}>
          Planning check
        </button>
      </div>
      {onViewer && both && (
        <div className="review-compare">
          <span className="muted small">Compare</span>
          <div className="seg" role="group" aria-label="Compare">
            {COMPARE.map(([k, label]) => (
              <button key={k} className={viewMode === k ? "active" : ""} onClick={() => setUi({ viewMode: k })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {model && (tab === "report" ? <ReportPanel /> : <PlanningPanel />)}
      {!model && <p className="muted small">Load a house to see its report.</p>}
    </div>
  );
}
