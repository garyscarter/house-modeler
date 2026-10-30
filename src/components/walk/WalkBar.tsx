import { useStore } from "../../store";
import { useWalk } from "../../walkStore";
import { VARIANT_LABEL } from "../../types";
import { EYE_HEIGHT, eyeHeightOf } from "../../lib/walkTypes";
import { floorDisplayName, floorsByLevel } from "../../lib/studio";
import { useChassis } from "../useChassis";
import { Popover } from "../ViewMenu";
import { Icon } from "../icons";
import { Loader } from "../Loader";
import "./walk.css";

/** The dock while walking: stop, where you are, tour, flip layouts, eye height and the map toggle. */
export function WalkBar() {
  const phone = useChassis((s) => s.chassis) === "phone";
  const where = useWalk((s) => s.where);
  const placing = useWalk((s) => s.pending !== null || s.pose === null);
  const tour = useWalk((s) => s.tour.status);
  const showMap = useWalk((s) => s.showMap);
  const activeVariant = useStore((s) => s.activeVariant);
  const both = useStore((s) => !!s.variants.current && !!s.variants.proposed);
  const floors = useStore((s) => s.variants[s.activeVariant]?.floors);
  const eye = useStore((s) => eyeHeightOf(s.settings));
  const setSettings = useStore((s) => s.setSettings);
  const walk = useWalk.getState;

  const floor = where && floors ? floorsByLevel(floors).find((f) => f.level === where.level) : undefined;
  const floorName = floor ? floorDisplayName(floor.name) : "";
  const place = where ? (where.outside ? "Garden" : where.roomName) : null;
  const readout = [place, where?.outside ? null : floorName].filter(Boolean).join(" · ");
  const other = activeVariant === "current" ? "proposed" : "current";
  const eyeText = `Eye ${eye.toFixed(2)} m`;

  return (
    // Every button gives up focus after a click so Space can't press it again.
    <div className="walk-bar" role="toolbar" aria-label="Walking" onClick={(e) => (e.target as HTMLElement).closest("button")?.blur()}>
      <button className="walk-stop" aria-label="Stop walking" title="Stop walking · Esc" onClick={() => walk().stopWalk()}>
        <Icon name="close" size={16} />
        <span className="walk-txt">Stop</span>
      </button>

      {!phone && (
        <span className="walk-where" role="status" aria-live="polite">
          {placing && !where ? (
            <>
              <Loader kind="lift" size={14} />
              Getting in…
            </>
          ) : (
            readout
          )}
        </span>
      )}

      <span className="dock-sep" aria-hidden="true" />

      <div className="walk-tour">
        <button
          className={tour === "playing" ? "walk-btn active" : "walk-btn"}
          aria-label={tour === "playing" ? "Pause tour" : tour === "paused" ? "Resume tour" : "Play tour"}
          aria-pressed={tour === "playing"}
          title={tour === "playing" ? "Pause the tour" : tour === "paused" ? "Carry on with the tour" : "Take the tour: every room, then the garden"}
          onClick={() => (tour === "playing" ? walk().pauseTour() : walk().playTour())}
        >
          <Icon name={tour === "playing" ? "pause" : "play"} size={16} />
          <span className="walk-txt">{tour === "playing" ? "Pause" : tour === "paused" ? "Resume" : "Tour"}</span>
        </button>
        {tour !== "off" && (
          <button className="walk-x" aria-label="End tour" title="End the tour" onClick={() => walk().stopTour()}>
            <Icon name="close" size={12} />
          </button>
        )}
      </div>

      {both && (
        <button
          className="walk-btn walk-flip"
          aria-label={`Flip layout: swap to ${VARIANT_LABEL[other]}`}
          title={`Swap to ${VARIANT_LABEL[other]} · hold Space to peek`}
          onClick={() => walk().flipLayout()}
        >
          <Icon name="flip" size={16} />
          <span className="walk-txt">{VARIANT_LABEL[activeVariant]} ⇄</span>
        </button>
      )}

      <Popover className="walk-eye" label={phone ? <Icon name="eye" /> : eyeText} chevron={!phone} ariaLabel={eyeText} title="Eye height">
        <div className="walk-eye-pop">
          <label className="walk-eye-row">
            <span>Eye height</span>
            <output>{eye.toFixed(2)} m</output>
          </label>
          <input
            type="range"
            aria-label="Eye height"
            min={EYE_HEIGHT.min}
            max={EYE_HEIGHT.max}
            step={EYE_HEIGHT.step}
            value={eye}
            onChange={(e) => setSettings({ eyeHeight: Math.round(Number(e.target.value) * 100) / 100 })}
            onPointerUp={(e) => e.currentTarget.blur()}
          />
          <button className="walk-reset" disabled={eye === EYE_HEIGHT.default} onClick={() => setSettings({ eyeHeight: EYE_HEIGHT.default })}>
            Reset to {EYE_HEIGHT.default.toFixed(1)} m
          </button>
        </div>
      </Popover>

      <button
        className={showMap ? "walk-btn active" : "walk-btn"}
        aria-label="Mini-map"
        aria-pressed={showMap}
        title={showMap ? "Hide the mini-map" : "Show the mini-map"}
        onClick={() => walk().setShowMap(!showMap)}
      >
        <Icon name="map" size={16} />
      </button>
    </div>
  );
}
