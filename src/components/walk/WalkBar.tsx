import { useStore } from "../../store";
import { useWalk } from "../../walkStore";
import { VARIANT_LABEL } from "../../types";
import { ADAPT_READY } from "../../lib/walkExposure";
import { STEP_READY } from "../../lib/walkStep";
import { DEFAULT_LENS, EYE_HEIGHT, eyeHeightOf, WALK_LENS_CHOICES, walkAdaptOf, walkLensOf, walkStepOf } from "../../lib/walkTypes";
import { floorDisplayName, floorsByLevel } from "../../lib/studio";
import { useChassis } from "../useChassis";
import { Popover } from "../ViewMenu";
import { Icon } from "../icons";
import { Loader } from "../Loader";
import "./walk.css";

/** The dock while walking: stop, where you are, tour, flip layouts, eye height and lens, and the map toggle. */
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
  const choice = useStore((s) => walkLensOf(s.settings));
  const adapt = useStore((s) => walkAdaptOf(s.settings));
  const step = useStore((s) => walkStepOf(s.settings));
  const lens = useWalk((s) => s.lens);
  const setSettings = useStore((s) => s.setSettings);
  const walk = useWalk.getState;

  const floor = where && floors ? floorsByLevel(floors).find((f) => f.level === where.level) : undefined;
  const floorName = floor ? floorDisplayName(floor.name) : "";
  const place = where ? (where.outside ? "Outside" : where.roomName) : null;
  const readout = [place, where?.outside ? null : floorName].filter(Boolean).join(" · ");
  const other = activeVariant === "current" ? "proposed" : "current";
  const eyeText = `Eye ${eye.toFixed(2)} m · ${Math.round(lens?.hfov ?? 90)}°`;
  // A phone held upright keeps the walk steady: no natural step there. Reduced motion turns it off everywhere.
  const upright = lens?.cls === "small" && lens.w < lens.h;
  const reduced = (() => {
    try {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    } catch {
      return false;
    }
  })();
  const stepOff = !STEP_READY || reduced;
  const stepTitle = reduced ? "Off while your device asks for reduced motion" : !STEP_READY ? "Coming next" : "Gentle head motion as you walk";

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

      <Popover className="walk-eye" label={phone ? <Icon name="eye" /> : eyeText} chevron={!phone} ariaLabel={eyeText} title="Eye height and lens">
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
          <div className="walk-eye-row">
            <span>Lens</span>
            <output>{Math.round(lens?.hfov ?? 90)}° across</output>
          </div>
          <div className="seg walk-lens" role="group" aria-label="Lens">
            {WALK_LENS_CHOICES.map((l) => {
              const deg = Math.round(lens?.options[l.id] ?? 90);
              return (
                <button
                  key={l.id}
                  className={l.id === choice ? "active" : undefined}
                  aria-pressed={l.id === choice}
                  title={`${deg}° across on this screen${l.id === DEFAULT_LENS ? " (default)" : ""}`}
                  onClick={() => setSettings({ walkLens: l.id })}
                >
                  <span>{l.label}</span>
                  <small>{deg}°</small>
                </button>
              );
            })}
          </div>
          <p className="walk-help">Your eyes do the focusing: a real room is sharp beyond about 1.5 m, so the view stays sharp.</p>
          <div className="walk-eye-adapt" data-ready={String(ADAPT_READY)}>
            <div className="walk-eye-row">
              <span>Eyes adjust</span>
            </div>
            <div className="seg walk-adapt" role="group" aria-label="Eyes adjust">
              {(["off", "natural", "strong"] as const).map((id) => (
                <button key={id} className={id === adapt ? "active" : undefined} aria-pressed={id === adapt} disabled={!ADAPT_READY} title={ADAPT_READY ? undefined : "Coming next"} onClick={() => setSettings({ walkAdapt: id })}>
                  {id === "off" ? "Off" : id === "natural" ? "Natural" : "Strong"}
                </button>
              ))}
            </div>
          </div>
          {!upright && (
            <label className="check walk-eye-step" data-ready={String(STEP_READY)} title={stepTitle}>
              <input type="checkbox" checked={step === "natural"} disabled={stepOff} onChange={(e) => setSettings({ walkStep: e.target.checked ? "natural" : "off" })} /> Natural step
            </label>
          )}
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
