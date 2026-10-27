import { useEffect, useMemo, useState } from "react";
import { Section } from "../components/Section";
import { NumberField, DangerZone, PairField, StatHeader, SwatchField } from "../components/inspector";
import type { Mode } from "../lib/modes";
import { knockThroughNeighbours } from "../lib/mergeRooms";
import { detailsSummary, floorSettingsSummary, knockSummary, openingLookSummary, printedChip, shapeSummary, stairsSummary } from "../lib/modeSummary";
import { ask } from "../components/Dialogs";
import { canopySize } from "../lib/canopy";
import type { Fixture, Floor, LightWarmth, Opening, OpeningKind, Pt, Room, VariantKey, Wall } from "../types";
import { DEFAULT_EXTERIOR, GLAZING_LABEL, OPENING_KIND_LABEL, SIDELIGHT_LABEL, SILL_STYLE_LABEL, STAIRS_DIR_LABEL, type GlazingPattern, type OpeningStyle, type Sidelight, type SillStyle, type StairsDir } from "../types";
import { FRAME_LABEL, PICTURE_SIZES, PRINTS, isPicture, pictureSize, pictureSizeOf, type Orientation, type PictureFrame } from "../lib/art";
import { RUG_PATTERNS, rugPattern } from "../lib/rugs";
import { DEFAULT_WORKTOP, MIN_SEAT, dropOf, isCeilingItem, pitchOf, TV_SIZES, byId, chaiseSizes, cornerSofaSizes, hasSeatDepth, hasWorktop, isCornerUnit, isTv, mountOf, tvInches, tvSize, type CatalogueItem } from "../lib/catalogue";
import { useModel, useStore } from "../store";
import { bbox, estimatePxPerM } from "../lib/geometry";
import { isUnheated } from "../lib/report";
import { DEFAULT_CUSHION, isJoinery, joineryOf, patchJoinery, shelfStack, shelfStackPatch } from "../lib/joinery";
import { JOINERY_FRONT_LABEL, SEAT_FRONT_LABEL, type JoineryFront, type SeatFront } from "../types";
import { openingSides } from "../lib/openingSides";
import { DEFAULT_ARCHWAY_COLOUR, DEFAULT_BAY_DEPTH, frontUnit, styleOptions, withSidelight } from "../lib/openings";
import { KnockThrough } from "./KnockThrough";
import { Info } from "../components/Info";
import { WARMTHS, WARMTH_LABEL, dimOf, isLightItem, switchedOn, warmthOf } from "../lib/lights";
import { assignToCircuit, centreHeight, circuitOf, isSwitchItem, isWallPoint, mountForCentre, gangCount, gangLabel, gangOf, numberPoints, pointKind, setGang, toggleLink } from "../lib/electrics";
import type { Circuit } from "../types";
import { floorDisplayName } from "../lib/studio";
import { requestPlanTool } from "./planTool";
import {
  COLOUR_KINDS,
  DOOR_KINDS,
  SWING_KINDS,
  areaM2,
  axisRect,
  comparePrinted,
  defaultHead,
  defaultSill,
  fixtureBox,
  formatArea,
  openingEnds,
  placeFromEnd,
  resizeRect,
  turn,
  wallRun,
  type Corner,
} from "../lib/planMath";
import { PieceLink } from "./MyFurniture";

/** Mouse enter / leave handlers that light a room in the plan and in 3D (store.hoveredRoomId). */
const hoverRefs = new Map<string, (el: HTMLElement | null) => (() => void) | void>();
export function hoverRoom(id: string) {
  // A stable ref per id whose cleanup clears the hover when the element unmounts (no mouseleave fires then).
  let ref = hoverRefs.get(id);
  if (!ref) {
    ref = (el) => {
      if (!el) return;
      return () => {
        if (useStore.getState().hoveredRoomId === id) useStore.getState().setUi({ hoveredRoomId: null });
      };
    };
    hoverRefs.set(id, ref);
  }
  return {
    ref,
    onMouseEnter: () => useStore.getState().setUi({ hoveredRoomId: id }),
    onMouseLeave: () => {
      if (useStore.getState().hoveredRoomId === id) useStore.getState().setUi({ hoveredRoomId: null });
    },
  };
}

/**
 * A name input that commits when you leave it or press Enter (Escape undoes
 * the edit), so a rename is one undo step and photos follow the room or floor
 * from its old name to the new one, never to a half-typed name on the way.
 */
export function NameField({ value, onCommit, className, label }: { value: string; onCommit: (v: string) => void; className?: string; label?: string }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value);
  }, [value, focused]);
  const commit = () => {
    const v = text.trim();
    if (v && v !== value) onCommit(v);
    else setText(value);
  };
  return (
    <input
      className={className}
      aria-label={label}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(value);
          setFocused(false);
        }
      }}
    />
  );
}

export { NumberField };

const CORNERS: [Corner, string, string][] = [
  ["tl", "↖", "top-left"],
  ["tr", "↗", "top-right"],
  ["bl", "↙", "bottom-left"],
  ["br", "↘", "bottom-right"],
];

/** Build's panel for a picked room: its name and area, shape and size, details, knock-through and delete. Finishes live in Decorate. */
export function BuildRoomPanel({
  variant,
  floor,
  room,
  onChange,
}: {
  variant: VariantKey;
  floor: Floor;
  room: Room;
  onChange: (p: Partial<Room>) => void;
  /** Light one of the room's edges on the plan (null: none). Unused in Build. */
  onHighlightEdge?: (edge: number | null) => void;
}) {
  const updateFloor = useStore((s) => s.updateFloor);
  const photos = useStore((s) => s.photos);
  const setUi = useStore((s) => s.setUi);
  // The corner that stays put when the size changes: top-left unless Advanced says otherwise.
  const [anchor, setAnchor] = useState<Corner>("tl");
  const roomPhotos = photos.filter((p) => p.floorName === floor.name && p.roomName === room.name);
  const neighbours = useMemo(() => knockThroughNeighbours(floor, room.id), [floor, room.id]);
  const ppm = floor.pxPerM;
  const r = axisRect(room.polygon, 0.5);
  const b = bbox(room.polygon);
  const tracedW = (r ? r.x1 - r.x0 : b.w) / ppm;
  const tracedH = (r ? r.y1 - r.y0 : b.h) / ppm;
  const cmp = room.dims ? comparePrinted(tracedW, tracedH, room.dims) : null;
  const chip = cmp && room.dims ? printedChip(cmp, { w: tracedW, h: tracedH }, room.dims) : null;
  const area = areaM2(room.polygon, ppm);
  const resize = (w: number, h: number) => {
    if (!room.locked) onChange({ polygon: resizeRect(room.polygon, w * ppm, h * ppm, anchor) });
  };
  const anchorName = CORNERS.find(([c]) => c === anchor)?.[2] ?? "top-left";

  return (
    <div className="inspector room-inspector">
      <StatHeader
        {...hoverRoom(room.id)}
        title={<NameField className="stat-name" label="Room name" value={room.name} onCommit={(name) => onChange({ name })} />}
        stat={`${area.toFixed(1)} m²`}
        sub={`${Math.round(area * 10.7639)} ft²${room.locked ? " · shape locked" : ""}`}
      />

      <Section id="build.room.shape" title="Shape & size" summary={shapeSummary(room, ppm)} defaultOpen>
        {r ? (
          <PairField
            label="Size on this plan"
            info={<Info>The {anchorName} corner stays put when you change the size. Click an edge length on the plan to type a new one. Advanced has the other corners.</Info>}
            a={{ prefix: "W", value: tracedW, label: "Width", onCommit: (w) => resize(w, tracedH) }}
            b={{ prefix: "D", value: tracedH, label: "Depth", onCommit: (h) => resize(tracedW, h) }}
            disabled={room.locked}
          />
        ) : (
          <p className="muted small">
            Traced extent {tracedW.toFixed(2)} × {tracedH.toFixed(2)} m
            <Info>Click an edge length on the plan to type a new one.</Info>
          </p>
        )}

        <PairField
          label="Size printed on the listing"
          a={{ prefix: "W", value: room.dims?.w, placeholder: "w", label: "Printed width", onCommit: (w) => onChange({ dims: { w, h: room.dims?.h ?? 0 } }) }}
          b={{ prefix: "D", value: room.dims?.h, placeholder: "d", label: "Printed depth", onCommit: (h) => onChange({ dims: { w: room.dims?.w ?? 0, h } }) }}
        >
          {chip && (
            <p className="kit-chip" title={chip.tip}>
              <span>{chip.text}</span>
              <span aria-hidden="true">·</span>
              <span>Check scale</span>
            </p>
          )}
        </PairField>

        <label className="check" title="Keep the corners and edge lengths from being dragged or typed over by accident">
          <input type="checkbox" checked={!!room.locked} onChange={(e) => onChange({ locked: e.target.checked || undefined })} /> Lock shape
        </label>

        {r && (
          <details className="advanced">
            <summary>Advanced</summary>
            <div className="field">
              <span className="kit-label">Corner that stays put</span>
              <div className="anchor-grid" role="group" aria-label="Corner that stays put">
                {CORNERS.map(([c, arrow, name]) => (
                  <button key={c} disabled={room.locked} className={anchor === c ? "active" : ""} aria-pressed={anchor === c} title={`Keep the ${name} corner fixed`} onClick={() => setAnchor(c)}>
                    {arrow}
                  </button>
                ))}
              </div>
            </div>
          </details>
        )}
      </Section>

      <Section id="build.room.details" title="Details" summary={detailsSummary(room, roomPhotos.length)}>
        <label>
          Notes
          <textarea rows={3} value={room.notes ?? ""} placeholder="Snags, ideas, quotes…" onChange={(e) => onChange({ notes: e.target.value || undefined })} />
        </label>
        <div className="row check-row">
          <label className="check">
            <input type="checkbox" checked={isUnheated(room)} onChange={(e) => onChange({ unheated: e.target.checked })} /> Unheated (garage, store)
          </label>
          <Info>An unheated room is left out of the heated area in the report.</Info>
        </div>
        <label className="check" title="Tag top-floor rooms that belong to an extension so they can get their own roof">
          <input type="checkbox" checked={room.roofGroup === "extension"} onChange={(e) => onChange({ roofGroup: e.target.checked ? "extension" : undefined })} /> Extension room (gets its own roof)
        </label>
        {roomPhotos.length > 0 && (
          <div className="thumbs">
            {roomPhotos.map((p) => (
              <img key={p.id} src={p.dataUrl} title={p.description} onClick={() => setUi({ selectedPhotoId: p.id })} />
            ))}
          </div>
        )}
      </Section>

      {neighbours.length > 0 && (
        <Section id="build.room.knock" title="Knock through" summary={knockSummary(neighbours.length)}>
          <KnockThrough variant={variant} floor={floor} room={room} />
        </Section>
      )}

      <DangerZone
        label="Delete room"
        question={`Delete ${room.name}?`}
        onConfirm={() => {
          updateFloor(variant, floor.id, (f) => ({ ...f, rooms: f.rooms.filter((x) => x.id !== room.id) }));
          setUi({ selectedRoomId: null });
        }}
      />
    </div>
  );
}

/** A porch canopy: its size (when rectangular), which corner stays put, and delete. */
export function CanopyInspector({
  poly,
  ppm,
  onResize,
  onDelete,
}: {
  poly: Pt[];
  ppm: number;
  onResize: (wPx: number, hPx: number, fixed: Corner) => void;
  onDelete: () => void;
}) {
  const [anchor, setAnchor] = useState<Corner>("tl");
  const size = canopySize(poly);
  const b = bbox(poly);
  const w = (size?.w ?? b.w) / ppm;
  const h = (size?.h ?? b.h) / ppm;
  return (
    <div className="inspector canopy-inspector">
      <b>Porch canopy</b>
      <p className="muted small">
        Roof area {formatArea(areaM2(poly, ppm))}
        <Info>Roofed at this floor's ceiling; choose flat or lean-to under Exterior.</Info>
      </p>
      {size ? (
        <div className="field">
          <span className="field-label">
            Size, width × depth (m)
            <Info>The highlighted corner stays put. Drag the corners on the plan, or drag the canopy to move it.</Info>
          </span>
          <div className="size-row">
            <NumberField value={w} min={0.1} label="Canopy width" onCommit={(v) => onResize(v * ppm, h * ppm, anchor)} />
            <span>×</span>
            <NumberField value={h} min={0.1} label="Canopy depth" onCommit={(v) => onResize(w * ppm, v * ppm, anchor)} />
            <div className="anchor-grid" role="group" aria-label="Corner that stays put">
              {CORNERS.map(([c, arrow, name]) => (
                <button key={c} className={anchor === c ? "active" : ""} title={`Keep the ${name} corner fixed`} onClick={() => setAnchor(c)}>
                  {arrow}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="muted small">
          Extent {w.toFixed(2)} × {h.toFixed(2)} m
          <Info>Drag the corners on the plan to reshape it.</Info>
        </p>
      )}
      <button
        className="danger"
        onClick={async () => {
          if (await ask("Delete this canopy?", { ok: "Delete", danger: true })) onDelete();
        }}
      >
        Delete canopy
      </button>
    </div>
  );
}

/** Print, size, orientation and frame of a framed picture. */
function PictureFields({ fixture, item, locked, onChange }: { fixture: Fixture; item: CatalogueItem; locked?: boolean; onChange: (p: Partial<Fixture>) => void }) {
  const w = fixture.w ?? item.w;
  const h = fixture.h ?? item.h;
  const std = pictureSizeOf(w, h);
  const orientation: Orientation = std?.orientation ?? (h >= w ? "portrait" : "landscape");
  const turn = (o: Orientation) => {
    if (o === orientation) return;
    onChange({ w: h, h: w });
  };
  return (
    <>
      <label>
        Print
        <select value={fixture.print ?? PRINTS[0].id} disabled={locked} onChange={(e) => onChange({ print: e.target.value })}>
          {PRINTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Size
        <select
          value={std?.id ?? "custom"}
          disabled={locked}
          onChange={(e) => {
            const size = pictureSize(e.target.value, orientation);
            if (size) onChange(size);
          }}
        >
          {PICTURE_SIZES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {!std && <option value="custom">Custom ({(w * 100).toFixed(0)} × {(h * 100).toFixed(0)} cm)</option>}
        </select>
      </label>
      <label>
        Hung
        <select value={orientation} disabled={locked} onChange={(e) => turn(e.target.value as Orientation)}>
          <option value="portrait">Portrait (tall)</option>
          <option value="landscape">Landscape (wide)</option>
        </select>
      </label>
      <label>
        Frame
        <select value={fixture.frame ?? "black"} disabled={locked} onChange={(e) => onChange({ frame: e.target.value as PictureFrame })}>
          {(Object.keys(FRAME_LABEL) as PictureFrame[]).map((k) => (
            <option key={k} value={k}>
              {FRAME_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

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
            min={-0.001}
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
              <NumberField value={ends.lo} min={-0.001} label={vertical ? "From top end" : "From left end"} onCommit={(m) => onChange(placeFromEnd(floor, opening, "lo", m))} />
            </label>
            <label>
              {vertical ? "From bottom end (m)" : "From right end (m)"}
              <NumberField value={ends.hi} min={-0.001} label={vertical ? "From bottom end" : "From right end"} onCommit={(m) => onChange(placeFromEnd(floor, opening, "hi", m))} />
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
                min={-0.001}
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

export function WallInspector({
  wall,
  mode,
  onChange,
  onDelete,
}: {
  wall: Wall;
  /** Which mode the panel is for (Build: height and delete; Decorate: colour). */
  mode?: Mode;
  onChange: (p: Partial<Wall>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="inspector">
      <h4>
        Wall
        {mode !== "decorate" && <Info>Doors, windows and gaps can be placed on it like any other wall.</Info>}
      </h4>
      {mode !== "decorate" && (
      <label>
        Height (m, blank = full height)
        <input
          type="number"
          step="0.1"
          min="0.1"
          value={wall.height ?? ""}
          placeholder="full"
          onChange={(e) => onChange({ height: e.target.value === "" ? undefined : parseFloat(e.target.value) || undefined })}
        />
      </label>
      )}
      {mode === "decorate" && (
        <SwatchField dulux label="Colour" value={wall.color ?? "#f4f1ea"} isSet={!!wall.color} onChange={(color) => onChange({ color })} onReset={() => onChange({ color: undefined })} />
      )}
      {mode !== "decorate" && (
        <>
          <button className="danger" onClick={onDelete}>
            Delete wall
          </button>
        </>
      )}
    </div>
  );
}

export function FixtureInspector({
  fixture,
  item,
  clash,
  groupSize,
  onSelectGroup,
  onChange,
  onDuplicate,
  onCopy,
  onPaste,
  onRemove,
  onRefit,
  misfit,
  ceiling,
  variant,
}: {
  fixture: Fixture;
  item: CatalogueItem;
  /** The layout the fixture is in: enables the circuit field of electrical points. */
  variant?: VariantKey;
  /** The room's ceiling height, for floor-to-ceiling items. */
  ceiling?: number;
  clash: boolean;
  /** Members of the group this item belongs to (shown when it was picked alone). */
  groupSize?: number;
  onSelectGroup?: () => void;

  onChange: (p: Partial<Fixture>) => void;
  onDuplicate: () => void;
  onCopy: () => void;
  /** Present when the clipboard holds something to paste. */
  onPaste?: () => void;
  onRemove: () => void;
  /** Re-run the fit (recess or window); present for built-ins and window seats. */
  onRefit?: () => void;
  /** Why a fitted unit no longer fits its recess or window. */
  misfit?: string;
}) {
  const resized = fixture.w !== undefined || fixture.d !== undefined || fixture.h !== undefined;
  const rot = Math.round(fixture.rot) % 360;
  const locked = !!fixture.locked;
  return (
    <div className="inspector fixture-inspector">
      <h4>{item.name}</h4>
      {fixture.piece && <PieceLink fixture={fixture} />}
      <div className="row">
        <button className={locked ? "active" : ""} aria-pressed={locked} onClick={() => onChange({ locked: !fixture.locked || undefined })} title="Locked items can be selected but not moved, turned or resized on the plan">
          {locked ? "Unlock" : "Lock position"}
        </button>
      </div>
      {locked && <p className="muted small">Locked: unlock to move or resize.</p>}
      {item.note && <p className="muted small">{item.note}</p>}
      {clash && <p className="small warn">Overlaps another item.</p>}
      {misfit && <p className="small warn">{misfit}</p>}
      {groupSize !== undefined && groupSize > 1 && onSelectGroup && (
        <p className="muted small">
          Part of a group of {groupSize} ·{" "}
          <button className="link" onClick={onSelectGroup}>
            Select group
          </button>
        </p>
      )}
      <label>
        Label
        <input value={fixture.label ?? ""} placeholder="Shown on the plan" onChange={(e) => onChange({ label: e.target.value || undefined })} />
      </label>
      {isTv(item) && (
        <label>
          Screen size
          <select
            value={tvInches(fixture.w ?? item.w) ?? "custom"}
            disabled={locked}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n) onChange(tvSize(item, n));
            }}
          >
            {TV_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} inch
              </option>
            ))}
            {tvInches(fixture.w ?? item.w) === undefined && <option value="custom">Custom ({((fixture.w ?? item.w) / 0.0254 / Math.cos(Math.atan(9 / 16))).toFixed(0)} inch)</option>}
          </select>
        </label>
      )}
      <div className="field">
        <span className="field-label">Width × depth × height (m)</span>
        <div className="size-row">
          <NumberField value={fixture.w ?? item.w} label="Width" disabled={locked} onCommit={(w) => onChange({ w })} />
          <NumberField value={fixture.d ?? item.d} label="Depth" disabled={locked} onCommit={(d) => onChange({ d })} />
          <NumberField value={fixtureBox(fixture, item, ceiling).h} label="Height" disabled={locked} onCommit={(h) => onChange({ h })} />
        </div>
        {resized && (
          <button className="link" disabled={locked} onClick={() => onChange({ w: undefined, d: undefined, h: undefined })}>
            Reset to {item.w.toFixed(2)} × {item.d.toFixed(2)} × {item.toCeiling && ceiling ? `${ceiling.toFixed(2)} (the ceiling)` : item.h.toFixed(2)} m
          </button>
        )}
      </div>
      {isPicture(item) && <PictureFields fixture={fixture} item={item} locked={locked} onChange={onChange} />}
      {isCornerUnit(item) && (
        <label>
          Front
          <select value={fixture.front ?? "flat"} disabled={locked} onChange={(e) => onChange({ front: e.target.value === "curved" ? "curved" : undefined })}>
            <option value="flat">Flat diagonal</option>
            <option value="curved">Curved</option>
          </select>
        </label>
      )}
      {isCornerUnit(item) && (
        <div className="field">
          <span className="field-label">
            Square ends, back leg × side leg (m)
            <Info>How far out from each wall the front starts, so the unit can sit square against a chimney breast or an alcove unit. 0 runs the front wall to wall.</Info>
          </span>
          <div className="size-row">
            <NumberField value={fixture.endBack ?? 0} label="Square end on the back leg" min={-0.001} disabled={locked} onCommit={(v) => onChange({ endBack: v > 0 ? v : undefined })} />
            <NumberField value={fixture.endSide ?? 0} label="Square end on the side leg" min={-0.001} disabled={locked} onCommit={(v) => onChange({ endSide: v > 0 ? v : undefined })} />
          </div>
        </div>
      )}
      {hasSeatDepth(item) && (
        <div className="field">
          <span className="field-label">Seat depth (m)</span>
          <NumberField
            value={(item.symbol === "corner-sofa" ? cornerSofaSizes : chaiseSizes)(fixture.w ?? item.w, fixture.d ?? item.d, fixture.seat).s}
            label="Seat depth"
            min={MIN_SEAT}
            disabled={locked}
            onCommit={(seat) => onChange({ seat })}
          />
          {fixture.seat !== undefined && (
            <button className="link" disabled={locked} onClick={() => onChange({ seat: undefined })}>
              Reset to the size's own
            </button>
          )}
        </div>
      )}
      {item.mount !== undefined && !isCeilingItem(item) && !pointKind(item) && (
        <div className="field">
          <span className="field-label">Height above floor (m)</span>
          <NumberField value={mountOf(fixture, item)} label="Height above floor" min={-0.001} onCommit={(mount) => onChange({ mount: Math.max(0, mount) })} />
          {fixture.mount !== undefined && fixture.mount !== item.mount && (
            <button className="link" onClick={() => onChange({ mount: undefined })}>
              Reset to {item.mount.toFixed(2)} m
            </button>
          )}
        </div>
      )}
      {isCeilingItem(item) && (
        <div className="field">
          <span className="field-label">Drop below ceiling (m)</span>
          <NumberField value={dropOf(fixture, item)} label="Drop below ceiling" min={0} onCommit={(drop) => onChange({ drop: Math.max(0, drop) })} />
          {fixture.drop !== undefined && fixture.drop !== dropOf({}, item) && (
            <button className="link" onClick={() => onChange({ drop: undefined })}>
              Reset to {dropOf({}, item).toFixed(2)} m
            </button>
          )}
        </div>
      )}
      {item.symbol === "downlight-grid" && (
        <div className="field">
          <span className="field-label">Spacing (m)</span>
          <NumberField value={pitchOf(fixture, item)} label="Spacing" min={0.3} onCommit={(pitch) => onChange({ pitch: Math.max(0.3, pitch) })} />
        </div>
      )}
      {pointKind(item) && <PointFields fixture={fixture} item={item} ceiling={ceiling} locked={locked} variant={variant} onChange={onChange} />}
      {(isLightItem(item) || isSwitchItem(item)) && (
        <div className="row check-row">
          <label className="check">
            <input type="checkbox" checked={switchedOn(fixture)} onChange={(e) => onChange({ on: e.target.checked ? undefined : false })} /> Switched on
          </label>
          <Info>{isSwitchItem(item) ? "A switch that is off darkens the lights it controls." : "Lit when the sun study's Lights master allows: Auto lights it from dusk, On always."}</Info>
        </div>
      )}
      {isLightItem(item) && (
        <>
          <label>
            Warmth
            <select value={warmthOf(fixture)} disabled={locked} onChange={(e) => { const v = parseInt(e.target.value); onChange({ warmth: v === 2700 ? undefined : (v as LightWarmth) }); }}>
              {WARMTHS.map((k) => (
                <option key={k} value={k}>
                  {WARMTH_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dimmer {Math.round(dimOf(fixture) * 100)}%
            <input type="range" min={10} max={100} step={5} disabled={locked} value={Math.round(dimOf(fixture) * 100)} onChange={(e) => { const v = parseInt(e.target.value); onChange({ dim: v === 100 ? undefined : v }); }} />
          </label>
        </>
      )}
      {item.symbol === "rug" && (
        <label>
          Pattern
          <select value={rugPattern(fixture) ?? ""} disabled={locked} onChange={(e) => onChange({ rug: e.target.value || undefined })}>
            <option value="">Plain</option>
            {RUG_PATTERNS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {!(item.symbol === "rug" && rugPattern(fixture)) && (
        <SwatchField label="Colour" value={fixture.color ?? item.color} isSet={!!fixture.color} onChange={(color) => onChange({ color })} onReset={() => onChange({ color: undefined })} />
      )}
      {(isJoinery(item) || item.symbol === "shaker-wardrobe") && <JoineryFields fixture={fixture} item={item} ceiling={ceiling} locked={locked} onChange={onChange} onRefit={onRefit} />}
      {hasWorktop(item) && (
        <SwatchField
          label="Worktop colour"
          value={fixture.worktop ?? DEFAULT_WORKTOP}
          isSet={!!fixture.worktop}
          onChange={(worktop) => onChange({ worktop })}
          onReset={() => onChange({ worktop: undefined })}
        />
      )}
      <label>
        Rotation {rot}°
        <input type="range" min={0} max={345} step={15} disabled={locked} value={Math.round(rot / 15) * 15} onChange={(e) => onChange({ rot: parseInt(e.target.value) })} />
      </label>
      <div className="row">
        <button disabled={locked} onClick={() => onChange({ rot: turn(fixture.rot, 90) })} title="R">
          Rotate 90°
        </button>
        <button onClick={onDuplicate} title="Ctrl+D or Cmd+D">
          Duplicate
        </button>
        <button onClick={onCopy} title="Ctrl+C or Cmd+C: copy, then paste on any floor or layout">
          Copy
        </button>
        {onPaste && (
          <button onClick={onPaste} title="Ctrl+V or Cmd+V">
            Paste
          </button>
        )}
        <button className="danger" onClick={onRemove} title="Delete">
          Remove
        </button>
      </div>
      <p className="muted small hint-row">
        Moving furniture
        <Info>Drag to move; near a wall its back snaps to the wall (hold Alt to place freely). Click it again to pick the item under it. R turns 90°, Shift+R 15°.</Info>
      </p>
    </div>
  );
}

const CEILING_DEFAULT = 2.4;

/** Circuit choice for one or more points; "Mixed" when they differ. */
function CircuitSelect({ variant, ids }: { variant: VariantKey; ids: string[] }) {
  const circuits = useStore((s) => s.variants[variant]?.circuits);
  const updateModel = useStore((s) => s.updateModel);
  const current = new Set(ids.map((id) => circuitOf(circuits, id)?.id ?? ""));
  const value = current.size === 1 ? [...current][0] : "mixed";
  return (
    <label>
      Circuit
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === "mixed") return;
          updateModel(variant, { circuits: assignToCircuit(circuits, e.target.value || null, ids) });
        }}
      >
        {value === "mixed" && <option value="mixed">Mixed</option>}
        <option value="">None</option>
        {(circuits ?? []).map((c: Circuit) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Settings of an electrical point: centre height, switch links and circuit. */
function PointFields({ fixture, item, ceiling, locked, variant, onChange }: { fixture: Fixture; item: CatalogueItem; ceiling?: number; locked: boolean; variant?: VariantKey; onChange: (p: Partial<Fixture>) => void }) {
  const model = useModel();
  const linkSwitchId = useStore((s) => s.linkSwitchId);
  const setUi = useStore((s) => s.setUi);
  const wall = isWallPoint(item) && item.mount !== undefined;
  const centre = centreHeight(fixture, item, ceiling ?? CEILING_DEFAULT);
  const defaultCentre = (item.mount ?? 0) + item.h / 2;
  const linkGang = useStore((s) => s.linkGang);
  const gangs = isSwitchItem(item) ? gangCount(item) : 0;
  const labels = useMemo(() => {
    if (!isSwitchItem(item) || !model) return new Map<string, string>();
    return new Map(numberPoints(model).map((p) => [p.fx.id, `${p.room.name} ${p.label}`]));
  }, [model, item]);
  const unlink = (lightId: string, g: number) => onChange(toggleLink(fixture, lightId, g));
  const gangBlock = (g: number, heading: boolean) => {
    const linking = linkSwitchId === fixture.id && linkGang === g;
    const lights = gangOf(fixture, g).controls.flatMap((id) => (labels.has(id) ? [{ id, label: labels.get(id)! }] : []));
    return (
      <div className="field" key={g}>
        <span className="field-label">{heading ? gangLabel(g) : "Lights"}</span>
        {heading && (
          <label className="check">
            <input type="checkbox" checked={gangOf(fixture, g).on} disabled={locked} onChange={(e) => onChange(setGang(fixture, g, { on: e.target.checked }))} />
            Switched on
          </label>
        )}
        {lights.length === 0 ? (
          <p className="muted small">No lights linked yet.</p>
        ) : (
          <ul className="multi-list small link-list">
            {lights.map((l) => (
              <li key={l.id}>
                {l.label}{" "}
                <button className="link" aria-label={`Unlink ${l.label}`} title="Unlink" onClick={() => unlink(l.id, g)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className={linking ? "active" : ""} aria-pressed={linking} onClick={() => setUi(linking ? { linkSwitchId: null, linkGang: 0 } : { linkSwitchId: fixture.id, linkGang: g })}>
          {linking ? "Done" : "Link lights"}
        </button>
        {linking && <p className="muted small">{heading ? "Tap lights on the plan to put them on this rocker, or tap again to take them off." : "Tap lights on the plan to link or unlink them."}</p>}
      </div>
    );
  };
  return (
    <>
      {wall && (
        <div className="field">
          <span className="field-label">Centre height (m)</span>
          <NumberField value={Math.round(centre * 1000) / 1000} label="Centre height" min={-0.001} disabled={locked} onCommit={(c) => onChange({ mount: mountForCentre(c, fixture, item) })} />
          {Math.abs(centre - defaultCentre) > 0.0005 && (
            <button className="link" disabled={locked} onClick={() => onChange({ mount: undefined })}>
              Reset to {defaultCentre.toFixed(2)} m
            </button>
          )}
        </div>
      )}
      {Array.from({ length: gangs }, (_, g) => gangBlock(g, gangs > 1))}
      {variant && <CircuitSelect variant={variant} ids={[fixture.id]} />}
    </>
  );
}

const FRONT_OPTIONS = Object.keys(JOINERY_FRONT_LABEL) as JoineryFront[];
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Settings of fitted joinery: built-ins, window seats, wall boxes and floating-shelf stacks. */
function JoineryFields({
  fixture,
  item,
  ceiling,
  locked,
  onChange,
  onRefit,
}: {
  fixture: Fixture;
  item: CatalogueItem;
  ceiling?: number;
  locked: boolean;
  onChange: (p: Partial<Fixture>) => void;
  onRefit?: () => void;
}) {
  const box = fixtureBox(fixture, item, ceiling);
  const j = joineryOf(fixture, item, box);
  const set = (p: Parameters<typeof patchJoinery>[1]) => onChange(patchJoinery(fixture, p));
  const sym = item.symbol;
  const colourField = (label: string, value: string, isSet: boolean, change: (c: string) => void, reset: () => void) => (
    <SwatchField label={label} value={value} isSet={isSet} onChange={change} onReset={reset} dulux />
  );
  const frontSelect = (label: string, value: JoineryFront, change: (v: JoineryFront) => void, openLabel?: string) => (
    <label>
      {label}
      <select value={value} onChange={(e) => change(e.target.value as JoineryFront)}>
        {FRONT_OPTIONS.map((f) => (
          <option key={f} value={f}>
            {f === "open" && openLabel ? openLabel : JOINERY_FRONT_LABEL[f]}
          </option>
        ))}
      </select>
    </label>
  );
  const baysField = (
    <div className="field">
      <span className="field-label">Bays</span>
      <NumberField value={j.bays} label="Bays" step={1} min={0.5} max={12} onCommit={(v) => set({ bays: Math.round(Math.min(12, Math.max(1, v))) })} />
      {fixture.joinery?.bays !== undefined && (
        <button className="link" onClick={() => set({ bays: undefined })}>
          Auto
        </button>
      )}
    </div>
  );
  const shakerColours = (
    <>
      {colourField("Trim colour", j.trim ?? fixture.color ?? item.color, j.trim !== undefined, (c) => set({ trim: c }), () => set({ trim: undefined }))}
      {colourField("Panel colour", j.panel ?? fixture.color ?? item.color, j.panel !== undefined, (c) => set({ panel: c }), () => set({ panel: undefined }))}
    </>
  );
  const toCeiling = fixture.h === undefined || (ceiling !== undefined && fixture.h >= ceiling);
  const refitLabel =
    (fixture.joinery?.fit ?? (sym === "window-seat" ? "window" : undefined)) === "window" ? "Fit to window" : fixture.joinery?.fit ? "Refit to recess" : "Fit to recess";
  return (
    <>
      {sym === "built-in" && (
        <>
          {baysField}
          <div className="field">
            <span className="field-label">Base height (m)</span>
            <NumberField value={j.baseH} label="Base height" min={-0.001} onCommit={(v) => set({ baseH: Math.max(0, v) })} />
            <small className="muted">0 = no base cupboards.</small>
          </div>
          {j.baseH > 0 && frontSelect("Base fronts", j.baseFront, (v) => set({ baseFront: v }))}
          {j.baseH > 0 && (
            <label>
              <input type="checkbox" checked={j.top} onChange={(e) => set({ top: e.target.checked })} /> Top on the base
            </label>
          )}
          <label>
            <input type="checkbox" checked={j.plinth} onChange={(e) => set({ plinth: e.target.checked })} /> Plinth
          </label>
          <div className="field">
            <span className="field-label">Shelves above</span>
            <NumberField value={j.shelves} label="Shelves above" step={1} min={-0.001} max={12} onCommit={(v) => set({ shelves: Math.round(Math.min(12, Math.max(0, v))) })} />
          </div>
          {frontSelect("Above the base", j.upperFront, (v) => set({ upperFront: v }), "Open shelves")}
          <div className="field">
            <span className="field-label">Shelf depth above (m)</span>
            <NumberField value={j.upperD} label="Shelf depth above" onCommit={(v) => set({ upperD: v })} />
            {fixture.joinery?.upperD !== undefined && (
              <button className="link" onClick={() => set({ upperD: undefined })}>
                Full depth
              </button>
            )}
          </div>
          <div className="field">
            <span className="field-label">Top box (m)</span>
            <NumberField value={j.topBox} label="Top box" min={-0.001} onCommit={(v) => set({ topBox: Math.max(0, v) })} />
            <small className="muted">0 = none.</small>
          </div>
          {item.toCeiling && (
            <label>
              <input
                type="checkbox"
                checked={toCeiling}
                disabled={locked}
                onChange={(e) => onChange({ h: e.target.checked ? undefined : round2(Math.min(2.1, (ceiling ?? 2.4) - 0.15)) })}
              />{" "}
              To ceiling
            </label>
          )}
          {colourField("Carcass colour", j.carcass, fixture.joinery?.carcass !== undefined, (c) => set({ carcass: c }), () => set({ carcass: undefined }))}
          {(j.baseFront === "shaker" || j.upperFront === "shaker") && shakerColours}
          {j.top && colourField("Top colour", j.topColor, fixture.worktop !== undefined, (c) => onChange({ worktop: c }), () => onChange({ worktop: undefined }))}
        </>
      )}
      {sym === "shaker-wardrobe" && shakerColours}
      {sym === "window-seat" && (
        <>
          <label>
            Front
            <select value={j.seatFront} onChange={(e) => set({ seatFront: e.target.value as SeatFront })}>
              {(Object.keys(SEAT_FRONT_LABEL) as SeatFront[]).map((f) => (
                <option key={f} value={f}>
                  {SEAT_FRONT_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={j.plinth} onChange={(e) => set({ plinth: e.target.checked })} /> Plinth
          </label>
          <label>
            <input type="checkbox" checked={j.backCushion} onChange={(e) => set({ backCushion: e.target.checked })} /> Back cushions
          </label>
          {colourField("Cushion colour", j.cushion, fixture.joinery?.cushion !== undefined && fixture.joinery.cushion !== DEFAULT_CUSHION, (c) => set({ cushion: c }), () => set({ cushion: undefined }))}
        </>
      )}
      {sym === "wall-box" && (
        <>
          {frontSelect("Front", j.front, (v) => set({ front: v }))}
          {baysField}
          <div className="field">
            <span className="field-label">Shelves inside</span>
            <NumberField value={j.shelves} label="Shelves inside" step={1} min={-0.001} max={12} onCommit={(v) => set({ shelves: Math.round(Math.min(12, Math.max(0, v))) })} />
          </div>
        </>
      )}
      {sym === "shelf" &&
        (() => {
          const st = shelfStack(j, box.h);
          return (
            <>
              <div className="field">
                <span className="field-label">Shelves</span>
                <NumberField value={st.n} label="Shelves" step={1} min={0.5} max={12} onCommit={(n) => onChange(shelfStackPatch(fixture, item, { n }))} />
              </div>
              {st.n > 1 && (
                <div className="field">
                  <span className="field-label">Spacing (m)</span>
                  <NumberField value={st.spacing} label="Spacing" onCommit={(spacing) => onChange(shelfStackPatch(fixture, item, { spacing }))} />
                </div>
              )}
              <div className="field">
                <span className="field-label">Thickness (m)</span>
                <NumberField value={st.t} label="Thickness" onCommit={(t) => onChange(shelfStackPatch(fixture, item, { t }))} />
              </div>
              <p className="muted small">Height is the whole stack.</p>
            </>
          );
        })()}
      {onRefit && (
        <div className="row">
          <button disabled={locked} onClick={onRefit}>
            {refitLabel}
          </button>
          <Info>Puts its back on the nearest wall and sizes it between the side walls (a window seat to its window). It doesn't follow later wall changes; refit after moving walls.</Info>
        </div>
      )}
    </>
  );
}

/** Two or more pieces of furniture selected (often one group): list them and act on all together. */
export function MultiFixtureInspector({
  fixtures,
  isGroup,
  onPick,
  onGroup,
  onUngroup,
  onTurn,
  onDuplicate,
  onCopy,
  onRemove,
  onColour,
  onLock,
  variant,
}: {
  /** The layout the items are in: enables the circuit field when every item is an electrical point. */
  variant?: VariantKey;
  fixtures: Fixture[];
  /** The selection is exactly one group. */
  isGroup: boolean;
  onPick: (id: string) => void;
  onGroup: () => void;
  onUngroup: () => void;
  onTurn: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onRemove: () => void;
  onColour: (color: string) => void;
  /** Lock (true) or unlock (false) every selected item. */
  onLock: (on: boolean) => void;
}) {
  const anyGrouped = fixtures.some((f) => f.groupId);
  const first = fixtures[0];
  const firstItem = first ? byId(first.type) : undefined;
  return (
    <div className="inspector fixture-inspector">
      <h4>{isGroup ? `Group · ${fixtures.length} items` : `${fixtures.length} items`}</h4>
      <ul className="multi-list small">
        {fixtures.map((f) => (
          <li key={f.id}>
            <button className="link" onClick={() => onPick(f.id)} title="Select just this one">
              {f.label ?? byId(f.type)?.name ?? "Item"}
            </button>
          </li>
        ))}
      </ul>
      <SwatchField label="Colour" value={first?.color ?? firstItem?.color ?? "#cccccc"} isSet={!!first?.color} onChange={onColour} />
      {variant && fixtures.length > 0 && fixtures.every((f) => { const it = byId(f.type); return !!it && !!pointKind(it); }) && <CircuitSelect variant={variant} ids={fixtures.map((f) => f.id)} />}
      <div className="row">
        {!isGroup && (
          <button onClick={onGroup} title="Ctrl+G or Cmd+G">
            Group
          </button>
        )}
        {anyGrouped && (
          <button onClick={onUngroup} title="Ctrl+Shift+G or Cmd+Shift+G">
            Ungroup
          </button>
        )}
        <button onClick={() => onLock(!fixtures.every((f) => f.locked))} title="Locked items can be selected but not moved or turned on the plan">
          {fixtures.every((f) => f.locked) ? "Unlock all" : "Lock all"}
        </button>
        <button disabled={fixtures.some((f) => f.locked)} onClick={onTurn} title="R">
          Turn 90°
        </button>
        <button onClick={onDuplicate} title="Ctrl+D or Cmd+D">
          Duplicate
        </button>
        <button onClick={onCopy} title="Ctrl+C or Cmd+C">
          Copy
        </button>
        <button className="danger" onClick={onRemove} title="Delete">
          Remove
        </button>
      </div>
      <p className="muted small hint-row">
        Moving several
        <Info>Drag any of them to move the lot. R turns them about their centre. Shift+click adds or removes an item; Ctrl/Cmd+click picks one item inside a group.</Info>
      </p>
    </div>
  );
}

export function FloorSettings({ variant, floor }: { variant: VariantKey; floor: Floor }) {
  const updateFloor = useStore((s) => s.updateFloor);
  const setVariant = useStore((s) => s.setVariant);
  const model = useStore((s) => s.variants[variant]);
  const setUi = useStore((s) => s.setUi);
  const withDims = floor.rooms.filter((r) => r.dims && r.dims.w > 0 && r.dims.h > 0).length;
  const allLocked = floor.rooms.length > 0 && floor.rooms.every((r) => r.locked);
  return (
    <div className="inspector">
      <Section id="build.floor.settings" title="Floor settings" summary={floorSettingsSummary(floor)}>
      {floor.rooms.length > 0 && (
        <label className="check" title="Locked rooms keep their corners and size when you drag on the plan">
          <input
            type="checkbox"
            checked={allLocked}
            onChange={() => updateFloor(variant, floor.id, (f) => ({ ...f, rooms: f.rooms.map((r) => ({ ...r, locked: allLocked ? undefined : true })) }))}
          />{" "}
          Lock rooms on this floor
        </label>
      )}
      <label>
        Floor name
        <NameField value={floor.name} onCommit={(name) => updateFloor(variant, floor.id, { name })} />
      </label>
      <label>
        Level (0 = ground)
        <input type="number" value={floor.level} onChange={(e) => updateFloor(variant, floor.id, { level: parseInt(e.target.value) || 0 })} />
      </label>
      <label>
        Scale (px per metre)
        <NumberField value={floor.pxPerM} step={0.1} label="Scale" onCommit={(pxPerM) => updateFloor(variant, floor.id, { pxPerM })} />
      </label>
      <button
        title="Opens the plan with the calibrate tool: click two points a known distance apart"
        onClick={() => {
          setUi({ tab: "plan", editFloorId: floor.id });
          requestPlanTool("calibrate");
        }}
      >
        Calibrate from two points…
      </button>
      <button
        disabled={!withDims}
        title="Uses the printed sizes you entered on rooms"
        onClick={() => {
          const est = estimatePxPerM(floor.rooms);
          if (est) updateFloor(variant, floor.id, { pxPerM: est });
        }}
      >
        Scale from printed sizes ({withDims} room{withDims === 1 ? "" : "s"})
      </button>
      <label>
        Stacking offset (m)
        <span className="row">
          <input type="number" step="0.1" value={floor.offset.x} onChange={(e) => updateFloor(variant, floor.id, { offset: { ...floor.offset, x: parseFloat(e.target.value) || 0 } })} />
          <input type="number" step="0.1" value={floor.offset.y} onChange={(e) => updateFloor(variant, floor.id, { offset: { ...floor.offset, y: parseFloat(e.target.value) || 0 } })} />
        </span>
      </label>
      <div className="row">
        <button
          disabled={floor.rooms.length === 0}
          title="Put the centre of this floor's rooms at the model origin so floors stack"
          onClick={() => {
            const b = bbox(floor.rooms.flatMap((r) => r.polygon));
            updateFloor(variant, floor.id, { origin: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, offset: { x: 0, y: 0 } });
          }}
        >
          Re-centre floor
        </button>
        <button
          className="danger"
          onClick={async () => {
            if (!model || !(await ask(`Delete ${floorDisplayName(floor.name)} and its rooms?`, { ok: "Delete", danger: true }))) return;
            const floors = model.floors.filter((f) => f.id !== floor.id);
            if (floors.length) setVariant(variant, { ...model, floors });
            else setVariant(variant, undefined);
            setUi({ editFloorId: floors[0]?.id ?? null, selectedRoomId: null, tab: floors.length ? "plan" : "3d" });
          }}
        >
          Delete floor
        </button>
      </div>
      </Section>
      <Section id="build.floor.stairs" title="Stairs" summary={stairsSummary(floor)}>
      {floor.stairs ? (
        <>
          <label>
            Direction
            <select value={floor.stairsDir ?? "up"} onChange={(e) => updateFloor(variant, floor.id, { stairsDir: e.target.value as StairsDir })}>
              {(Object.keys(STAIRS_DIR_LABEL) as StairsDir[]).map((d) => (
                <option key={d} value={d}>
                  {STAIRS_DIR_LABEL[d]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bottom of the flight
            <select
              value={floor.stairsTurn ?? "straight"}
              onChange={(e) => updateFloor(variant, floor.id, { stairsTurn: e.target.value === "straight" ? undefined : (e.target.value as "left" | "right") })}
            >
              <option value="straight">Straight</option>
              <option value="left">Turns: step on from the left</option>
              <option value="right">Turns: step on from the right</option>
            </select>
          </label>
          <label>
            Top of the flight
            <select
              value={floor.stairsTopTurn ?? "straight"}
              onChange={(e) => updateFloor(variant, floor.id, { stairsTopTurn: e.target.value === "straight" ? undefined : (e.target.value as "left" | "right") })}
            >
              <option value="straight">Straight onto the landing</option>
              <option value="left">Turns left onto the landing</option>
              <option value="right">Turns right onto the landing</option>
            </select>
          </label>
          {floor.stairsTopTurn && (
            <label>
              Winders at the top
              <select value={floor.stairsTopWinders ?? 2} onChange={(e) => updateFloor(variant, floor.id, { stairsTopWinders: parseInt(e.target.value, 10) === 3 ? 3 : 2 })}>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
          )}
          <label>
            Length × width (m)
            <span className="row">
              <input type="number" step="0.1" min="1" value={floor.stairsLen ?? 2.6} onChange={(e) => updateFloor(variant, floor.id, { stairsLen: parseFloat(e.target.value) || 2.6 })} />
              <input type="number" step="0.1" min="0.6" value={floor.stairsWidth ?? 0.9} onChange={(e) => updateFloor(variant, floor.id, { stairsWidth: parseFloat(e.target.value) || 0.9 })} />
            </span>
          </label>
          <p className="muted small">
            Stairs
            <Info>The flight is drawn only on floors that have a floor above; on the top floor the marker is where it arrives.</Info>
          </p>
          <button onClick={() => updateFloor(variant, floor.id, { stairs: undefined })}>Remove stairs</button>
        </>
      ) : (
        <button
          onClick={() => {
            // Centre of the rooms, or of the image on a floor with none yet.
            const b = floor.rooms.length ? bbox(floor.rooms.flatMap((r) => r.polygon)) : { x0: 0, y0: 0, x1: floor.imageW, y1: floor.imageH };
            updateFloor(variant, floor.id, { stairs: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } });
          }}
        >
          Add stairs (drag to place)
        </button>
      )}
      </Section>
    </div>
  );
}
