import { useMemo, useState } from "react";
import { useStore } from "../store";
import { uid, type CircuitKind, type Floor, type VariantKey } from "../types";
import { electricsSummary } from "../lib/modeSummary";
import { CIRCUIT_KINDS, CIRCUIT_KIND_LABEL, POINT_KINDS, POINT_KIND_LABEL, addCircuit, deleteCircuit, numberPoints, renameCircuit, setCircuitKind } from "../lib/electrics";
import { NameField } from "../editor/Inspectors";
import { requestAddPicker } from "../editor/addPicker";
import { Section } from "./Section";
import { Loader } from "./Loader";
import { exportWiringGuide } from "./wiringGuideExport";
import "./ElectricsPanel.css";

/**
 * Electrics mode's panel (sidebar, and the phone sheet when no point is selected): counts by kind, the circuits list,
 * switch-to-light linking, and the wiring guide and schedule exports. Points are placed and edited on the plan.
 */
export function ElectricsPanel({ variant, floor, onAdd }: { variant: VariantKey; floor: Floor; onAdd?: () => void }) {
  const model = useStore((s) => s.variants[variant]);
  const updateModel = useStore((s) => s.updateModel);
  const setUi = useStore((s) => s.setUi);
  const linkSwitchId = useStore((s) => s.linkSwitchId);
  const [kind, setKind] = useState<CircuitKind>("lighting");
  const [busy, setBusy] = useState<"html" | "csv" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pickSwitch, setPickSwitch] = useState("");
  const numbered = useMemo(() => (model ? numberPoints(model) : []), [model]);
  if (!model) return null;

  const circuits = model.circuits ?? [];
  const count = (kindKey: string, onFloor: boolean) =>
    numbered.filter((p) => p.kind === kindKey && (!onFloor || p.floor.id === floor.id)).reduce((n, p) => n + p.quantity, 0);
  const rows = POINT_KINDS.filter((k) => count(k, false) > 0);
  const switches = numbered.filter((p) => p.kind === "switch");
  const linking = linkSwitchId ? switches.find((p) => p.fx.id === linkSwitchId) : undefined;
  const hasLights = numbered.some((p) => p.kind === "light");
  const setCircuits = (list: ReturnType<typeof addCircuit>) => updateModel(variant, { circuits: list });
  const run = async (k: "html" | "csv") => {
    setBusy(k);
    setProblem(null);
    try {
      const msg = await exportWiringGuide(k);
      if (msg) setProblem(msg);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "The export failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="electrics-panel" data-electrics-panel>
      <p className="instruction">{electricsSummary(model)}</p>
      <div className="row">
        <button
          className="primary big"
          onClick={() => {
            if (onAdd) onAdd();
            else {
              setUi({ tab: "plan" });
              requestAddPicker();
            }
          }}
        >
          Add point
        </button>
      </div>

      {rows.length > 0 && (
        <table className="electrics-counts" aria-label="Points by kind">
          <thead>
            <tr>
              <th scope="col">Kind</th>
              <th scope="col">{floor.name}</th>
              <th scope="col">House</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => (
              <tr key={k}>
                <th scope="row">{POINT_KIND_LABEL[k]}</th>
                <td>{count(k, true)}</td>
                <td>{count(k, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Section id="electrics.links" title="Switches and lights" summary={linking ? `Linking ${linking.label}` : `${switches.length} switch${switches.length === 1 ? "" : "es"}`} defaultOpen={!!linking}>
        {linking ? (
          <div className="electrics-linking">
            <p className="small">
              Linking {linking.room.name} {linking.label}: tap lights on the plan to switch them on or off this switch.
            </p>
            <button className="primary" onClick={() => setUi({ linkSwitchId: null })}>
              Done
            </button>
          </div>
        ) : switches.length === 0 ? (
          <p className="muted small">Add a switch, then choose which lights it controls.</p>
        ) : (
          <div className="row electrics-link-pick">
            <select aria-label="Switch" value={pickSwitch} onChange={(e) => setPickSwitch(e.target.value)}>
              <option value="">Choose a switch…</option>
              {switches.map((p) => (
                <option key={p.fx.id} value={p.fx.id}>
                  {p.room.name} {p.label}
                </option>
              ))}
            </select>
            <button disabled={!pickSwitch} onClick={() => setUi({ linkSwitchId: pickSwitch, tab: "plan" })}>
              Link lights
            </button>
          </div>
        )}
      </Section>

      <Section id="electrics.circuits" title="Circuits" summary={circuits.length ? `${circuits.length}` : "None yet"} defaultOpen>
        <ul className="electrics-circuits">
          {circuits.map((c) => (
            <li key={c.id} data-circuit-id={c.id}>
              <NameField value={c.name} label="Circuit name" onCommit={(v) => setCircuits(renameCircuit(circuits, c.id, v))} />
              <select aria-label={`${c.name} kind`} value={c.kind} onChange={(e) => setCircuits(setCircuitKind(circuits, c.id, e.target.value as CircuitKind))}>
                {CIRCUIT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CIRCUIT_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <span className="muted small">{c.points.length} pts</span>
              <button className="danger" aria-label={`Delete ${c.name}`} onClick={() => setCircuits(deleteCircuit(circuits, c.id))}>
                Delete
              </button>
            </li>
          ))}
        </ul>
        <div className="row electrics-add-circuit">
          <select aria-label="New circuit kind" value={kind} onChange={(e) => setKind(e.target.value as CircuitKind)}>
            {CIRCUIT_KINDS.map((k) => (
              <option key={k} value={k}>
                {CIRCUIT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <button data-add-circuit onClick={() => setCircuits(addCircuit(circuits, kind, uid()))}>
            Add circuit
          </button>
        </div>
        <p className="muted small">Assign points to a circuit in the inspector.</p>
      </Section>

      <Section id="electrics.guide" title="Wiring guide" summary="Print or schedule" defaultOpen>
        <div className="row">
          <button data-export="html" disabled={busy !== null} onClick={() => run("html")}>
            {busy === "html" ? (
              <>
                <Loader kind="lift" size={14} />
                Preparing…
              </>
            ) : (
              "Wiring guide (print)"
            )}
          </button>
          <button data-export="csv" disabled={busy !== null} onClick={() => run("csv")}>
            {busy === "csv" ? (
              <>
                <Loader kind="lift" size={14} />
                Preparing…
              </>
            ) : (
              "Schedule (CSV)"
            )}
          </button>
        </div>
        {problem && <p className="small electrics-problem">{problem}</p>}
        <p className="muted small">New points only. Check every position on site with the electrician.</p>
      </Section>

      {hasLights && <p className="muted small">See it at night: Sun panel, then Night.</p>}
    </div>
  );
}
