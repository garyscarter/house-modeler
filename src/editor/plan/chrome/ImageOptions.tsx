import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/icons";
import type { ImageState } from "../../../lib/planMath";
import { IMAGE_STATES } from "../useKeys";

export const IMAGE_STATE_LABEL: Record<ImageState, string> = { off: "Off", faint: "Faint", trace: "Trace" };

/**
 * The floorplan image's rail extra: the chevron and the popover with the image state, its opacity and the
 * real-thickness walls switch. The popover closes on an outside click or Esc.
 */
export function ImageOptions({
  imageState,
  opacity,
  wallsOn,
  onState,
  onOpacity,
  onWalls,
}: {
  imageState: ImageState;
  opacity: number;
  wallsOn: boolean;
  onState: (s: ImageState) => void;
  onOpacity: (o: number) => void;
  onWalls: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!pop.current?.parentElement?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <>
      <button type="button" className="rail-chev" aria-label="Image and wall options" aria-expanded={open} title="Image and wall options" onClick={() => setOpen(!open)}>
        <Icon name="chevronRight" size={10} />
      </button>
      {open && (
        <div className="rail-pop popover" ref={pop}>
          <div className="seg rail-image-state" role="group" aria-label="Floorplan image">
            {IMAGE_STATES.map((st) => (
              <button key={st} type="button" className={st === imageState ? "active" : undefined} aria-pressed={st === imageState} onClick={() => onState(st)}>
                {IMAGE_STATE_LABEL[st]}
              </button>
            ))}
          </div>
          <details className="rail-more">
            <summary>More…</summary>
            <label className="rail-opacity">
              <span>Image opacity</span>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={Math.round(opacity * 100)}
                aria-label="Floorplan image opacity"
                onChange={(e) => onOpacity(Number(e.target.value) / 100)}
              />
              <span className="num">{Math.round(opacity * 100)}%</span>
            </label>
          </details>
          <label className="rail-check" title="Draw the walls at their real thickness, so furniture can be placed against the true wall faces">
            <input type="checkbox" checked={wallsOn} onChange={onWalls} /> Walls at real thickness
          </label>
        </div>
      )}
    </>
  );
}
