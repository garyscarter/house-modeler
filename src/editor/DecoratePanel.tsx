import { RoomLinkControl } from "./RoomLinkControl";
import { Section } from "../components/Section";
import { WALL_COVERING_LABEL, WALL_FINISH_LABEL, FLOOR_FINISH_LABEL, type Floor, type Room, type VariantKey, type WallFinish } from "../types";
import type { EdgePick } from "../lib/decorPick";
import { eachWallSummary, outsideSummary } from "../lib/modeSummary";
import { edgeLabel, isOutsideEdge } from "../lib/featureWalls";
import { areaM2, edgeLengthsM, formatLength } from "../lib/planMath";
import { ACCENT_LABEL, BASE_LABEL, UPPER_GROUPS, coverLayout, hasAccent, hasBaseColour, upperCovering, upperLook, wallAccent, wallBase } from "../lib/wallCovering";
import { skirtingColour } from "../lib/skirting";
import { finishColour, groutColour, takesAngle, takesGrout } from "../lib/floorFinish";
import { longAxisAngle, normaliseAngle } from "../lib/floorPattern";
import { roomColor } from "../lib/roomColor";
import { useSite, useStore } from "../store";
import { FeatureWalls, WallFinishRow } from "./FeatureWalls";
import { hoverRoom } from "./Inspectors";
import { DirectionField, FinishPicker, StatHeader, SwatchField } from "../components/inspector";
import { FLOOR_GROUPS, FLOOR_TILE_NAME, WALL_GROUPS, WALL_TILE_NAME } from "../lib/finishGroups";

/**
 * Decorate's panel for a picked room: its floor and walls, or one wall face
 * when `edge` is set. Reads and writes the same room fields the old room
 * inspector did (updateRoom, setWallOverride, setOutsideOverride).
 */
export function DecoratePanel({
  variant,
  floor,
  room,
  edge,
  onChange,
  onHighlightEdge,
}: {
  variant: VariantKey;
  floor: Floor;
  room: Room;
  /** The picked wall face (null: the room's floor and walls as a whole). */
  edge: EdgePick | null;
  onChange: (p: Partial<Room>) => void;
  /** Light one of the room's edges on the plan (null: none). */
  onHighlightEdge?: (edge: number | null) => void;
}) {
  const setUi = useStore((s) => s.setUi);
  const frontBearing = useSite(variant)?.frontBearing;

  if (edge && edge.edge >= 0 && edge.edge < room.polygon.length) {
    const i = edge.edge;
    const len = edgeLengthsM(room.polygon, floor.pxPerM)[i];
    // An internal edge has no outside face, so it shows its inside face.
    const side = edge.side === "outside" && isOutsideEdge(floor, room, i) ? "outside" : "inside";
    return (
      <div className="inspector decorate-panel decorate-wall">
        <StatHeader title={`Wall ${i + 1}`} stat={formatLength(len)} sub={`${room.name} · ${side === "outside" ? "outside face" : "inside face"} · ${edgeLabel(floor, room, i, frontBearing)}`} />
        <div className="feature-walls single-wall">
          <WallFinishRow key={`${room.id}:${i}:${side}`} floor={floor} room={room} edge={i} onChange={onChange} alwaysSwatches side={side} variant={variant} />
        </div>
        <button type="button" className="link whole-room" onClick={() => setUi({ selectedEdge: null })}>
          Whole room
        </button>
      </div>
    );
  }

  const covering = room.wallCovering ?? "paint";
  const aboveKind = coverLayout(covering)?.paintAbove ? upperCovering(room) : undefined;
  const aboveLabel = covering === "tongue" ? "Above the boards" : covering === "metroSplash" ? "Above the splashback" : "Above the panelling";
  const accented = covering !== "paint" && hasAccent(covering);
  const hasOutside = room.polygon.some((_, i) => isOutsideEdge(floor, room, i));
  const floorFinishNow = room.floorFinish ?? "plain";
  const short = (label: string) => label.replace(/ colour$/i, "");

  return (
    <div className="inspector decorate-panel">
      <StatHeader title={room.name} stat={`${areaM2(room.polygon, floor.pxPerM).toFixed(1)} m²`} {...hoverRoom(room.id)} />

      <div className="deco-block">
        <div className="deco-head">
          <h4>Floor</h4>
          <span className="deco-value">{FLOOR_FINISH_LABEL[floorFinishNow]}</span>
        </div>
        <RoomLinkControl kind="floor" variant={variant} floor={floor} room={room} onChange={onChange} />
        <fieldset className={room.floorFrom ? "linked" : "link-free"} disabled={!!room.floorFrom}>
        <FinishPicker
          kind="floor"
          label="Floor finish"
          value={floorFinishNow}
          groups={FLOOR_GROUPS}
          names={FLOOR_TILE_NAME}
          titles={FLOOR_FINISH_LABEL}
          selectedColour={finishColour(room)}
          fallbackColour={room.color ?? roomColor(room)}
          onPick={(f) =>
            // A new textured finish starts in its own typical colour (light oak for herringbone);
            // pick a colour after choosing the finish to change it.
            onChange({ floorFinish: f === "plain" ? undefined : f, ...(f !== "plain" && room.color ? { color: undefined } : {}) })
          }
        />
        {takesAngle(room.floorFinish) && (
          <DirectionField angle={room.floorAngle ?? 0} alongRoom={longAxisAngle(room.polygon)} onChange={(a) => onChange({ floorAngle: normaliseAngle(a) || undefined })} />
        )}
        <SwatchField
          label="Colour"
          value={finishColour(room) ?? roomColor(room)}
          isSet={!!room.color}
          onChange={(color) => onChange({ color })}
          onReset={() => onChange({ color: undefined })}
          resetLabel={floorFinishNow === "plain" ? "Back to default" : "Back to the finish's own colour"}
        />
        {takesGrout(room.floorFinish) && (
          <SwatchField label="Grout" value={groutColour(room) ?? "#b9b4aa"} isSet={!!room.floorGrout} onChange={(floorGrout) => onChange({ floorGrout })} onReset={() => onChange({ floorGrout: undefined })} />
        )}
        </fieldset>
      </div>

      <div className="deco-block">
        <div className="deco-head">
          <h4>Walls</h4>
          <span className="deco-value">{WALL_COVERING_LABEL[covering] + (aboveKind && aboveKind !== "paint" ? ` · ${WALL_COVERING_LABEL[aboveKind]} above` : "")}</span>
        </div>
        <RoomLinkControl kind="walls" variant={variant} floor={floor} room={room} onChange={onChange} />
        <fieldset className={room.wallsFrom ? "linked" : "link-free"} disabled={!!room.wallsFrom}>
        <FinishPicker
          kind="wall"
          label="Wall covering"
          value={covering}
          groups={WALL_GROUPS}
          names={WALL_TILE_NAME}
          titles={WALL_COVERING_LABEL}
          selectedColour={room.wallPaint}
          fallbackColour={wallBase(room)}
          onPick={(c) => onChange({ wallCovering: c === "paint" ? undefined : c })}
        />
        {hasBaseColour(covering) && (
          <SwatchField
            label={short(BASE_LABEL[covering])}
            dulux
            value={wallBase(room)}
            isSet={!!room.wallPaint}
            onChange={(wallPaint) => onChange({ wallPaint })}
            onReset={() => onChange({ wallPaint: undefined })}
          />
        )}
        {accented && (
          <SwatchField
            label={short(ACCENT_LABEL[covering])}
            dulux={covering === "panelling" || covering === "tongue"}
            value={wallAccent(room) ?? wallBase(room)}
            isSet={!!room.wallAccent}
            onChange={(wallAccent) => onChange({ wallAccent })}
            onReset={() => onChange({ wallAccent: undefined })}
            resetLabel={covering === "tiles" ? "No feature strip" : "Back to default"}
          />
        )}
        {aboveKind !== undefined && (
          <FinishPicker
            kind="wall"
            label={aboveLabel}
            value={aboveKind}
            groups={UPPER_GROUPS}
            names={WALL_TILE_NAME}
            titles={WALL_COVERING_LABEL}
            selectedColour={room.wallPaint}
            fallbackColour={wallBase(room)}
            onPick={(c) => onChange({ upperCovering: c === "paint" ? undefined : c, upperAccent: undefined })}
          />
        )}
        {aboveKind !== undefined && aboveKind !== "paint" && hasAccent(aboveKind) && (
          <SwatchField
            label={short(ACCENT_LABEL[aboveKind])}
            value={wallAccent(upperLook(room)) ?? wallBase(room)}
            isSet={!!room.upperAccent}
            onChange={(upperAccent) => onChange({ upperAccent })}
            onReset={() => onChange({ upperAccent: undefined })}
          />
        )}
        <SwatchField
          label="Skirting"
          dulux
          value={skirtingColour(room)}
          isSet={!!room.skirtingColor}
          onChange={(skirtingColor) => onChange({ skirtingColor })}
          onReset={() => onChange({ skirtingColor: undefined })}
        />
        </fieldset>
      </div>

      <Section id="decorate.eachWall" title="Each wall" summary={eachWallSummary(room)}>
        <FeatureWalls variant={variant} floor={floor} room={room} onChange={onChange} onHighlight={onHighlightEdge} />
      </Section>

      {hasOutside && (
        <Section id="decorate.outside" title="Outside walls" summary={outsideSummary(room)}>
          <label>
            Outside wall finish
            <select value={room.exteriorFinish ?? ""} onChange={(e) => onChange({ exteriorFinish: (e.target.value || undefined) as WallFinish | undefined })}>
              <option value="">House default</option>
              {(Object.keys(WALL_FINISH_LABEL) as WallFinish[]).map((k) => (
                <option key={k} value={k}>
                  {WALL_FINISH_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <SwatchField
            label="Outside wall colour"
            dulux
            value={room.exteriorColor ?? "#efe9d8"}
            isSet={!!room.exteriorColor}
            onChange={(exteriorColor) => onChange({ exteriorColor })}
            onReset={() => onChange({ exteriorColor: undefined })}
            resetLabel="Back to the house colour"
          />
        </Section>
      )}
    </div>
  );
}
