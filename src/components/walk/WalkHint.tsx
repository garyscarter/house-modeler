import { useEffect } from "react";
import { useWalk } from "../../walkStore";

/** A short message at the top centre ("Click the floor to walk there"), gone after its time. */
export function WalkHint() {
  const hint = useWalk((s) => s.hint);
  const id = hint?.id;
  const ms = hint?.ms;
  useEffect(() => {
    if (id === undefined) return;
    const t = window.setTimeout(() => {
      if (useWalk.getState().hint?.id === id) useWalk.getState().clearHint();
    }, ms ?? 3500);
    return () => window.clearTimeout(t);
  }, [id, ms]);
  if (!hint) return null;
  return (
    <div key={hint.id} className="walk-hint" role="status">
      {hint.text}
    </div>
  );
}
