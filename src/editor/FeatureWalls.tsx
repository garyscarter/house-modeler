import { useEffect, useState } from "react";
import { WALL_COVERING_LABEL, type Floor, type Room, type WallCovering } from "../types";
import { ACCENT_LABEL, BASE_LABEL, wallAccent, wallBase, wallLook } from "../lib/wallCovering";
import { edgeLabel, setWallOverride } from "../lib/featureWalls";
import { edgeLengthsM, formatLength } from "../lib/planMath";
import { useStore } from "../store";

/**
 * The room's walls, one row per polygon edge, each of which can take its own
 * covering. Hovering, focusing or tapping a row lights that edge on the plan.
 */
export function FeatureWalls({ floor, room, onChange, onHighlight }: { floor: Floor; room: Room; onChange: (p: Partial<Room>) => void; onHighlight?: (edge: number | null) => void }) {
  const frontBearing = useStore((s) => s.site?.frontBearing);
  // Tapped on a touch screen, where there is no hover: stays lit until tapped again.
  const [pinned, setPinned] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const lit = hover ?? pinned;
  useEffect(() => onHighlight?.(lit), [lit, onHighlight]);
  useEffect(() => () => onHighlight?.(null), [onHighlight]);
  const lens = edgeLengthsM(room.polygon, floor.pxPerM);
  const roomCovering = room.wallCovering ?? "paint";

  return (
    <div className="field feature-walls">
      <span className="field-label">Walls</span>
      <ul>
        {lens.map((len, i) => {
          const o = room.wallFinishes?.[i];
          const look = wallLook(room, i);
          const covering = look.wallCovering ?? "paint";
          const set = (p: Room["wallFinishes"]) => onChange({ wallFinishes: p });
          return (
            <li
              key={i}
              className={lit === i ? "lit" : undefined}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <button className="wall-name" aria-pressed={pinned === i} title="Show this wall on the plan" onClick={() => setPinned(pinned === i ? null : i)}>
                <strong>Wall {i + 1}</strong> · {formatLength(len)}
                <span className="muted"> · {edgeLabel(floor, room, i, frontBearing)}</span>
              </button>
              <div className="wall-finish">
                <select
                  aria-label={`Wall ${i + 1} covering`}
                  value={o ? (o.covering ?? roomCovering) : ""}
                  onChange={(e) => set(setWallOverride(room, i, e.target.value ? { covering: e.target.value as WallCovering } : null))}
                >
                  <option value="">Same as room</option>
                  {(Object.keys(WALL_COVERING_LABEL) as WallCovering[]).map((k) => (
                    <option key={k} value={k}>
                      {WALL_COVERING_LABEL[k]}
                    </option>
                  ))}
                </select>
                {o && (
                  <input
                    type="color"
                    aria-label={`Wall ${i + 1} ${BASE_LABEL[covering].toLowerCase()}`}
                    title={BASE_LABEL[covering]}
                    value={wallBase(look)}
                    onChange={(e) => set(setWallOverride(room, i, { ...o, paint: e.target.value }))}
                  />
                )}
                {o && covering !== "paint" && (
                  <input
                    type="color"
                    aria-label={`Wall ${i + 1} ${ACCENT_LABEL[covering].toLowerCase()}`}
                    title={ACCENT_LABEL[covering]}
                    value={wallAccent(look) ?? wallBase(look)}
                    onChange={(e) => set(setWallOverride(room, i, { ...o, accent: e.target.value }))}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted small">Give any wall its own covering, such as a feature wall or a tiled splashback. Point at or tap a wall to find it on the plan.</p>
    </div>
  );
}
