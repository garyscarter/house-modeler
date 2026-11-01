import { NameField, hoverRoom } from "./shared";
import { useMemo, useState } from "react";
import { Section } from "../../components/Section";
import { NumberField, DangerZone, PairField, StatHeader, SwatchField } from "../../components/inspector";
import type { Mode } from "../../lib/modes";
import { knockThroughNeighbours } from "../../lib/mergeRooms";
import { detailsSummary, knockSummary, printedChip, shapeSummary } from "../../lib/modeSummary";
import { ask } from "../../components/Dialogs";
import { canopySize } from "../../lib/canopy";
import type { Floor, Pt, Room, VariantKey, Wall } from "../../types";
import { useStore } from "../../store";
import { bbox } from "../../lib/geometry";
import { isUnheated } from "../../lib/report";
import { KnockThrough } from "../KnockThrough";
import { Info } from "../../components/Info";
import { areaM2, axisRect, comparePrinted, formatArea, resizeRect, type Corner } from "../../lib/planMath";

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
  const setUi = useStore((s) => s.setUi);
  // The corner that stays put when the size changes: top-left unless Advanced says otherwise.
  const [anchor, setAnchor] = useState<Corner>("tl");
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

      <Section id="build.room.details" title="Details" summary={detailsSummary(room)}>
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
        <NumberField value={wall.height} step={0.1} min={0.1} placeholder="full" label="Wall height" onCommit={(height) => onChange({ height })} onClear={() => onChange({ height: undefined })} />
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
