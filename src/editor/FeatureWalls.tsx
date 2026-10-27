import { useEffect, useState } from "react";
import { DEFAULT_EXTERIOR, WALL_COVERING_LABEL, WALL_FINISH_LABEL, WALL_SPLIT_LABEL, type WallSplitKind, type Floor, type Room, type VariantKey, type WallCovering, type WallFinish } from "../types";
import { ACCENT_LABEL, BASE_LABEL, hasAccent, hasBaseColour, outsideLook, wallAccent, wallBase, wallLook } from "../lib/wallCovering";
import { DEFAULT_SPLIT_HEIGHT } from "../lib/wallSplit";
import { edgeLabel, isOutsideEdge, setOutsideOverride, setWallOverride } from "../lib/featureWalls";
import { edgeLengthsM, formatLength } from "../lib/planMath";
import { useSite, useStore } from "../store";
import { Info } from "../components/Info";
import { ColourWell, NumberField, SwatchField } from "../components/inspector";

/**
 * One edge's finish controls: the inside covering select, the colour (quick
 * swatches and the Dulux range), the accent, and (on an outside wall) the
 * outside finish and colour. `side` limits it to one face; omitted, both
 * faces show. `alwaysSwatches` shows the inside colour even before the wall
 * has its own finish, so one click gives it one ({ paint: hex }).
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
          {inside && covering !== "paint" && hasAccent(covering) && (
            <ColourWell custom label={`Wall ${i + 1} ${ACCENT_LABEL[covering].toLowerCase()}`} value={wallAccent(look) ?? wallBase(look)} onChange={(hex) => set(setWallOverride(room, i, { ...o, accent: hex }))} />
          )}
        </div>
      )}
      {showInside && (inside || alwaysSwatches) && hasBaseColour(covering) && (
        <SwatchField
          dulux
          label={`Wall ${i + 1} ${BASE_LABEL[covering].toLowerCase()}`}
          value={wallBase(look)}
          isSet={o?.paint !== undefined}
          onChange={(hex) => set(setWallOverride(room, i, { ...o, paint: hex }))}
          onReset={() => {
            const { paint: _paint, ...rest } = o ?? {};
            set(setWallOverride(room, i, Object.keys(rest).length ? rest : null));
          }}
          resetLabel="Same as the room"
        />
      )}
      {showInside && covering === "paint" && (
        <>
          <div className="wall-finish">
            <select
              aria-label={`Wall ${i + 1} two colours`}
              value={o?.split?.kind ?? ""}
              onChange={(e) => {
                const kind = e.target.value as WallSplitKind | "";
                if (!kind) {
                  const { split: _split, ...rest } = o ?? {};
                  set(setWallOverride(room, i, Object.keys(rest).length ? rest : null));
                } else {
                  set(setWallOverride(room, i, { ...o, split: { kind, color: o?.split?.color ?? "#5b6b7f", at: o?.split?.at } }));
                }
              }}
            >
              <option value="">Two colours: no</option>
              {(Object.keys(WALL_SPLIT_LABEL) as WallSplitKind[]).map((k) => (
                <option key={k} value={k}>
                  Two colours: {WALL_SPLIT_LABEL[k].toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          {o?.split && (
            <>
              <SwatchField
                dulux
                label={`Wall ${i + 1} second colour`}
                value={o.split.color}
                isSet
                onChange={(hex) => set(setWallOverride(room, i, { ...o, split: { ...o.split!, color: hex } }))}
                onReset={() => {
                  const { split: _split, ...rest } = o;
                  set(setWallOverride(room, i, Object.keys(rest).length ? rest : null));
                }}
                resetLabel="One colour"
              />
              {(o.split.kind === "horizontal" || o.split.kind === "vertical") && (
                <NumberField
                  label={`Wall ${i + 1} split at (m)`}
                  value={o.split.at ?? (o.split.kind === "horizontal" ? DEFAULT_SPLIT_HEIGHT : Math.round((edgeLengthsM(room.polygon, floor.pxPerM)[i] / 2) * 100) / 100)}
                  step={0.05}
                  onCommit={(v) => set(setWallOverride(room, i, { ...o, split: { ...o.split!, at: v } }))}
                />
              )}
            </>
          )}
        </>
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
            <ColourWell custom label={`Wall ${i + 1} outside colour`} value={outLook.color} onChange={(hex) => set(setOutsideOverride(room, i, { ...out, color: hex }))} />
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
