import { Section } from "../../components/Section";
import { NumberField, SwatchField } from "../../components/inspector";
import { openingLookSummary } from "../../lib/modeSummary";
import type { Floor, Opening, OpeningKind } from "../../types";
import { DEFAULT_EXTERIOR, GLAZING_LABEL, OPENING_KIND_LABEL, SIDELIGHT_LABEL, SILL_STYLE_LABEL, type GlazingPattern, type OpeningStyle, type Sidelight, type SillStyle } from "../../types";
import { useModel } from "../../store";
import { openingSides } from "../../lib/openingSides";
import { DEFAULT_ARCHWAY_COLOUR, DEFAULT_BAY_DEPTH, frontUnit, styleOptions, withSidelight } from "../../lib/openings";
import { Info } from "../../components/Info";
import { COLOUR_KINDS, DOOR_KINDS, SWING_KINDS, defaultHead, defaultSill, openingEnds, placeFromEnd, wallRun } from "../../lib/planMath";

/** A colour that falls back to a default when unset, with a button to go back to it. */
function OptionalColour({ label, value, fallback, onChange }: { label: string; value: string | undefined; fallback: string; onChange: (v: string | undefined) => void }) {
  return <SwatchField label={label} value={value ?? fallback} isSet={value !== undefined} onChange={onChange} onReset={() => onChange(undefined)} />;
}

/** Style, glazing, sill and trim colours of an opening, where its kind has them. */
function OpeningLook({ opening, floor, onChange }: { opening: Opening; floor: Floor; onChange: (p: Partial<Opening>) => void }) {
  const k = opening.kind;
  const styles = styleOptions(k);
  const glazed = k === "window" || k === "bay";
  const framed = k !== "gap" && k !== "archway";
  const trim = useModel()?.exterior?.trimColor ?? DEFAULT_EXTERIOR.trimColor;
  const twoSided = k === "door" || k === "front" || k === "bifold" || k === "archway";
  const split = twoSided && (opening.backColor !== undefined || opening.backLiningColor !== undefined || !!opening.matchFront || !!opening.matchBack);
  const sides = split ? openingSides(floor, opening) : null;
  const isRoom = (n: string) => n !== "outside" && n !== "one side" && n !== "other side";
  const sideName = (n: string) => (isRoom(n) ? `${n} side` : n);
  /** A side's "match the room's walls" tick, where there is a room to match. */
  const matchRow = (key: "matchFront" | "matchBack", room: string | undefined) =>
    room !== undefined && isRoom(room) ? (
      <label className="check" title="This side of the door, and its lining unless you set one, follow the room's wall colour">
        <input type="checkbox" checked={!!opening[key]} onChange={(e) => onChange({ [key]: e.target.checked || undefined })} /> Match {room} walls
      </label>
    ) : null;
  const front = sides ? sideName(sides.front) : "";
  const back = sides ? sideName(sides.back) : "";
  const leafColour = opening.color ?? (k === "door" ? "#c9a26b" : k === "archway" ? DEFAULT_ARCHWAY_COLOUR : "#b3202e");
  return (
    <>
      {COLOUR_KINDS.includes(k) && !(split && opening.matchFront) && (
        <SwatchField
          dulux={k !== "archway"}
          label={split ? `Colour (${front})` : "Colour"}
          value={leafColour}
          isSet={opening.color !== undefined}
          onChange={(color) => onChange({ color })}
          onReset={() => onChange({ color: undefined })}
        />
      )}
      {split && matchRow("matchFront", sides?.front)}
      {twoSided && (
        <label className="check" title="Paint the two faces of the door, or the two sides of the archway, different colours">
          <input
            type="checkbox"
            checked={split}
            onChange={(e) =>
              onChange(e.target.checked ? { backColor: leafColour } : { backColor: undefined, backLiningColor: undefined, matchFront: undefined, matchBack: undefined })
            }
          />{" "}
          Different colour each side
        </label>
      )}
      {split && COLOUR_KINDS.includes(k) && !opening.matchBack && (
        <SwatchField
          dulux={k !== "archway"}
          label={`Colour (${back})`}
          value={opening.backColor ?? leafColour}
          isSet={opening.backColor !== undefined}
          onChange={(backColor) => onChange({ backColor })}
          onReset={() => onChange({ backColor: undefined })}
        />
      )}
      {split && matchRow("matchBack", sides?.back)}
      {styles.length > 0 && (
        <label>
          Style
          <select value={opening.style ?? ""} onChange={(e) => onChange({ style: (e.target.value || undefined) as OpeningStyle | undefined })}>
            <option value="">Default</option>
            {styles.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {k === "front" && (
        <label>
          Side lights
          <small className="muted">
            Full-height glazing in the same frame as the door. The width covers the whole unit, so a narrow door is widened to fit (1.3 m for one side light, 1.8 m for two), as far as its wall allows.
          </small>
          <select
            value={opening.sidelight ?? ""}
            onChange={(e) => onChange(withSidelight(opening, (e.target.value || undefined) as Sidelight | undefined, floor.pxPerM, wallRun(floor, opening)))}
          >
            <option value="">None</option>
            {(Object.keys(SIDELIGHT_LABEL) as Sidelight[]).map((s) => (
              <option key={s} value={s}>
                {SIDELIGHT_LABEL[s]}
              </option>
            ))}
          </select>
          {opening.sidelight && frontUnit(opening, opening.widthM).lights.length === 0 && (
            <small className="warn">No room for a side light: the door needs to be at least 1 m wide (1.3 m looks right). Widen it, or move it along the wall first.</small>
          )}
        </label>
      )}
      {(k === "door" || k === "front" || k === "french") && (
        <label>
          Drawn open (°)
          <small className="muted">Only shown when View &gt; Doors open is on; otherwise every door is drawn shut.</small>
          <NumberField
            value={opening.openDeg}
            placeholder={k === "front" ? "0" : k === "french" ? "80" : "75"}
            min={0}
            max={180}
            step={5}
            label="Open angle"
            onCommit={(v) => onChange({ openDeg: v })}
            onClear={() => onChange({ openDeg: undefined })}
          />
        </label>
      )}
      {glazed && (
        <div className="size-row">
          <label>
            Glazing
            <select value={opening.glazing ?? "grid"} onChange={(e) => onChange({ glazing: e.target.value === "grid" ? undefined : (e.target.value as GlazingPattern) })}>
              {(Object.keys(GLAZING_LABEL) as GlazingPattern[]).map((g) => (
                <option key={g} value={g}>
                  {GLAZING_LABEL[g]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sill outside
            <select value={opening.sillStyle ?? "stone"} onChange={(e) => onChange({ sillStyle: e.target.value === "stone" ? undefined : (e.target.value as SillStyle) })}>
              {(Object.keys(SILL_STYLE_LABEL) as SillStyle[]).map((s) => (
                <option key={s} value={s}>
                  {SILL_STYLE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="size-row">
        {k === "window" && <OptionalColour label="Window board" value={opening.boardColor} fallback="#f3f1ea" onChange={(boardColor) => onChange({ boardColor })} />}
        {(k === "door" || k === "bifold") && (
          <OptionalColour label={split ? `Lining (${front})` : "Lining (inside)"} value={opening.liningColor} fallback="#f3f1ea" onChange={(liningColor) => onChange({ liningColor })} />
        )}
        {split && (k === "door" || k === "bifold") && (
          <OptionalColour label={`Lining (${back})`} value={opening.backLiningColor} fallback={opening.liningColor ?? "#f3f1ea"} onChange={(backLiningColor) => onChange({ backLiningColor })} />
        )}
        {framed && <OptionalColour label="Frame" value={opening.frameColor} fallback={trim} onChange={(frameColor) => onChange({ frameColor })} />}
      </div>
    </>
  );
}

export function OpeningInspector({
  opening,
  pair,
  floor,
  onChange,
  onDelete,
}: {
  opening: Opening;
  /** Drawn as a pair of leaves (a wide internal door), so there is no hinge side to flip. */
  pair?: boolean;
  /** The opening's floor, to fit a front door's side lights into its wall. */
  floor: Floor;
  onChange: (p: Partial<Opening>) => void;
  onDelete: () => void;
}) {
  const k = opening.kind;
  const sill = defaultSill(k);
  const head = defaultHead(k);
  const ends = openingEnds(floor, opening);
  const vertical = opening.orientation === "v";
  return (
    <div className="inspector">
      <label>
        <span>
          Type
          <Info>Drag it along the wall on the plan; it snaps onto the nearest wall.</Info>
        </span>
        <select value={k} onChange={(e) => onChange({ kind: e.target.value as OpeningKind })}>
          {(Object.keys(OPENING_KIND_LABEL) as OpeningKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {OPENING_KIND_LABEL[kind]}
            </option>
          ))}
        </select>
      </label>
      <div className="size-row">
        <label>
          Width (m)
          <NumberField value={opening.widthM} min={0.2} label="Width" onCommit={(widthM) => onChange({ widthM })} />
        </label>
        <label>
          Wall runs
          <select value={opening.orientation} onChange={(e) => onChange({ orientation: e.target.value as Opening["orientation"] })}>
            <option value="h">Left–right</option>
            <option value="v">Up–down</option>
          </select>
        </label>
      </div>
      {ends && (
        <div className="field">
          <span className="field-label">
            Position along the wall
            <Info>Measured from the inside face of each corner to the edge of the opening, as a builder sets it out.</Info>
          </span>
          <div className="size-row">
            <label>
              {vertical ? "From top end (m)" : "From left end (m)"}
              <NumberField value={ends.lo} min={0} label={vertical ? "From top end" : "From left end"} onCommit={(m) => onChange(placeFromEnd(floor, opening, "lo", m))} />
            </label>
            <label>
              {vertical ? "From bottom end (m)" : "From right end (m)"}
              <NumberField value={ends.hi} min={0} label={vertical ? "From bottom end" : "From right end"} onCommit={(m) => onChange(placeFromEnd(floor, opening, "hi", m))} />
            </label>
          </div>
        </div>
      )}
      {SWING_KINDS.includes(k) && (
        <div className="row flip-row">
          {k !== "french" && !pair && (
            <button className={opening.flipHinge ? "active" : ""} onClick={() => onChange({ flipHinge: !opening.flipHinge || undefined })}>
              Flip hinge
            </button>
          )}
          <button className={opening.flipSwing ? "active" : ""} onClick={() => onChange({ flipSwing: !opening.flipSwing || undefined })}>
            Flip swing
          </button>
        </div>
      )}
      {(sill !== undefined || (DOOR_KINDS.includes(k) && head !== undefined)) && (
        <div className="size-row">
          {sill !== undefined && (
            <label>
              Sill (m)
              <NumberField
                value={opening.sill}
                placeholder={String(sill)}
                min={0}
                max={3}
                label="Sill height"
                onCommit={(v) => onChange({ sill: v })}
                onClear={() => onChange({ sill: undefined })}
              />
            </label>
          )}
          {k === "bay" && (
            <label>
              Depth (m)
              <NumberField
                value={opening.depth}
                placeholder={String(DEFAULT_BAY_DEPTH)}
                min={0.1}
                max={1.5}
                label="Bay depth"
                onCommit={(v) => onChange({ depth: v })}
                onClear={() => onChange({ depth: undefined })}
              />
            </label>
          )}
          {head !== undefined && (
            <label>
              Head (m)
              <NumberField
                value={opening.head}
                placeholder={String(head)}
                min={0.5}
                max={4}
                label="Head height"
                onCommit={(v) => onChange({ head: v })}
                onClear={() => onChange({ head: undefined })}
              />
            </label>
          )}
        </div>
      )}
      <Section id="build.opening.look" title="Look" summary={openingLookSummary(opening)}>
        <OpeningLook opening={opening} floor={floor} onChange={onChange} />
      </Section>
      <button className="danger" onClick={onDelete}>
        Delete opening
      </button>
    </div>
  );
}
