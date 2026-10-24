import { memo } from "react";
import { byId, type CatalogueItem } from "../../../lib/catalogue";
import { fixtureBox, rectCorners } from "../../../lib/planMath";
import type { Fixture, JoineryConfig } from "../../../types";
import { FixtureSymbol } from "../../FixtureSymbol";
import { LockGlyph } from "../../LockGlyph";
import { halo } from "./shared";

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One placed piece: its symbol in a rotated frame, with the press and group-hover handlers. */
const FixtureNode = memo(function FixtureNode({
  fx,
  furnish,
  hoverable,
  selected,
  flagged,
  ppm,
  px,
  onDown,
  onHoverGroup,
}: {
  fx: Fixture;
  furnish: boolean;
  /** Furnish with the Select tool: hovering a grouped piece lights the group. */
  hoverable: boolean;
  selected: boolean;
  /** Clashing with another piece, or fitted joinery that no longer fits. */
  flagged: boolean;
  ppm: number;
  px: number;
  onDown: (e: React.PointerEvent, fx: Fixture) => void;
  onHoverGroup: (id: string | null) => void;
}) {
  const item = byId(fx.type);
  if (!item) return null;
  const b = fixtureBox(fx, item);
  return (
    <g
      transform={`translate(${fx.x} ${fx.y}) rotate(${fx.rot})`}
      className="plan-fixture"
      data-fixture-id={fx.id}
      style={furnish ? undefined : { pointerEvents: "none", opacity: 0.55 }}
      onPointerDown={(e) => onDown(e, fx)}
      onPointerEnter={() => hoverable && onHoverGroup(fx.groupId ?? null)}
      onPointerLeave={() => onHoverGroup(null)}
    >
      <FixtureSymbol item={item} w={b.w * ppm} d={b.d * ppm} m={ppm} stroke={px * 1.25} color={fx.color} selected={selected} clash={flagged} fixture={fx} />
      <title>
        {fx.label ?? item.name} ({b.w.toFixed(2)} × {b.d.toFixed(2)} m)
      </title>
    </g>
  );
});

/** The furniture, in draw order (rugs under everything, wall-hung over the units below). */
export const FixtureSymbols = memo(function FixtureSymbols({
  ordered,
  furnish,
  hoverable,
  selectedIds,
  flagged,
  ppm,
  px,
  onDown,
  onHoverGroup,
}: {
  ordered: Fixture[];
  furnish: boolean;
  hoverable: boolean;
  selectedIds: string[];
  flagged: ReadonlySet<string>;
  ppm: number;
  px: number;
  onDown: (e: React.PointerEvent, fx: Fixture) => void;
  onHoverGroup: (id: string | null) => void;
}) {
  return (
    <>
      {ordered.map((fx) => (
        <FixtureNode
          key={fx.id}
          fx={fx}
          furnish={furnish}
          hoverable={hoverable}
          selected={selectedIds.includes(fx.id)}
          flagged={flagged.has(fx.id)}
          ppm={ppm}
          px={px}
          onDown={onDown}
          onHoverGroup={onHoverGroup}
        />
      ))}
    </>
  );
});

/** Dashed box round a multi-item or group selection. */
export const SelectionBox = memo(function SelectionBox({ box, px }: { box: Box; px: number }) {
  return (
    <rect
      x={box.x0 - px * 6}
      y={box.y0 - px * 6}
      width={box.x1 - box.x0 + px * 12}
      height={box.y1 - box.y0 + px * 12}
      rx={px * 6}
      fill="none"
      stroke="var(--plan-sel)"
      strokeWidth={px * 1.5}
      strokeDasharray={`${px * 6} ${px * 4}`}
      style={{ pointerEvents: "none" }}
    />
  );
});

/** Fainter dashed box round the group under the pointer. */
export const HoverBox = memo(function HoverBox({ box, px }: { box: Box; px: number }) {
  return (
    <rect
      x={box.x0 - px * 4}
      y={box.y0 - px * 4}
      width={box.x1 - box.x0 + px * 8}
      height={box.y1 - box.y0 + px * 8}
      rx={px * 5}
      fill="none"
      stroke="var(--plan-sel)"
      strokeOpacity={0.45}
      strokeWidth={px}
      strokeDasharray={`${px * 4} ${px * 4}`}
      style={{ pointerEvents: "none" }}
    />
  );
});

/** The names typed onto pieces. */
export const FixtureLabels = memo(function FixtureLabels({ fixtures, px }: { fixtures: Fixture[]; px: number }) {
  return (
    <>
      {fixtures.map(
        (fx) =>
          fx.label && (
            <text key={"t" + fx.id} x={fx.x} y={fx.y} dy="0.35em" fontSize={px * 13 * 0.85} textAnchor="middle" fill="#111" className="plan-text" {...halo(px)}>
              {fx.label}
            </text>
          ),
      )}
    </>
  );
});

/** A padlock on the corner of each locked piece. */
export const FixtureLocks = memo(function FixtureLocks({ fixtures, ppm, px }: { fixtures: Fixture[]; ppm: number; px: number }) {
  return (
    <>
      {fixtures.map((fx) => {
        if (!fx.locked) return null;
        const item = byId(fx.type);
        if (!item) return null;
        const b = fixtureBox(fx, item);
        const cs = rectCorners({ x: fx.x, y: fx.y }, b.w * ppm, b.d * ppm, fx.rot);
        return <LockGlyph key={"k" + fx.id} at={{ x: Math.max(...cs.map((c) => c.x)) - px * 6, y: Math.min(...cs.map((c) => c.y)) + px * 6 }} px={px * 10} />;
      })}
    </>
  );
});

/** Where the item being placed would land. */
export const PlacingGhost = memo(function PlacingGhost({
  item,
  x,
  y,
  rot,
  w,
  d,
  joinery,
  ppm,
  px,
}: {
  item: CatalogueItem;
  x: number;
  y: number;
  rot: number;
  /** Metres: the fitted size, or the item's own. */
  w: number;
  d: number;
  joinery: JoineryConfig | undefined;
  ppm: number;
  px: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`} style={{ pointerEvents: "none" }}>
      <FixtureSymbol item={item} w={w * ppm} d={d * ppm} m={ppm} stroke={px * 1.25} fixture={{ joinery }} ghost />
    </g>
  );
});
