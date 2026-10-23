import { useMemo, useState } from "react";
import { useSite, useStore } from "../store";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { dayOfYear, formatClock, formatDay } from "../lib/sun";
import { compareRooms, type RoomCompare } from "../lib/sunlight";
import { SUN_YEAR } from "../three/useSun";
import { useSunlight } from "../three/useSunlight";
import "./SunlightSection.css";

const DATES: [string, number][] = [
  ["21 Mar", dayOfYear(SUN_YEAR, 3, 21)],
  ["21 Jun", dayOfYear(SUN_YEAR, 6, 21)],
  ["21 Dec", dayOfYear(SUN_YEAR, 12, 21)],
];
const MARCH = DATES[0][1];

/** "3 h 15", "45 min", "2 h". */
export function formatHours(h: number): string {
  const mins = Math.round(h * 60);
  if (mins < 60) return `${mins} min`;
  const m = mins % 60;
  return m ? `${Math.floor(mins / 60)} h ${m}` : `${Math.floor(mins / 60)} h`;
}
const formatChange = (d: number): string => {
  const mins = Math.round(d * 60);
  if (mins === 0) return "No change";
  return `${mins > 0 ? "+" : "−"}${formatHours(Math.abs(mins) / 60)}`;
};
const spansText = (spans: [number, number][]) => spans.map(([a, b]) => `${formatClock(a)}–${formatClock(b)}`).join(", ");

function Strip({ spans }: { spans: [number, number][] }) {
  const cells = Array.from({ length: 24 }, (_, h) => spans.reduce((m, [a, b]) => m + Math.max(0, Math.min(b, h + 1) - Math.max(a, h)), 0));
  return (
    <div className="sl-strip" title={spans.length ? `Sun ${spansText(spans)}` : "No direct sun"} aria-hidden="true">
      {cells.map((c, h) => (
        <i key={h} style={{ opacity: c > 0 ? 0.35 + 0.65 * Math.min(1, c) : undefined }} className={c > 0 ? "on" : ""} />
      ))}
    </div>
  );
}

function Cell({ hours, windows, spans }: { hours?: number; windows?: number; spans?: [number, number][] }) {
  if (hours === undefined) return <td className="sl-hours muted">{"–"}</td>;
  if (!windows) return <td className="sl-hours muted">No outside windows</td>;
  return (
    <td className="sl-hours">
      <span>{hours > 0 ? formatHours(hours) : "No direct sun"}</span>
      <Strip spans={spans ?? []} />
    </td>
  );
}

/** Hours of direct sun per room and for the garden, As listed against Proposed, for a chosen day. */
export function SunlightSection() {
  const [day, setDay] = useState(MARCH);
  const hasCurrent = useStore((s) => !!s.variants.current);
  const hasProposed = useStore((s) => !!s.variants.proposed);
  const siteCurrent = useSite("current");
  const siteProposed = useSite("proposed");
  const keys: VariantKey[] = [hasCurrent && siteCurrent ? "current" : null, hasProposed && siteProposed ? "proposed" : null].filter((k): k is VariantKey => k !== null);
  const a = useSunlight("current", day);
  const b = useSunlight("proposed", day);
  const both = keys.length === 2;
  const results = { current: a, proposed: b };
  const pending = keys.some((k) => results[k].pending);

  const rows = useMemo(() => {
    const comp = compareRooms(keys.includes("current") ? a.result : undefined, keys.includes("proposed") ? b.result : undefined);
    const floors: { name: string; rooms: RoomCompare[] }[] = [];
    for (const r of comp) {
      let f = floors.find((x) => x.name === r.floorName);
      if (!f) floors.push((f = { name: r.floorName, rooms: [] }));
      f.rooms.push(r);
    }
    return floors;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.result, b.result, keys.join()]);

  if (!keys.length) {
    return <p className="muted small">Add a plot (Plot panel) to see sunlight: it needs the house's location and which way it faces.</p>;
  }

  const ga = keys.includes("current") ? a.result?.garden : undefined;
  const gb = keys.includes("proposed") ? b.result?.garden : undefined;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const dayLabel = formatDay(SUN_YEAR, day);
  const warn = day === MARCH && !!gb && (gb.share2h < 0.5 || (!!ga && gb.share2h < 0.8 * ga.share2h));
  const gardenText = ga || gb ? (
    both && ga && gb ? (
      <>
        Garden in sun for 2 hours or more on {dayLabel}: {VARIANT_LABEL.current} {pct(ga.share2h)} {"→"} {VARIANT_LABEL.proposed} {pct(gb.share2h)}.
      </>
    ) : (
      <>
        Garden in sun for 2 hours or more on {dayLabel}: {pct((ga ?? gb)!.share2h)}.
      </>
    )
  ) : null;

  return (
    <div className="sl">
      <div className="sun-quick sl-dates" role="group" aria-label="Day">
        {DATES.map(([label, d]) => (
          <button key={label} className={day === d ? "active" : ""} onClick={() => setDay(d)}>
            {label}
          </button>
        ))}
      </div>
      {gardenText && (
        <p className={`sl-garden${warn ? " sl-warn" : ""}`}>
          {gardenText}
          {day === MARCH && <span className="muted"> Planning guidance looks for at least half on 21 Mar.</span>}
        </p>
      )}
      {pending && <p className="muted small">Working out sun hours{"…"}</p>}
      {rows.length > 0 && (
        <table className="rp-table sl-table">
          <thead>
            <tr>
              <th>Room</th>
              {keys.includes("current") && <th>{VARIANT_LABEL.current}</th>}
              {keys.includes("proposed") && <th>{VARIANT_LABEL.proposed}</th>}
              {both && <th>Change</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <FloorRows key={f.name} name={f.name} rooms={f.rooms} keys={keys} />
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">
        Hours of direct sun reaching any part of each room's windows and glazed doors, in 15-minute steps from sunrise to sunset on the chosen day, assuming clear skies. Obstructions: the house's walls and roofs (as simple blocks), neighbouring
        buildings and the boundary fences and walls. Not modelled: trees, roof lights and lanterns, overhangs other than the main roofs, window reveals, and glass type. It shows where sun can reach, not how bright a room is; it is a guide, not a
        BRE daylight assessment.
      </p>
    </div>
  );
}

function FloorRows({ name, rooms, keys }: { name: string; rooms: RoomCompare[]; keys: VariantKey[] }) {
  const both = keys.length === 2;
  return (
    <>
      <tr className="rp-floor">
        <th colSpan={keys.length + 1 + (both ? 1 : 0)}>{name}</th>
      </tr>
      {rooms.map((r, i) => {
        const canCompare = both && !!r.currentWindows && !!r.proposedWindows;
        const lost = both && !!r.currentWindows && r.current !== undefined && r.proposed !== undefined && (!r.proposedWindows || r.proposed <= 0.75 * r.current) && r.current > 0;
        const delta = canCompare ? r.proposed! - r.current! : both && r.currentWindows && r.proposed !== undefined && !r.proposedWindows ? -r.current! : undefined;
        return (
          <tr key={r.name + i} className={lost ? "sl-loss" : ""}>
            <td>{r.name}</td>
            {keys.includes("current") && <Cell hours={r.current} windows={r.currentWindows} spans={r.currentSpans} />}
            {keys.includes("proposed") && <Cell hours={r.proposed} windows={r.proposedWindows} spans={r.proposedSpans} />}
            {both && <td className={`sl-change${delta !== undefined && delta < 0 ? " neg" : ""}`}>{delta === undefined ? "" : formatChange(delta)}</td>}
          </tr>
        );
      })}
    </>
  );
}
