import { useStore } from "../store";
import { DEFAULT_EXTERIOR, type Exterior, type VariantKey } from "../types";

export function ExteriorPanel({ variant }: { variant: VariantKey }) {
  const model = useStore((s) => s.variants[variant]);
  const updateModel = useStore((s) => s.updateModel);
  if (!model) return null;
  const ext: Exterior = { ...DEFAULT_EXTERIOR, ...(model.exterior ?? {}) };
  const set = (p: Partial<Exterior>) => updateModel(variant, { exterior: { ...ext, ...p } });
  const hasGroups = model.floors.some((f) => f.rooms.some((r) => r.roofGroup));

  return (
    <div className="panel">
      <h3>Exterior</h3>
      <p className="muted small">
        Roofs are worked out from the floors: the top floor gets a pitched roof, anything on a lower floor with nothing above it gets a
        flat roof. Wall colours per room are set in Check plan.
      </p>
      <label className="check">
        <input type="checkbox" checked={ext.showRoof} onChange={(e) => set({ showRoof: e.target.checked })} /> Show roof
      </label>
      <label>
        Ridge runs
        <select value={ext.ridgeAxis} onChange={(e) => set({ ridgeAxis: e.target.value as Exterior["ridgeAxis"] })}>
          <option value="auto">Along the longer side (auto)</option>
          <option value="x">Left–right on the plan</option>
          <option value="z">Top–bottom on the plan</option>
        </select>
      </label>
      <label>
        Pitch (degrees)
        <input type="number" min={15} max={60} value={ext.pitchDeg} onChange={(e) => set({ pitchDeg: parseFloat(e.target.value) || 35 })} />
      </label>
      <label>
        Eaves overhang (m)
        <input type="number" step={0.05} min={0} max={1} value={ext.overhang} onChange={(e) => set({ overhang: parseFloat(e.target.value) || 0 })} />
      </label>
      <label title={hasGroups ? "" : "No rooms are tagged as an extension on the top floor"}>
        Extension roof
        <select value={ext.extensionRoof} disabled={!hasGroups} onChange={(e) => set({ extensionRoof: e.target.value as Exterior["extensionRoof"] })}>
          <option value="continue">Continue the main ridge across</option>
          <option value="separate">Separate, set-down gable</option>
        </select>
      </label>
      <div className="row">
        <label>
          Roof
          <input type="color" value={ext.roofColor} onChange={(e) => set({ roofColor: e.target.value })} />
        </label>
        <label>
          Walls
          <input type="color" value={ext.wallColor} onChange={(e) => set({ wallColor: e.target.value })} />
        </label>
        <label>
          Frames
          <input type="color" value={ext.trimColor} onChange={(e) => set({ trimColor: e.target.value })} />
        </label>
      </div>
    </div>
  );
}
