import { useState, type ReactNode } from "react";
import { useStore } from "../store";
import { TILE_STYLE_LABEL, WALL_FINISH_LABEL, uid, type Chimney, type Exterior, type HouseModel, type FlatRoofSkirt, type PlanSide, type TileStyle, type VariantKey, type WallFinish } from "../types";
import { chimneyOnRidge, defaultChimney, exteriorOf, planRoofs } from "../lib/roof";
import { modelBounds } from "../lib/geometry";
import "./ExteriorPanel.css";

/** A typical colour for each covering, applied when the covering changes (the user can adjust it after). */
const TILE_COLOUR: Record<TileStyle, string> = {
  plain: "#8a4b37",
  concrete: "#5f4a42",
  slate: "#4f5560",
};

const PARTY_LABEL: Record<Exterior["partyWall"], string> = {
  none: "None (detached)",
  left: "On the left",
  right: "On the right",
  both: "Both sides (terraced)",
};

/**
 * A number input that lets the field be cleared or part-typed without the
 * value snapping back; valid numbers are committed (clamped) as you type.
 */
function NumberField({
  value,
  onChange,
  step,
  min,
  max,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      value={draft ?? String(+value.toFixed(2))}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "wide" : undefined}>
      {label}
      {children}
    </label>
  );
}

const SIDES: [PlanSide, string][] = [
  ["front", "Front"],
  ["left", "Left"],
  ["right", "Right"],
  ["rear", "Rear"],
];
const NO_SKIRT: FlatRoofSkirt = { sides: [], depth: 1, pitchDeg: 30 };

export function ExteriorPanel({ variant }: { variant: VariantKey }) {
  const model = useStore((s) => s.variants[variant]);
  const updateModel = useStore((s) => s.updateModel);
  if (!model) return null;
  const ext = exteriorOf(model);
  const set = (p: Partial<Exterior>) => updateModel(variant, { exterior: { ...ext, ...p } });
  const hasGroups = model.floors.some((f) => f.rooms.some((r) => r.roofGroup));
  const hasCanopies = model.floors.some((f) => (f.canopies ?? []).length > 0);
  const hasFlat = planRoofs(model).flatRoofs.length > 0;
  const skirt = ext.flatRoofSkirt ?? NO_SKIRT;
  const setSkirt = (p: Partial<FlatRoofSkirt>) => set({ flatRoofSkirt: { ...skirt, ...p } });

  return (
    <div className="panel exterior-panel">
      <h3>Exterior</h3>
      <p className="muted small">
        Roofs are worked out from the floors: the top floor gets a pitched roof, anything on a lower floor with nothing above it gets a
        flat roof.
      </p>

      <section>
        <h4>Roof</h4>
        <label className="check">
          <input type="checkbox" checked={ext.showRoof} onChange={(e) => set({ showRoof: e.target.checked })} /> Show roofs
        </label>
        <div className="ext-grid">
          <Field label="Style">
            <select value={ext.roofStyle} onChange={(e) => set({ roofStyle: e.target.value as Exterior["roofStyle"] })}>
              <option value="hip">Hipped</option>
              <option value="gable">Gabled</option>
            </select>
          </Field>
          <Field label="Pitch (degrees)">
            <NumberField value={ext.pitchDeg} step={1} min={15} max={60} onChange={(pitchDeg) => set({ pitchDeg })} />
          </Field>
          <Field label="Joined to a neighbour" wide>
            <select value={ext.partyWall} onChange={(e) => set({ partyWall: e.target.value as Exterior["partyWall"] })}>
              {Object.entries(PARTY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ridge runs" wide>
            <select value={ext.ridgeAxis} onChange={(e) => set({ ridgeAxis: e.target.value as Exterior["ridgeAxis"] })}>
              <option value="auto">Along the longer side (auto)</option>
              <option value="x">Left–right on the plan</option>
              <option value="z">Top–bottom on the plan</option>
            </select>
          </Field>
          <Field label="Covering" wide>
            <select value={ext.tileStyle} onChange={(e) => set({ tileStyle: e.target.value as TileStyle, roofColor: TILE_COLOUR[e.target.value as TileStyle] })}>
              {Object.entries(TILE_STYLE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Eaves overhang (m)">
            <NumberField value={ext.overhang} step={0.05} min={0} max={1} onChange={(overhang) => set({ overhang })} />
          </Field>
          <Field label="Roof colour">
            <input type="color" value={ext.roofColor} onChange={(e) => set({ roofColor: e.target.value })} />
          </Field>
        </div>
      </section>

      {hasGroups && (
        <section>
          <h4>Extension</h4>
          <div className="ext-grid">
            <Field label="Extension roof" wide>
              <select value={ext.extensionRoof} onChange={(e) => set({ extensionRoof: e.target.value as Exterior["extensionRoof"] })}>
                <option value="continue">Continue the main roof across</option>
                <option value="separate">Separate, with a lower ridge</option>
              </select>
            </Field>
            <Field label="Ridge set down (m)">
              <NumberField
                value={ext.extensionDrop}
                step={0.05}
                min={0}
                max={2}
                disabled={ext.extensionRoof !== "separate"}
                onChange={(extensionDrop) => set({ extensionDrop })}
              />
            </Field>
          </div>
        </section>
      )}

      <section>
        <h4>Eaves and rainwater</h4>
        <div className="ext-grid">
          <Field label="Fascias and soffits" wide>
            <select value={ext.fascia} onChange={(e) => set({ fascia: e.target.value as Exterior["fascia"] })}>
              <option value="white">White</option>
              <option value="trim">Match the window frames</option>
            </select>
          </Field>
          {hasCanopies && (
            <Field label="Porch canopy roof" wide>
              <select value={ext.canopyRoof} onChange={(e) => set({ canopyRoof: e.target.value as Exterior["canopyRoof"] })}>
                <option value="flat">Flat</option>
                <option value="lean-to">Tiled lean-to</option>
              </select>
            </Field>
          )}
        </div>
        <label className="check">
          <input type="checkbox" checked={ext.gutters} onChange={(e) => set({ gutters: e.target.checked })} /> Gutters and downpipes
        </label>
        {hasFlat && (
          <>
            <h4>Tiled edge on flat roofs</h4>
            <p className="muted small">A sloping tiled skirt along the outside edges of single-storey flat roofs, hipped at the corners. It can turn a corner and stop a short way along the next side.</p>
            <div className="row">
              {SIDES.map(([side, label]) => (
                <label key={side} className="check">
                  <input
                    type="checkbox"
                    checked={skirt.sides.includes(side)}
                    onChange={(e) => setSkirt({ sides: e.target.checked ? [...skirt.sides, side] : skirt.sides.filter((x) => x !== side) })}
                  />{" "}
                  {label}
                </label>
              ))}
            </div>
            {skirt.sides.length > 0 && (
              <div className="ext-grid">
                <Field label="Depth (m)">
                  <input type="number" min={0.3} max={3} step={0.1} value={skirt.depth} onChange={(e) => setSkirt({ depth: parseFloat(e.target.value) || skirt.depth })} />
                </Field>
                <Field label="Pitch (°)">
                  <input type="number" min={10} max={45} step={1} value={skirt.pitchDeg} onChange={(e) => setSkirt({ pitchDeg: parseFloat(e.target.value) || skirt.pitchDeg })} />
                </Field>
                <Field label="Return round corners (m)">
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={skirt.returns ?? 0}
                    onChange={(e) => setSkirt({ returns: Math.max(0, parseFloat(e.target.value) || 0) })}
                  />
                </Field>
                <Field label="Eaves below the deck (m)">
                  <input
                    type="number"
                    min={0}
                    max={0.5}
                    step={0.02}
                    value={skirt.drop ?? 0}
                    onChange={(e) => setSkirt({ drop: Math.max(0, parseFloat(e.target.value) || 0) })}
                  />
                </Field>
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h4>Walls</h4>
        <div className="ext-grid">
          <Field label="Outside wall finish" wide>
            <select value={ext.wallFinish ?? "render"} onChange={(e) => set({ wallFinish: e.target.value as WallFinish })}>
              {Object.entries(WALL_FINISH_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Wall colour">
            <input type="color" value={ext.wallColor} onChange={(e) => set({ wallColor: e.target.value })} />
          </Field>
          <Field label="Window frames">
            <input type="color" value={ext.trimColor} onChange={(e) => set({ trimColor: e.target.value })} />
          </Field>
        </div>
        <p className="muted small">Rooms can have their own outside finish and colour in Check plan.</p>
      </section>

      <Chimneys model={model} chimneys={ext.chimneys} onChange={(chimneys) => set({ chimneys })} />
    </div>
  );
}

/** Chimney stacks, positioned in metres from the left and front of the house. */
function Chimneys({ model, chimneys, onChange }: { model: HouseModel; chimneys: Chimney[]; onChange: (c: Chimney[]) => void }) {
  const b = modelBounds(model.floors);
  const patch = (id: string, p: Partial<Chimney>) => onChange(chimneys.map((c) => (c.id === id ? { ...c, ...p } : c)));
  return (
    <section>
      <h4>Chimneys</h4>
      {!chimneys.length && <p className="muted small">No chimneys. A new one starts on the ridge, shared over the party wall if there is one.</p>}
      {chimneys.map((c, i) => (
        <div className="chimney-card" key={c.id}>
          <div className="chimney-head">
            <b>Chimney {i + 1}</b>
            <button className="danger" onClick={() => onChange(chimneys.filter((o) => o.id !== c.id))}>
              Remove
            </button>
          </div>
          <div className="ext-grid">
            <Field label="From left (m)">
              <NumberField value={c.x - b.x0} step={0.1} onChange={(v) => patch(c.id, { x: b.x0 + v })} />
            </Field>
            <Field label="From front (m)">
              <NumberField value={b.y1 - c.y} step={0.1} onChange={(v) => patch(c.id, { y: b.y1 - v })} />
            </Field>
            <Field label="Width (m)">
              <NumberField value={c.w} step={0.05} min={0.3} max={3} onChange={(w) => patch(c.id, { w })} />
            </Field>
            <Field label="Depth (m)">
              <NumberField value={c.d} step={0.05} min={0.3} max={3} onChange={(d) => patch(c.id, { d })} />
            </Field>
            <Field label="Above the ridge (m)">
              <NumberField value={c.height} step={0.1} min={0} max={4} onChange={(height) => patch(c.id, { height })} />
            </Field>
            <Field label="Pots">
              <NumberField value={c.pots} step={1} min={0} max={6} onChange={(pots) => patch(c.id, { pots: Math.round(pots) })} />
            </Field>
          </div>
          <button onClick={() => onChange(chimneys.map((o) => (o.id === c.id ? chimneyOnRidge(model, o) : o)))}>Put on the ridge</button>
        </div>
      ))}
      <button onClick={() => onChange([...chimneys, defaultChimney(model, uid())])}>Add chimney</button>
    </section>
  );
}
