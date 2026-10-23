import { useStore } from "../store";
import { SIDE_AZIMUTH, type ViewSide } from "../lib/cameraViews";
import { Icon } from "../components/icons";
import { useSunInfo } from "./useSun";
import { requestView } from "./viewRequest";
import "./ViewCube.css";

const SHORT: Record<Exclude<ViewSide, "top">, string> = { front: "F", rear: "B", left: "L", right: "R" };
const MARKS: [string, number][] = [
  ["N", 0],
  ["E", 90],
  ["S", 180],
  ["W", 270],
];

/**
 * Compass ring, four faces, a top button and a home button, bottom-right of a
 * 3D view. The compass marks sit on an outer ring that turns with the camera's
 * bearing (--view-bearing); the faces sit inside it, toward their side of the
 * house as seen from the camera (--view-yaw). Both variables are kept up to
 * date by the 3D scene so orbiting doesn't re-render React. Every click goes
 * out through requestView, so linked views move together.
 */
export function ViewCube() {
  const sun = useStore((s) => s.sun);
  const info = useSunInfo();
  const sunAzimuth = sun.enabled && info && info.position.altitude > 0 ? info.position.azimuth : null;

  return (
    <div className="view-cube float-card">
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
          onClick={() => requestView(side)}
          aria-label={`Look at the ${side}`}
          title={`Look at the ${side}`}
        >
          {SHORT[side]}
        </button>
      ))}
      <button className="vc-top" onClick={() => requestView("top")} aria-label="Look at the top" title="Look from above">
        Top
      </button>
      <button className="vc-home" onClick={() => requestView("home")} aria-label="Home view" title="Home view">
        <Icon name="house" size={14} />
      </button>
    </div>
  );
}
