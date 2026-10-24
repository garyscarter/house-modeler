import { useStore } from "../store";
import { usePanelPrefs } from "./panelPrefs";
import { Icon } from "./icons";
import "./Welcome.css";

/** Three first steps above the dock, shown once after a house loads; the × remembers it was dismissed. */
export function CoachStrip() {
  const done = usePanelPrefs((s) => s.coachDone);
  const setPrefs = usePanelPrefs((s) => s.setPrefs);
  const tab = useStore((s) => s.tab);
  const both = useStore((s) => !!s.variants.current && !!s.variants.proposed);
  if (done || tab !== "3d") return null;
  const steps = ["Click a room to check its size", "Decorate to try finishes", ...(both ? ["Hold Space to flip between As listed and Proposed"] : [])];
  return (
    <div className="coach-strip float-card" role="region" aria-label="Getting started">
      <ol className="coach-steps">
        {steps.map((s, i) => (
          <li key={s}>
            <span className="coach-num" aria-hidden="true">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      <button className="icon-btn" onClick={() => setPrefs({ coachDone: true })} aria-label="Dismiss getting started" title="Dismiss">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
