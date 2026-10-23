import { Section } from "../components/Section";
import { WALL_COVERING_LABEL, WALL_FINISH_LABEL, FLOOR_FINISH_LABEL, type Floor, type FloorFinish, type Room, type VariantKey, type WallCovering, type WallFinish } from "../types";
import type { EdgePick } from "../lib/decorPick";
import { eachWallSummary, floorSummary, outsideSummary, wallsSummary } from "../lib/modeSummary";
import { edgeLabel, isOutsideEdge } from "../lib/featureWalls";
import { areaM2, edgeLengthsM, formatArea, formatLength } from "../lib/planMath";
import { ACCENT_LABEL, BASE_LABEL, hasAccent, wallAccent, wallBase } from "../lib/wallCovering";
import { skirtingColour } from "../lib/skirting";
import { finishColour, floorAngle, groutColour, takesAngle, takesGrout } from "../lib/floorFinish";
import { longAxisAngle, normaliseAngle } from "../lib/floorPattern";
import { roomColor } from "../lib/roomColor";
import { useSite, useStore } from "../store";
import { ColourSwatches } from "./ColourSwatches";
import { FeatureWalls, WallFinishRow } from "./FeatureWalls";
import { NumberField } from "./Inspectors";

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
  const photos = useStore((s) => s.photos);

  if (edge && edge.edge >= 0 && edge.edge < room.polygon.length) {
    const i = edge.edge;
    const len = edgeLengthsM(room.polygon, floor.pxPerM)[i];
    // An internal edge has no outside face, so it shows its inside face.
    const side = edge.side === "outside" && isOutsideEdge(floor, room, i) ? "outside" : "inside";
    return (
      <div className="inspector decorate-panel decorate-wall">
        <h4 className="decor-head">
          Wall {i + 1} · {formatLength(len)} · {edgeLabel(floor, room, i, frontBearing)}
        </h4>
        <p className="muted small">
          {room.name} · {side === "outside" ? "outside face" : "inside face"}
        </p>
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
  const accented = covering !== "paint" && hasAccent(covering);
  const hasOutside = room.polygon.some((_, i) => isOutsideEdge(floor, room, i));

  return (
    <div className="inspector decorate-panel">
      <h4 className="decor-head">{room.name}</h4>
      <p className="muted small">Floor area {formatArea(areaM2(room.polygon, floor.pxPerM))}</p>

      <Section id="decorate.floor" title="Floor" summary={floorSummary(room)} defaultOpen>
        <label>
          Floor finish
          <select
            value={room.floorFinish ?? "plain"}
            onChange={(e) => {
              const f = e.target.value as FloorFinish;
              // A new textured finish starts in its own typical colour (light oak for herringbone);
              // pick a colour after choosing the finish to change it.
              onChange({ floorFinish: f === "plain" ? undefined : f, ...(f !== "plain" && room.color ? { color: undefined } : {}) });
            }}
          >
            {(Object.keys(FLOOR_FINISH_LABEL) as FloorFinish[]).map((k) => (
              <option key={k} value={k}>
                {FLOOR_FINISH_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        {takesAngle(room.floorFinish) && (
          <div className="field">
            <span className="field-label">Pattern direction (degrees)</span>
            <div className="size-row floor-angle">
              <NumberField value={room.floorAngle ?? 0} min={-361} max={360} step={5} label="Floor pattern angle" onCommit={(a) => onChange({ floorAngle: normaliseAngle(a) || undefined })} />
              {[0, 45, 90].map((a) => (
                <button key={a} className={floorAngle(room) === a ? "active" : ""} onClick={() => onChange({ floorAngle: a || undefined })}>
                  {a}°
                </button>
              ))}
              <button title="Run the pattern along the room's longest wall" onClick={() => onChange({ floorAngle: longAxisAngle(room.polygon) || undefined })}>
                Along room
              </button>
            </div>
          </div>
        )}
        {takesGrout(room.floorFinish) && (
          <div className="colour-row">
            <label>
              Grout colour
              <span className="colour-pick">
                <input type="color" value={groutColour(room)} onChange={(e) => onChange({ floorGrout: e.target.value })} />
                {room.floorGrout && (
                  <button className="link" onClick={() => onChange({ floorGrout: undefined })}>
                    Clear
                  </button>
                )}
              </span>
            </label>
          </div>
        )}
        <div className="colour-row">
          <label>
            Floor colour
            <span className="colour-pick">
              <input type="color" value={finishColour(room) ?? roomColor(room)} onChange={(e) => onChange({ color: e.target.value })} />
              {room.color && room.floorFinish && room.floorFinish !== "plain" && (
                <button className="link" title="Back to the finish's own colour" onClick={() => onChange({ color: undefined })}>
                  Clear
                </button>
              )}
            </span>
          </label>
        </div>
        <label>
          Floor texture from photo
          <select value={room.floorPhotoId ?? ""} onChange={(e) => onChange({ floorPhotoId: e.target.value || undefined })}>
            <option value="">None</option>
            {photos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section id="decorate.walls" title="Walls" summary={wallsSummary(room)} defaultOpen>
        <label>
          Wall covering
          <select value={covering} onChange={(e) => onChange({ wallCovering: e.target.value === "paint" ? undefined : (e.target.value as WallCovering) })}>
            {(Object.keys(WALL_COVERING_LABEL) as WallCovering[]).map((k) => (
              <option key={k} value={k}>
                {WALL_COVERING_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <div className="colour-row">
          <label>
            {BASE_LABEL[covering]}
            <span className="colour-pick">
              <input type="color" value={wallBase(room)} onChange={(e) => onChange({ wallPaint: e.target.value })} />
              {room.wallPaint && (
                <button className="link" onClick={() => onChange({ wallPaint: undefined })}>
                  Clear
                </button>
              )}
            </span>
          </label>
          <label>
            Skirting colour
            <span className="colour-pick">
              <input type="color" value={skirtingColour(room)} onChange={(e) => onChange({ skirtingColor: e.target.value })} />
              {room.skirtingColor && (
                <button className="link" onClick={() => onChange({ skirtingColor: undefined })}>
                  Clear
                </button>
              )}
            </span>
          </label>
        </div>
        {accented && (
          <label>
            {ACCENT_LABEL[covering]}
            <span className="colour-pick">
              <input type="color" value={wallAccent(room) ?? wallBase(room)} onChange={(e) => onChange({ wallAccent: e.target.value })} />
              {room.wallAccent && (
                <button className="link" onClick={() => onChange({ wallAccent: undefined })}>
                  {covering === "tiles" ? "None" : "Clear"}
                </button>
              )}
            </span>
          </label>
        )}
        <span className="swatch-label">{BASE_LABEL[covering]}: quick colours</span>
        <ColourSwatches label={BASE_LABEL[covering]} value={wallBase(room)} onPick={(hex) => onChange({ wallPaint: hex })} />
        {accented && (
          <>
            <span className="swatch-label">{ACCENT_LABEL[covering]}: quick colours</span>
            <ColourSwatches label={ACCENT_LABEL[covering]} value={wallAccent(room) ?? wallBase(room)} onPick={(hex) => onChange({ wallAccent: hex })} />
          </>
        )}
      </Section>

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
          <label title="Colour of this room's external walls; blank uses the house's wall colour">
            Outside wall colour
            <span className="colour-pick">
              <input type="color" value={room.exteriorColor ?? "#efe9d8"} onChange={(e) => onChange({ exteriorColor: e.target.value })} />
              {room.exteriorColor && (
                <button className="link" onClick={() => onChange({ exteriorColor: undefined })}>
                  House colour
                </button>
              )}
            </span>
          </label>
        </Section>
      )}
    </div>
  );
}
