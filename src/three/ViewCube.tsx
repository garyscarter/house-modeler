import { useEffect } from "react";
import { useStore } from "../store";
import { SIDE_AZIMUTH, type ViewRequest, type ViewSide } from "../lib/cameraViews";
import { useSunInfo } from "./useSun";
import "./ViewCube.css";

/** Ask every 3D view to look at a side or go home; the same as clicking that face of the view cube. */
export function requestView(side: ViewRequest) {
  window.dispatchEvent(new CustomEvent("house:view", { detail: { side } }));
}

const SIDES: ViewRequest[] = ["front", "rear", "left", "right", "top", "home"];
const SHORT: Record<Exclude<ViewSide, "top">, string> = { front: "Fr", rear: "Rr", left: "Lt", right: "Rt" };
const MARKS: [string, number][] = [
  ["N", 0],
  ["E", 90],
  ["S", 180],
  ["W", 270],
];

/**
 * Compass ring, five faces and a home button, bottom-right of a viewer. The
 * ring turns with the camera's bearing (--view-bearing) and the faces sit
 * toward their side of the house as seen from the camera (--view-yaw), both
 * kept up to date by the 3D scene so orbiting doesn't re-render React.
 */
export function ViewCube({ onView }: { onView: (side: ViewRequest) => void }) {
  const sun = useStore((s) => s.sun);
  const info = useSunInfo();
  const sunAzimuth = sun.enabled && info && info.position.altitude > 0 ? info.position.azimuth : null;

  useEffect(() => {
    const on = (e: Event) => {
      const side = (e as CustomEvent<{ side?: ViewRequest }>).detail?.side;
      if (side && SIDES.includes(side)) onView(side);
    };
    window.addEventListener("house:view", on);
    return () => window.removeEventListener("house:view", on);
  }, [onView]);

  return (
    <div className="view-cube">
      <div className="vc-ring" aria-hidden>
        {MARKS.map(([l, a]) => (
          <span key={l} className={`vc-mark${l === "N" ? " north" : ""}`} style={{ "--a": a } as React.CSSProperties}>
            {l}
          </span>
        ))}
        {sunAzimuth !== null && <span className="vc-sun" style={{ "--a": sunAzimuth } as React.CSSProperties} />}
      </div>
      {(Object.keys(SIDE_AZIMUTH) as Exclude<ViewSide, "top">[]).map((side) => (
        <button
          key={side}
          className="vc-face"
          style={{ "--s": SIDE_AZIMUTH[side] } as React.CSSProperties}
          onClick={() => onView(side)}
          aria-label={`Look at the ${side}`}
          title={`Look at the ${side}`}
        >
          <span>{SHORT[side]}</span>
        </button>
      ))}
      <button className="vc-top" onClick={() => onView("top")} aria-label="Look at the top" title="Look at the top">
        Top
      </button>
      <button className="vc-home" onClick={() => onView("home")} aria-label="Home view" title="Home view">
        ⌂
      </button>
    </div>
  );
}
