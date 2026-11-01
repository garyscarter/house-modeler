import { useState } from "react";
import { useStore } from "../store";
import { useCaptureIds } from "../three/captureRegistry";
import { captureLabel, filePrefix, renderStill, saveSnapshots } from "./captureActions";
import { Icon } from "./icons";
import { Loader } from "./Loader";
import { Popover } from "./ViewMenu";
import { openReview } from "./reviewState";

/** The dock's Capture popover: save a PNG of the 3D view, at double size, or open a path-traced Render. */
export function CaptureMenu({ compact }: { compact?: boolean }) {
  const variants = useStore((s) => s.variants);
  const active = useStore((s) => s.activeVariant);
  const ids = useCaptureIds();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const snap = async (scaleBy: number) => {
    setBusy(scaleBy);
    setError(null);
    try {
      await saveSnapshots({ ids, active, scaleBy, stamp: false, prefix: filePrefix(variants, active) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const none = ids.length === 0;

  return (
    <Popover className="dock-capture" label={compact ? <Icon name="camera" /> : <><Icon name="camera" />Capture</>} chevron={!compact} ariaLabel="Capture" title="Capture: snapshot or render the 3D view">
      <div className="capture-menu">
        <button onClick={() => void snap(1)} disabled={none || busy !== null}>
          {busy === 1 ? <><Loader kind="lift" size={14} />Saving…</> : "Snapshot (PNG)"}
        </button>
        <button onClick={() => void snap(2)} disabled={none || busy !== null}>
          {busy === 2 ? <><Loader kind="lift" size={14} />Saving…</> : "Snapshot 2× (PNG)"}
        </button>
        {ids.map((id) => (
          <button key={id} onClick={() => renderStill(id, active, false)} disabled={busy !== null} title="A path-traced still of the view as it is now">
            {ids.length > 1 ? `Render ${captureLabel(id, active)}` : "Render"}
          </button>
        ))}
        {error && <p className="small capture-error" role="alert">{error}</p>}
        <button className="capture-more" onClick={() => openReview("exports")}>
          More exports…
        </button>
      </div>
    </Popover>
  );
}
