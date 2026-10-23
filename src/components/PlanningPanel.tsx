import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { planningCheck, STATUS_LABEL, type ExtensionPart, type PlanningCheck, type PlanningRule } from "../lib/planning";
import { siteOf } from "../lib/sites";
import { openReview } from "./ReviewPage";
import "./PlanningPanel.css";

const WING_KEY = "house-modeler.planning.wingAfter1948";

/** The "side wing added after 1948" tick is a per-browser convenience, not project data. */
function readWing(): boolean {
  try {
    return localStorage.getItem(WING_KEY) === "1";
  } catch {
    return false;
  }
}
function writeWing(v: boolean) {
  try {
    localStorage.setItem(WING_KEY, v ? "1" : "0");
  } catch {
    // Storage blocked: the tick lasts until the page reloads.
  }
}

export const PLANNING_TITLE = "Planning check: Proposed vs As listed";

/** The planning check plus the "wing added after 1948" tick, shared by the sidebar panel and the Review page. */
export function usePlanningCheck() {
  const current = useStore((s) => s.variants.current);
  const proposed = useStore((s) => s.variants.proposed);
  const sites = useStore((s) => s.sites);
  const [wing, setWingState] = useState(readWing);
  const check = useMemo(
    () => (current && proposed ? planningCheck(current, proposed, { current: siteOf(sites, "current"), proposed: siteOf(sites, "proposed") }, { wingAfter1948: wing }) : undefined),
    [current, proposed, sites, wing],
  );
  const setWing = (v: boolean) => {
    setWingState(v);
    writeWing(v);
  };
  return { check, wing, setWing };
}

/** Once, when the planning check is shown on As listed with a Proposed layout available, switch the view to Proposed. */
export function useSwitchToProposed(active = true) {
  const done = useRef(false);
  const hasProposed = useStore((s) => !!s.variants.proposed);
  useEffect(() => {
    if (!active || done.current || !hasProposed) return;
    done.current = true;
    const s = useStore.getState();
    if (s.activeVariant === "current") s.setUi({ activeVariant: "proposed" });
  }, [active, hasProposed]);
}

/** Whether Proposed fits householder permitted development, rule by rule, and the other consents it needs. */
export function PlanningPanel() {
  const { check, wing, setWing } = usePlanningCheck();
  useSwitchToProposed();

  return (
    <div className="panel planning-panel">
      <h3>{PLANNING_TITLE}</h3>
      <button className="rp-open-full" onClick={() => openReview("planning")}>
        Open full report
      </button>
      <PlanningBody check={check} wing={wing} onWing={setWing} />
    </div>
  );
}

/** The planning check's content, without a title: used in the sidebar panel and on the Review page. */
export function PlanningBody({ check, wing, onWing }: { check?: PlanningCheck; wing: boolean; onWing: (v: boolean) => void }) {
  return (
    <>
      <p className="muted small pl-intro">Proposed against As listed, under householder permitted development in England. Guidance, not legal advice.</p>
      {!check ? (
        <p className="muted small">Load or draw a Proposed layout (Floorplans) to check it against the planning rules.</p>
      ) : (
        <>
          <Verdict check={check} />
          <label className="pl-wing">
            <input type="checkbox" checked={wing} onChange={(e) => onWing(e.target.checked)} />
            <span>
              The single-storey side wing was added after 1 July 1948
              <span className="muted small"> (then it counts as an earlier extension, not part of the original house)</span>
            </span>
          </label>
          <p className="muted small">{check.original}</p>
          {check.parts.length > 0 && <Parts parts={check.parts} />}
          <Rules rules={check.rules} />
          {check.consents.length > 0 && (
            <section className="pl-section">
              <h4>Other consents</h4>
              <ul className="pl-consents">
                {check.consents.map((c) => (
                  <li key={c.id}>
                    <div className="pl-row-head">
                      <span className={`pl-pill pl-${c.needed === "yes" ? "needed" : "likely"}`}>{c.needed === "yes" ? "Needed" : "Likely"}</span>
                      <b>{c.title}</b>
                    </div>
                    <p className="small">{c.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="pl-section">
            <h4>Before you rely on it</h4>
            <ul className="pl-caveats small muted">
              {check.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

export function Verdict({ check }: { check: PlanningCheck }) {
  return (
    <div className={`pl-verdict pl-verdict-${check.verdict}`} role="status">
      <div className="pl-headline">{check.headline}</div>
      {check.because.length > 0 && (
        <>
          <p className="small pl-because">{check.verdict === "permission" ? "Because:" : "Prior approval because:"}</p>
          <ul className="small">
            {check.because.map((b) => (
              <li key={b}>{b[0].toUpperCase() + b.slice(1)}.</li>
            ))}
          </ul>
        </>
      )}
      {check.consents.length > 0 && (
        <p className="small pl-also">
          <b>Needs other consents:</b> {check.consents.map((c) => c.title).join("; ")}.
        </p>
      )}
    </div>
  );
}

const fmt = (v: number) => `${v.toFixed(1)} m`;
const fmt2 = (v: number) => `${v.toFixed(2)} m`;

export function Parts({ parts }: { parts: ExtensionPart[] }) {
  return (
    <section className="pl-section">
      <h4>What it found</h4>
      <ul className="pl-parts small">
        {parts.map((p) => {
          const bits = [
            p.width > 0 && `${fmt2(p.width)} beyond the side wall`,
            p.depth > 0 && `${fmt2(p.depth)} past the rear wall`,
            p.forward > 0 && `${fmt2(p.forward)} forward of the front`,
            `${(p.x1 - p.x0).toFixed(2)} × ${(p.z1 - p.z0).toFixed(2)} m on plan`,
            `${p.storeys} storey${p.storeys > 1 ? "s" : ""}`,
            `eaves ${fmt(p.eaves)}`,
            `top ${fmt(p.height)}`,
            p.boundaryDistance !== undefined && (p.boundaryDistance < 0.05 ? "on the boundary" : `${fmt(p.boundaryDistance)} from the boundary`),
          ].filter(Boolean);
          return (
            <li key={p.id}>
              <b>{p.label}</b>: {bits.join(", ")}.
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Rules({ rules }: { rules: PlanningRule[] }) {
  const live = rules.filter((r) => r.status !== "na");
  const na = rules.filter((r) => r.status === "na");
  const groups = [...new Set(live.map((r) => r.group))];
  return (
    <section className="pl-section">
      <h4>Rule by rule</h4>
      {groups.map((g) => (
        <div key={g} className="pl-group">
          <h5>{g}</h5>
          <ul className="pl-rules">
            {live
              .filter((r) => r.group === g)
              .map((r) => (
                <RuleRow key={r.id} rule={r} />
              ))}
          </ul>
        </div>
      ))}
      {na.length > 0 && (
        <details className="pl-skipped">
          <summary className="small">Not affected by this proposal ({na.length})</summary>
          <ul className="pl-rules">
            {na.map((r) => (
              <RuleRow key={r.id} rule={r} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function RuleRow({ rule }: { rule: PlanningRule }) {
  return (
    <li className={`pl-rule pl-rule-${rule.status}`}>
      <span className={`pl-pill pl-${rule.status}`}>{STATUS_LABEL[rule.status]}</span>
      <div className="pl-rule-body">
        <div className="pl-rule-title">
          {rule.status === "na" ? rule.group : rule.title}
          {rule.ref && <span className="muted pl-ref"> · {rule.ref}</span>}
        </div>
        <div className="small">{rule.reason}</div>
      </div>
    </li>
  );
}
