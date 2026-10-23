import { useStore } from "../store";
import { MODES, MODE_LABEL } from "../lib/modes";

/** The five modes, as a pill in the middle of the top bar. */
export function ModeBar() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  return (
    <nav className="mode-bar seg" aria-label="Mode">
      {MODES.map((m) => (
        <button key={m} data-mode={m} className={mode === m ? "active" : ""} aria-current={mode === m ? "page" : undefined} title={`${MODE_LABEL[m]} mode`} onClick={() => setMode(m)}>
          {MODE_LABEL[m]}
        </button>
      ))}
    </nav>
  );
}
