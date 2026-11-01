import { NameField } from "./shared";
import { Section } from "../../components/Section";
import { NumberField } from "../../components/inspector";
import { floorSettingsSummary, stairsSummary } from "../../lib/modeSummary";
import { ask } from "../../components/Dialogs";
import type { Floor, VariantKey } from "../../types";
import { STAIRS_DIR_LABEL, type StairsDir } from "../../types";
import { useStore } from "../../store";
import { bbox, estimatePxPerM } from "../../lib/geometry";
import { Info } from "../../components/Info";
import { floorDisplayName } from "../../lib/studio";
import { requestPlanTool } from "../planTool";

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
        <NumberField value={floor.level} step={1} min={-Infinity} label="Level" onCommit={(level) => updateFloor(variant, floor.id, { level: Math.round(level) })} />
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
          <NumberField value={floor.offset.x} step={0.1} min={-Infinity} label="Stacking offset across" onCommit={(x) => updateFloor(variant, floor.id, { offset: { ...floor.offset, x } })} />
          <NumberField value={floor.offset.y} step={0.1} min={-Infinity} label="Stacking offset down" onCommit={(y) => updateFloor(variant, floor.id, { offset: { ...floor.offset, y } })} />
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
              value={floor.stairsTopTurn ? `${floor.stairsTopSteps ? "steps-" : ""}${floor.stairsTopTurn}` : "straight"}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "straight") updateFloor(variant, floor.id, { stairsTopTurn: undefined, stairsTopSteps: undefined });
                else if (v.startsWith("steps-")) updateFloor(variant, floor.id, { stairsTopTurn: v.slice(6) as "left" | "right", stairsTopSteps: floor.stairsTopSteps ?? 2 });
                else updateFloor(variant, floor.id, { stairsTopTurn: v as "left" | "right", stairsTopSteps: undefined });
              }}
            >
              <option value="straight">Straight onto the landing</option>
              <option value="left">Winds left onto the landing</option>
              <option value="right">Winds right onto the landing</option>
              <option value="steps-left">Landing, then steps up to the left</option>
              <option value="steps-right">Landing, then steps up to the right</option>
            </select>
          </label>
          {floor.stairsTopTurn && !floor.stairsTopSteps && (
            <label>
              Winders at the top
              <select value={floor.stairsTopWinders ?? 2} onChange={(e) => updateFloor(variant, floor.id, { stairsTopWinders: parseInt(e.target.value, 10) === 3 ? 3 : 2 })}>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
          )}
          {floor.stairsTopTurn && floor.stairsTopSteps && (
            <>
              <label>
                Rises from the landing
                <select value={floor.stairsTopSteps} onChange={(e) => updateFloor(variant, floor.id, { stairsTopSteps: parseInt(e.target.value, 10) as 1 | 2 | 3 })}>
                  <option value={1}>1: straight up onto the landing</option>
                  <option value={2}>2: one step, then the landing</option>
                  <option value={3}>3: two steps, then the landing</option>
                </select>
              </label>
              <p className="muted small">Steps go up the other side too where the landing carries on past the head.</p>
            </>
          )}
          <label>
            Length × width (m)
            <span className="row">
              <NumberField value={floor.stairsLen ?? 2.6} step={0.1} min={1} label="Stairs length" onCommit={(stairsLen) => updateFloor(variant, floor.id, { stairsLen })} />
              <NumberField value={floor.stairsWidth ?? 0.9} step={0.1} min={0.6} label="Stairs width" onCommit={(stairsWidth) => updateFloor(variant, floor.id, { stairsWidth })} />
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
