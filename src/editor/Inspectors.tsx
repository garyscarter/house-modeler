import { useEffect, useState } from "react";
import type { Fixture, Floor, FloorFinish, Opening, OpeningKind, Room, VariantKey, Wall, WallFinish } from "../types";
import { FLOOR_FINISH_LABEL, OPENING_KIND_LABEL, STAIRS_DIR_LABEL, WALL_FINISH_LABEL, type StairsDir } from "../types";
import type { CatalogueItem } from "../lib/catalogue";
import { useStore } from "../store";
import { bbox, estimatePxPerM } from "../lib/geometry";
import { roomColor } from "../three/House";
import {
  COLOUR_KINDS,
  DOOR_KINDS,
  SWING_KINDS,
  areaM2,
  axisRect,
  comparePrinted,
  defaultHead,
  defaultSill,
  formatArea,
  resizeRect,
  turn,
  type Corner,
} from "../lib/planMath";

const fmt2 = (v: number | undefined) => (v === undefined || !Number.isFinite(v) ? "" : String(Math.round(v * 100) / 100));

/**
 * A number input that commits each valid value as it is typed (so spinners
 * and typing both update live) but never rewrites the text while it has focus,
 * so "3." or a half-typed value is not snatched away.
 */
export function NumberField({
  value,
  onCommit,
  step = 0.01,
  min = 0,
  max,
  placeholder,
  label,
  autoFocus,
  onDone,
  onClear,
}: {
  value: number | undefined;
  onCommit: (v: number) => void;
  step?: number;
  /** Values must be greater than this. */
  min?: number;
  max?: number;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  /** Called on Enter or Escape (e.g. to close a pop-up field). */
  onDone?: () => void;
  /** Called when the field is emptied, for values that fall back to a default. */
  onClear?: () => void;
}) {
  const [text, setText] = useState(fmt2(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt2(value));
  }, [value, focused]);
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      autoFocus={autoFocus}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value === "" && onClear) return onClear();
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && v > min && (max === undefined || v <= max)) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          e.currentTarget.blur();
          onDone?.();
        }
      }}
    />
  );
}

const CORNERS: [Corner, string, string][] = [
  ["tl", "↖", "top-left"],
  ["tr", "↗", "top-right"],
  ["bl", "↙", "bottom-left"],
  ["br", "↘", "bottom-right"],
];

export function RoomInspector({ variant, floor, room, onChange }: { variant: VariantKey; floor: Floor; room: Room; onChange: (p: Partial<Room>) => void }) {
  const updateFloor = useStore((s) => s.updateFloor);
  const photos = useStore((s) => s.photos);
  const setUi = useStore((s) => s.setUi);
  const [anchor, setAnchor] = useState<Corner>("tl");
  const roomPhotos = photos.filter((p) => p.floorName === floor.name && p.roomName === room.name);
  const ppm = floor.pxPerM;
  const r = axisRect(room.polygon, 0.5);
  const b = bbox(room.polygon);
  const tracedW = (r ? r.x1 - r.x0 : b.w) / ppm;
  const tracedH = (r ? r.y1 - r.y0 : b.h) / ppm;
  const cmp = room.dims ? comparePrinted(tracedW, tracedH, room.dims) : null;
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const resize = (w: number, h: number) => onChange({ polygon: resizeRect(room.polygon, w * ppm, h * ppm, anchor) });

  return (
    <div className="inspector room-inspector">
      <label>
        Name
        <input value={room.name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <p className="muted small">Floor area {formatArea(areaM2(room.polygon, ppm))}</p>

      {r ? (
        <div className="field">
          <span className="field-label">Traced size, width × depth (m)</span>
          <div className="size-row">
            <NumberField value={tracedW} label="Width" onCommit={(w) => resize(w, tracedH)} />
            <span>×</span>
            <NumberField value={tracedH} label="Depth" onCommit={(h) => resize(tracedW, h)} />
            <div className="anchor-grid" role="group" aria-label="Corner that stays put">
              {CORNERS.map(([c, arrow, name]) => (
                <button key={c} className={anchor === c ? "active" : ""} title={`Keep the ${name} corner fixed`} onClick={() => setAnchor(c)}>
                  {arrow}
                </button>
              ))}
            </div>
          </div>
          <p className="muted small">The highlighted corner stays put. Tap an edge length on the plan to type a new one.</p>
        </div>
      ) : (
        <p className="muted small">
          Traced extent {tracedW.toFixed(2)} × {tracedH.toFixed(2)} m. Tap an edge length on the plan to type a new one.
        </p>
      )}

      <div className="field">
        <span className="field-label">Printed size on the plan (m)</span>
        <div className="size-row">
          <NumberField value={room.dims?.w} placeholder="w" label="Printed width" onCommit={(w) => onChange({ dims: { w, h: room.dims?.h ?? 0 } })} />
          <span>×</span>
          <NumberField value={room.dims?.h} placeholder="d" label="Printed depth" onCommit={(h) => onChange({ dims: { w: room.dims?.w ?? 0, h } })} />
        </div>
        {cmp && (
          <p className={`small ${cmp.worst > 5 ? "warn" : "muted"}`}>
            Traced {tracedW.toFixed(2)} × {tracedH.toFixed(2)} m against printed {room.dims!.w.toFixed(2)} × {room.dims!.h.toFixed(2)} m: {pct(cmp.w)} / {pct(cmp.h)}
            {cmp.swapped ? " (printed the other way round)" : ""}.
            {cmp.worst > 5 && " More than 5% out: check the tracing or the floor's scale."}
          </p>
        )}
      </div>

      <label>
        Notes
        <textarea rows={3} value={room.notes ?? ""} placeholder="Snags, ideas, quotes…" onChange={(e) => onChange({ notes: e.target.value || undefined })} />
      </label>

      <label>
        Floor finish
        <select value={room.floorFinish ?? "plain"} onChange={(e) => onChange({ floorFinish: e.target.value === "plain" ? undefined : (e.target.value as FloorFinish) })}>
          {(Object.keys(FLOOR_FINISH_LABEL) as FloorFinish[]).map((k) => (
            <option key={k} value={k}>
              {FLOOR_FINISH_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <div className="colour-row">
        <label>
          Floor colour
          <input type="color" value={room.color ?? roomColor(room)} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
        <label>
          Wall paint
          <span className="colour-pick">
            <input type="color" value={room.wallPaint ?? "#f4f1ea"} onChange={(e) => onChange({ wallPaint: e.target.value })} />
            {room.wallPaint && (
              <button className="link" onClick={() => onChange({ wallPaint: undefined })}>
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
      <label className="check" title="Tag top-floor rooms that belong to an extension so they can get their own roof">
        <input type="checkbox" checked={room.roofGroup === "extension"} onChange={(e) => onChange({ roofGroup: e.target.checked ? "extension" : undefined })} /> Part of
        an extension (separate roof)
      </label>
      {roomPhotos.length > 0 && (
        <div className="thumbs">
          {roomPhotos.map((p) => (
            <img key={p.id} src={p.dataUrl} title={p.description} onClick={() => setUi({ selectedPhotoId: p.id })} />
          ))}
        </div>
      )}
      <button
        className="danger"
        onClick={() => {
          if (!window.confirm(`Delete ${room.name}?`)) return;
          updateFloor(variant, floor.id, (f) => ({ ...f, rooms: f.rooms.filter((x) => x.id !== room.id) }));
          setUi({ selectedRoomId: null });
        }}
      >
        Delete room
      </button>
    </div>
  );
}

export function OpeningInspector({
  opening,
  pair,
  onChange,
  onDelete,
}: {
  opening: Opening;
  /** Drawn as a pair of leaves (a wide internal door), so there is no hinge side to flip. */
  pair?: boolean;
  onChange: (p: Partial<Opening>) => void;
  onDelete: () => void;
}) {
  const k = opening.kind;
  const sill = defaultSill(k);
  const head = defaultHead(k);
  return (
    <div className="inspector">
      <label>
        Type
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
      {COLOUR_KINDS.includes(k) && (
        <label>
          Colour
          <input type="color" value={opening.color ?? (k === "door" ? "#c9a26b" : "#b3202e")} onChange={(e) => onChange({ color: e.target.value })} />
        </label>
      )}
      <p className="muted small">Drag it along the wall on the plan; it snaps onto the nearest wall.</p>
      <button className="danger" onClick={onDelete}>
        Delete opening
      </button>
    </div>
  );
}

export function WallInspector({ wall, onChange, onDelete }: { wall: Wall; onChange: (p: Partial<Wall>) => void; onDelete: () => void }) {
  return (
    <div className="inspector">
      <h4>Wall</h4>
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
      <label>
        Colour
        <input type="color" value={wall.color ?? "#f4f1ea"} onChange={(e) => onChange({ color: e.target.value })} />
      </label>
      <p className="muted small">Doors, windows and gaps can be placed on it like any other wall.</p>
      <button className="danger" onClick={onDelete}>
        Delete wall
      </button>
    </div>
  );
}

export function FixtureInspector({
  fixture,
  item,
  clash,
  onChange,
  onDuplicate,
  onRemove,
}: {
  fixture: Fixture;
  item: CatalogueItem;
  clash: boolean;
  onChange: (p: Partial<Fixture>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const resized = fixture.w !== undefined || fixture.d !== undefined || fixture.h !== undefined;
  const rot = Math.round(fixture.rot) % 360;
  return (
    <div className="inspector fixture-inspector">
      <h4>{item.name}</h4>
      {item.note && <p className="muted small">{item.note}</p>}
      {clash && <p className="small warn">Overlaps another item.</p>}
      <label>
        Label
        <input value={fixture.label ?? ""} placeholder="Shown on the plan" onChange={(e) => onChange({ label: e.target.value || undefined })} />
      </label>
      <div className="field">
        <span className="field-label">Width × depth × height (m)</span>
        <div className="size-row">
          <NumberField value={fixture.w ?? item.w} label="Width" onCommit={(w) => onChange({ w })} />
          <NumberField value={fixture.d ?? item.d} label="Depth" onCommit={(d) => onChange({ d })} />
          <NumberField value={fixture.h ?? item.h} label="Height" onCommit={(h) => onChange({ h })} />
        </div>
        {resized && (
          <button className="link" onClick={() => onChange({ w: undefined, d: undefined, h: undefined })}>
            Reset to {item.w.toFixed(2)} × {item.d.toFixed(2)} × {item.h.toFixed(2)} m
          </button>
        )}
        {item.mount !== undefined && <p className="muted small">Mounted {item.mount.toFixed(2)} m above the floor.</p>}
      </div>
      <label>
        Colour
        <span className="colour-pick">
          <input type="color" value={fixture.color ?? item.color} onChange={(e) => onChange({ color: e.target.value })} />
          {fixture.color && (
            <button className="link" onClick={() => onChange({ color: undefined })}>
              Reset
            </button>
          )}
        </span>
      </label>
      <label>
        Rotation {rot}°
        <input type="range" min={0} max={345} step={15} value={Math.round(rot / 15) * 15} onChange={(e) => onChange({ rot: parseInt(e.target.value) })} />
      </label>
      <div className="row">
        <button onClick={() => onChange({ rot: turn(fixture.rot, 90) })} title="R">
          Rotate 90°
        </button>
        <button onClick={onDuplicate} title="Ctrl+D or Cmd+D">
          Duplicate
        </button>
        <button className="danger" onClick={onRemove} title="Delete">
          Remove
        </button>
      </div>
      <p className="muted small">
        Drag to move; near a wall its back snaps to the wall (hold Alt to place freely). Tap it again to pick the item under it. R turns 90°, Shift+R 15°.
      </p>
    </div>
  );
}

export function FloorInspector({ variant, floor }: { variant: VariantKey; floor: Floor }) {
  const updateFloor = useStore((s) => s.updateFloor);
  const setVariant = useStore((s) => s.setVariant);
  const model = useStore((s) => s.variants[variant]);
  const setUi = useStore((s) => s.setUi);
  const withDims = floor.rooms.filter((r) => r.dims && r.dims.w > 0 && r.dims.h > 0).length;
  return (
    <div className="inspector">
      <label>
        Floor name
        <input value={floor.name} onChange={(e) => updateFloor(variant, floor.id, { name: e.target.value })} />
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
      <h4>Stairs</h4>
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
            Length × width (m)
            <span className="row">
              <input type="number" step="0.1" min="1" value={floor.stairsLen ?? 2.6} onChange={(e) => updateFloor(variant, floor.id, { stairsLen: parseFloat(e.target.value) || 2.6 })} />
              <input type="number" step="0.1" min="0.6" value={floor.stairsWidth ?? 0.9} onChange={(e) => updateFloor(variant, floor.id, { stairsWidth: parseFloat(e.target.value) || 0.9 })} />
            </span>
          </label>
          <p className="muted small">The flight is drawn only on floors that have a floor above; on the top floor the marker is where it arrives.</p>
          <button onClick={() => updateFloor(variant, floor.id, { stairs: undefined })}>Remove stairs</button>
        </>
      ) : (
        <button
          onClick={() => {
            const b = bbox(floor.rooms.flatMap((r) => r.polygon));
            updateFloor(variant, floor.id, { stairs: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } });
          }}
        >
          Add stairs (drag to place)
        </button>
      )}
      <h4>Floor</h4>
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
          onClick={() => {
            if (!model || !window.confirm(`Delete ${floor.name} and its rooms?`)) return;
            const floors = model.floors.filter((f) => f.id !== floor.id);
            if (floors.length) setVariant(variant, { ...model, floors });
            else setVariant(variant, undefined);
            setUi({ editFloorId: floors[0]?.id ?? null, selectedRoomId: null, tab: floors.length ? "plan" : "3d" });
          }}
        >
          Delete floor
        </button>
      </div>
    </div>
  );
}
