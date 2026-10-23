import { useStore } from "../store";
import { MODES, MODE_LABEL } from "../lib/modes";

/** The five modes, as a bar under the header (a tab bar at the bottom on phones). */
export function ModeBar() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  return (
    <nav className="mode-bar seg" aria-label="Mode">
      {MODES.map((m) => (
        <button key={m} data-mode={m} className={mode === m ? "active" : ""} aria-current={mode === m ? "page" : undefined} onClick={() => setMode(m)}>
          {MODE_LABEL[m]}
        </button>
      ))}
    </nav>
  );
}
