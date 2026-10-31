import { useEffect } from "react";
import { useStore } from "../store";
import { usePanelPrefs } from "./panelPrefs";
import { Icon } from "./icons";
import { useChassis } from "./useChassis";
import "./Welcome.css";

/**
 * One line of first hints, centred just under the top islands, shown once after a house loads. The × dismisses it,
 * and so does the first time a room is selected or the mode changes (it has done its job by then).
 */
export function CoachStrip() {
  const done = usePanelPrefs((s) => s.coachDone);
  const setPrefs = usePanelPrefs((s) => s.setPrefs);
  const tab = useStore((s) => s.tab);
  const comparing = useStore((s) => s.viewMode !== "single");
  const both = useStore((s) => !!s.variants.current && !!s.variants.proposed);
  const chassis = useChassis((s) => s.chassis);
  const touch = useChassis((s) => s.touch);

  useEffect(() => {
    if (done) return;
    return useStore.subscribe((s, prev) => {
      if ((s.selectedRoomId && s.selectedRoomId !== prev.selectedRoomId) || s.mode !== prev.mode) usePanelPrefs.getState().setPrefs({ coachDone: true });
    });
  }, [done]);

  // The compare style segment takes this spot while comparing.
  if (done || tab !== "3d" || chassis === "phone" || comparing) return null;
  const text = both && !touch ? "Try Decorate to change finishes · hold Space to flip between As listed and Proposed" : "Try Decorate to change finishes";
  return (
    <div className="coach-strip float-card" role="region" aria-label="Getting started">
      <span>{text}</span>
      <button className="icon-btn" onClick={() => setPrefs({ coachDone: true })} aria-label="Dismiss getting started" title="Dismiss">
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
