import { useEffect, useState } from "react";
import { useStore } from "../store";
import { usePanelPrefs } from "./panelPrefs";
import { Icon } from "./icons";
import { compassPoint, dayOfYear, daysInYear, formatClock, formatDay, sunTimes, ukZone } from "../lib/sun";
import { SUN_YEAR, useSunInfo } from "../three/useSun";
import { useViewedSite, useViewedVariant } from "../three/viewedVariant";
import { useSiteView } from "../three/siteView";
import { SUN_HOURS_GRADIENT, SUN_HOURS_MAX, useSunHours } from "../three/SunHours";
import { shareWithSun } from "../three/sunShare";
import "./SunControls.css";

const QUICK_DATES: [string, number][] = [
  ["21 Mar", dayOfYear(SUN_YEAR, 3, 21)],
  ["21 Jun", dayOfYear(SUN_YEAR, 6, 21)],
  ["21 Sep", dayOfYear(SUN_YEAR, 9, 21)],
  ["21 Dec", dayOfYear(SUN_YEAR, 12, 21)],
];
/** Seconds to play through one day, sunrise to sunset. */
const DAY_SECONDS = 20;

const quarter = (h: number, round: (x: number) => number) => round(h * 4) / 4;

/**
 * Sun study controls overlaid on the 3D view (date, time, play through the
 * day). The compass lives in the view cube. Shown only
 * when a site gives the house a location and orientation.
 */
export function SunControls() {
  const site = useViewedSite();
  const sun = useStore((s) => s.sun);
  const setSun = useStore((s) => s.setSun);
  const info = useSunInfo();
  const open = usePanelPrefs((p) => p.sunOpen);
  const setPrefs = usePanelPrefs((p) => p.setPrefs);
  const [playing, setPlaying] = useState(false);
  const sunHours = useSiteView((s) => s.sunHours);
  const setSiteView = useSiteView((s) => s.setSiteView);

  const rise = info?.times.sunrise ?? 0;
  const set = info?.times.sunset ?? 24;
  const min = quarter(rise, Math.floor);
  const max = quarter(set, Math.ceil);

  // Play through the day: about 20 s from sunrise to sunset, then round again.
  useEffect(() => {
    if (!playing || !open || !sun.enabled) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const h = useStore.getState().sun.hour + ((set - rise) * dt) / DAY_SECONDS;
      setSun({ hour: h > set ? rise : Math.max(rise, h) });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, open, sun.enabled, rise, set, setSun]);

  if (!open || !site || !info) return null;

  /** Change the day, keeping the time within that day's daylight. */
  const pickDay = (d: number) => {
    const t = sunTimes(site.latitude, site.longitude, SUN_YEAR, d);
    const hour = t.sunrise === null || t.sunset === null ? sun.hour : Math.min(Math.max(sun.hour, quarter(t.sunrise, Math.ceil)), quarter(t.sunset, Math.floor));
    setSun({ dayOfYear: d, hour });
  };
  const { altitude, azimuth } = info.position;
  const zone = ukZone(SUN_YEAR, sun.dayOfYear);

  return (
    <>
      <div className="sun-panel float-card" role="group" aria-label="Sun study">
        <div className="sun-head">
          <label className="sun-toggle" title="See where the sun and shadows fall on any day, from sunrise to sunset.">
            <input
              type="checkbox"
              checked={sun.enabled}
              onChange={(e) => {
                setSun({ enabled: e.target.checked });
                if (!e.target.checked) setPlaying(false);
              }}
            />
            Sun study
          </label>
          {sun.enabled && (
            <span className="sun-brief">
              {formatDay(SUN_YEAR, sun.dayOfYear)}, {formatClock(sun.hour)}
            </span>
          )}
          <button className="icon-btn sun-close" onClick={() => setPrefs({ sunOpen: false })} aria-label="Close sun study" title="Close">
            <Icon name="close" size={16} />
          </button>
        </div>
        {sun.enabled && (
          <div className="sun-body">
            <div className="sun-row">
              <span className="sun-label">Date</span>
              <input
                type="range"
                min={1}
                max={daysInYear(SUN_YEAR)}
                value={sun.dayOfYear}
                onChange={(e) => pickDay(parseInt(e.target.value))}
                aria-label="Date"
              />
              <b className="sun-value">{formatDay(SUN_YEAR, sun.dayOfYear)}</b>
            </div>
            <div className="sun-quick">
              {QUICK_DATES.map(([label, d]) => (
                <button key={label} className={sun.dayOfYear === d ? "active" : ""} onClick={() => pickDay(d)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="sun-row">
              <button className="sun-play" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause" : "Play through the day"}>
                {playing ? "❚❚" : "▶"}
              </button>
              <input
                type="range"
                min={min}
                max={max}
                step={0.25}
                value={Math.min(max, Math.max(min, sun.hour))}
                onChange={(e) => {
                  setPlaying(false);
                  setSun({ hour: parseFloat(e.target.value) });
                }}
                aria-label="Time of day"
              />
              <b className="sun-value">
                {formatClock(sun.hour)} <span className="muted">{zone}</span>
              </b>
            </div>
            <div className="sun-read">
              {altitude > 0 ? (
                <>
                  Sun {Math.round(altitude)}° up in the {compassPoint(azimuth)} ({Math.round(azimuth)}°)
                </>
              ) : (
                <>Sun below the horizon</>
              )}
            </div>
            <div className="sun-read muted">
              Sunrise {info.times.sunrise === null ? "–" : formatClock(info.times.sunrise)} · Sunset{" "}
              {info.times.sunset === null ? "–" : formatClock(info.times.sunset)}
            </div>
            <label className="sun-toggle sun-hours-toggle">
              <input type="checkbox" checked={sunHours} onChange={(e) => setSiteView({ sunHours: e.target.checked })} />
              Sun hours on the garden
            </label>
            {sunHours && <SunHoursLegend />}
          </div>
        )}
      </div>
    </>
  );
}

function SunHoursLegend() {
  const site = useViewedSite();
  const viewed = useViewedVariant();
  const model = useStore((s) => s.variants[viewed]);
  const day = useStore((s) => s.sun.dayOfYear);
  const grid = useSunHours(site, model);
  if (!grid) return <p className="sun-hint">No direct sun on this day.</p>;
  const share = Math.round(shareWithSun(grid, 2) * 100);
  return (
    <div className="sun-legend">
      <div className="sun-legend-bar" style={{ background: SUN_HOURS_GRADIENT }} />
      <div className="sun-legend-scale">
        {[0, 2, 4, 6, SUN_HOURS_MAX].map((h) => (
          <span key={h}>{h === SUN_HOURS_MAX ? `${h}+ h` : h}</span>
        ))}
      </div>
      <p className="sun-read">
        {share}% of the garden gets 2 hours or more of sun on {formatDay(SUN_YEAR, day)}.
        <span className="muted"> Planning guidance looks for at least half on 21 Mar.</span>
      </p>
      <p className="sun-read muted">Room-by-room sun: Review {"→"} Sunlight.</p>
    </div>
  );
}
