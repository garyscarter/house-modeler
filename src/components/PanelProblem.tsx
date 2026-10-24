import { BrandMark } from "./BrandMark";
import { errorText } from "./Recovery";
import "./Recovery.css";

/** Card shown in place of a panel (the 3D view, the plan) whose drawing threw. */
export function PanelProblem({ title, button, error, reset }: { title: string; button: string; error: unknown; reset: () => void }) {
  return (
    <div className="panel-problem" role="alert">
      <BrandMark outline size={48} />
      <h3>{title}</h3>
      <p className="muted small recovery-error">{errorText(error)}</p>
      <button className="primary" onClick={reset}>
        {button}
      </button>
    </div>
  );
}
