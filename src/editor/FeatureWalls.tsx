import { useEffect, useState } from "react";
import { DEFAULT_EXTERIOR, WALL_COVERING_LABEL, WALL_FINISH_LABEL, type Floor, type Room, type VariantKey, type WallCovering, type WallFinish } from "../types";
import { ACCENT_LABEL, BASE_LABEL, hasAccent, outsideLook, wallAccent, wallBase, wallLook } from "../lib/wallCovering";
import { ColourSwatches } from "./ColourSwatches";
import { edgeLabel, isOutsideEdge, setOutsideOverride, setWallOverride } from "../lib/featureWalls";
import { edgeLengthsM, formatLength } from "../lib/planMath";
import { useSite, useStore } from "../store";
import { Info } from "../components/Info";

/**
 * One edge's finish controls: the inside covering select, colour, accent and
 * quick swatches, and (on an outside wall) the outside finish and colour.
 * `side` limits it to one face; omitted, both faces show. `alwaysSwatches`
 * shows the inside swatches even before the wall has its own finish, so one
 * click gives it one ({ paint: hex }).
 */
export function WallFinishRow({
  floor,
  room,
  edge: i,
  onChange,
  alwaysSwatches,
  side,
  variant,
}: {
  floor: Floor;
  room: Room;
  edge: number;
  onChange: (p: Partial<Room>) => void;
  alwaysSwatches?: boolean;
  side?: "inside" | "outside";
  /** Whose house finish the outside falls back to (default: the active variant). */
  variant?: VariantKey;
}) {
  const active = useStore((s) => s.activeVariant);
  const exterior = useStore((s) => s.variants[variant ?? active]?.exterior);
  const house = { finish: exterior?.wallFinish ?? "render", color: exterior?.wallColor ?? DEFAULT_EXTERIOR.wallColor };
  const roomCovering = room.wallCovering ?? "paint";
  const o = room.wallFinishes?.[i];
  // An override can hold just the outside finish, so check for inside fields.
  const inside = !!o && (o.covering !== undefined || o.paint !== undefined || o.accent !== undefined);
  const look = wallLook(room, i);
  const covering = look.wallCovering ?? "paint";
  const set = (p: Room["wallFinishes"]) => onChange({ wallFinishes: p });
  const showInside = side !== "outside";
  const outside = side !== "inside" && isOutsideEdge(floor, room, i);
  const outLook = outsideLook(room, i, house);
  const out = o?.outside;

  return (
    <>
      {showInside && (
        <div className="wall-finish">
          <select
            aria-label={`Wall ${i + 1} covering`}
            value={inside ? (o.covering ?? roomCovering) : ""}
            onChange={(e) => set(setWallOverride(room, i, e.target.value ? { covering: e.target.value as WallCovering } : null))}
          >
            <option value="">Same as room</option>
            {(Object.keys(WALL_COVERING_LABEL) as WallCovering[]).map((k) => (
              <option key={k} value={k}>
                {WALL_COVERING_LABEL[k]}
              </option>
            ))}
          </select>
          {inside && (
            <input
              type="color"
              aria-label={`Wall ${i + 1} ${BASE_LABEL[covering].toLowerCase()}`}
              title={BASE_LABEL[covering]}
              value={wallBase(look)}
              onChange={(e) => set(setWallOverride(room, i, { ...o, paint: e.target.value }))}
            />
          )}
          {inside && covering !== "paint" && hasAccent(covering) && (
            <input
              type="color"
              aria-label={`Wall ${i + 1} ${ACCENT_LABEL[covering].toLowerCase()}`}
              title={ACCENT_LABEL[covering]}
              value={wallAccent(look) ?? wallBase(look)}
              onChange={(e) => set(setWallOverride(room, i, { ...o, accent: e.target.value }))}
            />
          )}
        </div>
      )}
      {showInside && (inside || alwaysSwatches) && (
        <ColourSwatches
          label={`Wall ${i + 1} ${BASE_LABEL[covering].toLowerCase()}`}
          value={wallBase(look)}
          onPick={(hex) => set(setWallOverride(room, i, { ...o, paint: hex }))}
        />
      )}
      {outside && (
        <div className="wall-finish">
          <select
            aria-label={`Wall ${i + 1} outside finish`}
            value={out ? (out.finish ?? outLook.finish) : ""}
            onChange={(e) => set(setOutsideOverride(room, i, e.target.value ? { finish: e.target.value as WallFinish } : null))}
          >
            <option value="">Outside: same as room</option>
            {(Object.keys(WALL_FINISH_LABEL) as WallFinish[]).map((k) => (
              <option key={k} value={k}>
                Outside: {WALL_FINISH_LABEL[k]}
              </option>
            ))}
          </select>
          {out && (
            <input
              type="color"
              aria-label={`Wall ${i + 1} outside colour`}
              title="Outside colour"
              value={outLook.color}
              onChange={(e) => set(setOutsideOverride(room, i, { ...out, color: e.target.value }))}
            />
          )}
        </div>
      )}
    </>
  );
}

/**
 * The room's walls, one row per polygon edge, each of which can take its own
 * covering inside and, on an outside wall, its own finish outside. Hovering,
 * focusing or clicking a row lights that edge on the plan.
 */
export function FeatureWalls({
  variant,
  floor,
  room,
  onChange,
  onHighlight,
}: {
  variant: VariantKey;
  floor: Floor;
  room: Room;
  onChange: (p: Partial<Room>) => void;
  onHighlight?: (edge: number | null) => void;
}) {
  const frontBearing = useSite(variant)?.frontBearing;
  // Clicked: stays lit until clicked again.
  const [pinned, setPinned] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const lit = hover ?? pinned;
  useEffect(() => {
    onHighlight?.(lit);
  }, [lit, onHighlight]);
  useEffect(() => () => onHighlight?.(null), [onHighlight]);
  const lens = edgeLengthsM(room.polygon, floor.pxPerM);

  return (
    <div className="field feature-walls">
      <span className="field-label">
        Walls
        <Info>
          Give any wall its own covering, such as a feature wall or a tiled splashback, and any outside wall its own finish, such as a rendered panel in a brick wall.
          Point at or click a wall to find it on the plan.
        </Info>
      </span>
      <ul>
        {lens.map((len, i) => (
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
            <WallFinishRow floor={floor} room={room} edge={i} onChange={onChange} variant={variant} />
          </li>
        ))}
      </ul>
    </div>
  );
}
