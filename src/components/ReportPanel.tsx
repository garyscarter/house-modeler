import { useMemo, useState } from "react";
import { useStore } from "../store";
import { VARIANT_LABEL, type HouseModel, type VariantKey } from "../types";
import {
  areaReport,
  areaSummary,
  CONTINGENCY,
  CONTINGENCY_EXAMPLE,
  diffModels,
  estimateCosts,
  fmtDelta,
  fmtFt2,
  fmtGBP,
  fmtM2,
  fmtQty,
  roomNotes,
  type AreaReport,
  type Change,
  type CostEstimate,
} from "../lib/report";
import { changesCsv, downloadBlob, fileDate, planExtent, planScale, planSvg, printHtml, slug } from "../lib/export";
import { useCaptureIds } from "../three/captureRegistry";
import { renderSavedViews } from "./SavedViews";

// Snapshots and model export use three.js, which loads with the 3D view; fetch them when used.
const captureImage = async (...a: Parameters<typeof import("../three/capture").captureImage>) => (await import("../three/capture")).captureImage(...a);
const exportGlb = async (...a: Parameters<typeof import("../three/capture").exportGlb>) => (await import("../three/capture")).exportGlb(...a);
import { siteOf } from "../lib/sites";
import { floorDisplayName, houseName } from "../lib/studio";
import { downloadPrefix } from "../lib/brand";
import { stampMark } from "./stampMark";
import bricolageWoff2 from "@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?inline";
import "./ReportPanel.css";
import { Loader } from "./Loader";

const KEYS: VariantKey[] = ["current", "proposed"];
type AreaUnit = "m²" | "ft²";

/** Everything the Report shows, computed once for the sidebar panel and the full-screen Review page. */
export function useReportData() {
  const variants = useStore((s) => s.variants);
  const rates = useStore((s) => s.costRates);
  const sites = useStore((s) => s.sites);
  const current = variants.current;
  const proposed = variants.proposed;
  const areas = useMemo(() => areaReport(current, proposed), [current, proposed]);
  const changes = useMemo(
    () => (current && proposed ? diffModels(current, proposed, { a: siteOf(sites, "current"), b: siteOf(sites, "proposed") }) : undefined),
    [current, proposed, sites],
  );
  const estimate = useMemo(() => changes && estimateCosts(changes, rates), [changes, rates]);
  const notes = useMemo(() => KEYS.flatMap((k) => (variants[k] ? [{ key: k, notes: roomNotes(variants[k]!) }] : [])), [variants]);
  const noteCount = notes.reduce((s, v) => s + v.notes.length, 0);
  return { variants, areas, changes, estimate, notes, noteCount, both: !!current && !!proposed };
}

export function Areas({ report, both }: { report: AreaReport; both: boolean }) {
  const [unit, setUnit] = useState<AreaUnit>("m²");
  const v = (x?: number) => (x === undefined ? "–" : unit === "m²" ? fmtM2(x) : fmtFt2(x));
  const delta = (a?: number, b?: number) => fmtDelta((b ?? 0) - (a ?? 0), unit);
  const one = (f: { current?: number; proposed?: number }) => f.current ?? f.proposed;
  return (
    <>
      <div className="rp-unit seg" role="group" aria-label="Area units">
        {(["m²", "ft²"] as AreaUnit[]).map((u) => (
          <button key={u} className={unit === u ? "active" : ""} onClick={() => setUnit(u)}>
            {u}
          </button>
        ))}
      </div>
      <table className="rp-table rp-areas">
        <thead>
          <tr>
            <th>Room</th>
            {both ? (
              <>
                <th title="As listed">Listed</th>
                <th>Proposed</th>
                <th title="Proposed minus As listed">±</th>
              </>
            ) : (
              <th>{unit}</th>
            )}
          </tr>
        </thead>
        {report.floors.map((f) => (
          <tbody key={f.key}>
            <tr className="rp-floor">
              <th colSpan={both ? 4 : 2}>{floorDisplayName(f.name)}</th>
            </tr>
            {f.rows.map((r) => (
              <tr key={r.key} className={both && r.current === undefined ? "rp-new" : both && r.proposed === undefined ? "rp-gone" : undefined}>
                <td>
                  {r.name}
                  {r.was && <span className="muted"> (was {r.was})</span>}
                </td>
                {both ? (
                  <>
                    <td>{v(r.current)}</td>
                    <td>{v(r.proposed)}</td>
                    <td className="rp-delta">{delta(r.current, r.proposed)}</td>
                  </>
                ) : (
                  <td>{v(one(r))}</td>
                )}
              </tr>
            ))}
            <tr className="rp-total">
              <td>Total</td>
              {both ? (
                <>
                  <td>{v(f.current)}</td>
                  <td>{v(f.proposed)}</td>
                  <td className="rp-delta">{delta(f.current, f.proposed)}</td>
                </>
              ) : (
                <td>{v(one(f))}</td>
              )}
            </tr>
          </tbody>
        ))}
        <tfoot>
          <tr className="rp-grand">
            <td>Whole house</td>
            {both ? (
              <>
                <td>{v(report.current)}</td>
                <td>{v(report.proposed)}</td>
                <td className="rp-delta">{delta(report.current, report.proposed)}</td>
              </>
            ) : (
              <td>{v(report.current ?? report.proposed)}</td>
            )}
          </tr>
        </tfoot>
      </table>
      <p className="muted small">Internal areas to the traced wall centre lines, in {unit}. Check against the listing's printed sizes.</p>
    </>
  );
}

/** Each variant's area measured as a listing or EPC would, against the listing's printed total. */
export function AreaCheck({ variants, hideTitle }: { variants: Partial<Record<VariantKey, HouseModel>>; hideTitle?: boolean }) {
  const rows = KEYS.flatMap((k) => (variants[k] ? [{ k, model: variants[k]!, s: areaSummary(variants[k]!) }] : []));
  if (!rows.length) return null;
  return (
    <div className="rp-check">
      {!hideTitle && <h4>Measured like the listing</h4>}
      {rows.map(({ k, model, s }) => (
        <p key={k} className="small">
          <b>{VARIANT_LABEL[k]}</b>: {fmtM2(s.internal)} m² inside the outside walls
          {s.unheatedRooms.length > 0 && (
            <>
              , {fmtM2(s.heated)} m² heated (without {s.unheatedRooms.join(", ")})
            </>
          )}
          .
          {model.listedArea !== undefined && s.vsListed !== undefined && (
            <span className={Math.abs(s.vsListed) > 0.05 ? "warn" : "muted"}>
              {" "}
              The listing gives {fmtM2(model.listedArea)} m²: {s.vsListed >= 0 ? "+" : ""}
              {(s.vsListed * 100).toFixed(1)}%.
              {Math.abs(s.vsListed) > 0.05 ? " More than 5% out: check the floor scales." : " Close enough: the scale is right."}
            </span>
          )}
        </p>
      ))}
      <p className="muted small">The table above runs to the wall centre lines, so it reads higher.</p>
    </div>
  );
}

export function Changes({ changes }: { changes: Change[] }) {
  if (!changes.length) return <p className="muted small">No differences between As listed and Proposed.</p>;
  const structural = changes.filter((c) => c.structural).length;
  const floors = [...new Set(changes.map((c) => c.floor))];
  return (
    <>
      {structural > 0 && (
        <p className="note small">
          {structural} item{structural > 1 ? "s are" : " is"} likely structural. Get a structural engineer's advice before you plan around {structural > 1 ? "them" : "it"}.
        </p>
      )}
      {floors.map((fl) => (
        <div key={fl}>
          <h4 className="rp-sub">{fl}</h4>
          <ul className="rp-changes">
            {changes
              .filter((c) => c.floor === fl)
              .map((c) => (
                <li key={c.key} className={c.structural ? "rp-structural" : undefined}>
                  <span className={`rp-tag rp-tag-${c.category.toLowerCase()}`}>{c.category}</span>
                  <span className="rp-desc">
                    {c.description}
                    {c.structural && <span className="rp-warn">{c.structural}</span>}
                  </span>
                  <span className="rp-qty">{fmtQty(c.quantity, c.unit)}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </>
  );
}

/** A rate field that can be cleared; an empty field removes the rate rather than pricing it at zero. */
function RateInput({ id, placeholder, label }: { id: string; placeholder: string; label: string }) {
  const rates = useStore((s) => s.costRates);
  const setCostRates = useStore((s) => s.setCostRates);
  const [draft, setDraft] = useState<string | null>(null);
  const value = rates[id];
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      step="any"
      aria-label={label}
      placeholder={placeholder}
      value={draft ?? (value === undefined ? "" : String(value))}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parseFloat(e.target.value);
        const next = { ...useStore.getState().costRates };
        if (Number.isFinite(v) && v >= 0) next[id] = v;
        else delete next[id];
        setCostRates(next);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function Costs({ estimate }: { estimate: CostEstimate }) {
  if (!estimate.lines.length) return <p className="muted small">Nothing to price yet: the changes are for information only.</p>;
  return (
    <>
      <p className="muted small">
        Enter your own rates from local quotes. The grey figures are placeholders, not prices, and are never added up.
      </p>
      <div className="rp-costs">
        {estimate.lines.map((l) => (
          <div key={l.def.id} className="rp-cost">
            <div className="rp-cost-head">
              <span>{l.def.label}</span>
              <span className="muted">{fmtQty(l.quantity, l.def.unit)}</span>
            </div>
            <div className="rp-cost-row">
              <span className="rp-money">
                £
                <RateInput id={l.def.id} label={`${l.def.label} rate`} placeholder={`e.g. ${l.def.example.toLocaleString("en-GB")}`} />
                <span className="muted">{l.def.unit === "each" ? "each" : `per ${l.def.unit}`}</span>
              </span>
              <b>{l.total === undefined ? "–" : fmtGBP(l.total)}</b>
            </div>
          </div>
        ))}
        <div className="rp-cost rp-cost-sum">
          <div className="rp-cost-row">
            <span>Subtotal</span>
            <b>{fmtGBP(estimate.subtotal)}</b>
          </div>
          <div className="rp-cost-row">
            <span className="rp-money">
              Contingency
              <RateInput id={CONTINGENCY} label="Contingency percentage" placeholder={`e.g. ${CONTINGENCY_EXAMPLE}`} />%
            </span>
            <b>{fmtGBP(estimate.contingency)}</b>
          </div>
          <div className="rp-cost-row rp-cost-total">
            <span>Rough estimate</span>
            <b>{fmtGBP(estimate.total)}</b>
          </div>
        </div>
      </div>
      {estimate.missing.length > 0 && (
        <p className="warn small">
          {estimate.missing.length} line{estimate.missing.length > 1 ? "s have" : " has"} no rate yet and {estimate.missing.length > 1 ? "are" : "is"} left out of the total.
        </p>
      )}
      <p className="muted small">A rough estimate from your rates, not a quote. It leaves out fees, VAT, finishes and anything the change list can't see.</p>
    </>
  );
}

export function Notes({ notes }: { notes: { key: VariantKey; notes: ReturnType<typeof roomNotes> }[] }) {
  if (!notes.some((v) => v.notes.length)) {
    return <p className="muted small">No room notes yet. Select a room in Plan and add notes in its inspector; they appear here and in the printed report.</p>;
  }
  return (
    <>
      {notes
        .filter((v) => v.notes.length)
        .map((v) => (
          <div key={v.key}>
            <h4 className="rp-sub">{VARIANT_LABEL[v.key]}</h4>
            <dl className="rp-notes">
              {v.notes.map((n, i) => (
                <div key={i}>
                  <dt>
                    {n.room} <span className="muted">· {n.floor}</span>
                  </dt>
                  <dd>{n.notes}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
    </>
  );
}

const reportFontCss = `@font-face{font-family:"Bricolage Grotesque Variable";src:url(${bricolageWoff2}) format("woff2");font-weight:200 800}`;

const longDate = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

/** Caption for a capture id: the variant it shows. */
const captureLabel = (id: string, active: VariantKey) => (id === "current" || id === "proposed" ? VARIANT_LABEL[id] : VARIANT_LABEL[active]);

export function Exports({ areas, changes }: { areas: AreaReport; changes?: Change[] }) {
  const variants = useStore((s) => s.variants);
  const sites = useStore((s) => s.sites);
  const rates = useStore((s) => s.costRates);
  const active = useStore((s) => s.activeVariant);
  const ids = useCaptureIds();
  const [stamp, setStamp] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const present = KEYS.filter((k) => variants[k]);
  // One frame and scale for every plan so floors and variants line up when compared.
  const extent = useMemo(() => planExtent(KEYS.flatMap((k) => (variants[k] ? [variants[k]!] : []))), [variants]);
  const scale = planScale(extent);
  const date = fileDate();
  const prefix = downloadPrefix(slug(houseName(variants[active] ?? present.map((k) => variants[k]).find(Boolean))));

  const run = async (key: string, job: () => Promise<string | void>) => {
    setBusy(key);
    setMessage(null);
    try {
      const done = await job();
      if (done) setMessage({ text: done });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(null);
    }
  };

  const snapshot = (scaleBy: number) =>
    run(`png${scaleBy}`, async () => {
      for (const id of ids) {
        const shot = await captureImage(id, scaleBy);
        const blob = stamp ? await stampMark(shot) : shot;
        downloadBlob(blob, `${prefix}-3d-${slug(captureLabel(id, active))}-${date}${scaleBy > 1 ? `@${scaleBy}x` : ""}.png`);
      }
      return ids.length > 1 ? "Saved a snapshot of each view." : undefined;
    });

  const plan = (k: VariantKey, m: HouseModel, floorId: string) => {
    const f = m.floors.find((x) => x.id === floorId)!;
    const svg = planSvg(m, f, { variant: VARIANT_LABEL[k], date: longDate(), site: siteOf(sites, k), extent, scale });
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${prefix}-plan-${slug(VARIANT_LABEL[k])}-${slug(f.name)}-${date}.svg`);
  };

  const print = () => {
    // Open the window inside the click itself or pop-up blockers stop it; fill it once the snapshots are ready.
    const w = window.open("", "_blank");
    void run("print", async () => {
      const snapshots: { caption: string; src: string }[] = [];
      for (const id of ids) {
        try {
          snapshots.push({ caption: `3D: ${captureLabel(id, active)}`, src: await blobToDataUrl(await captureImage(id, 1)) });
        } catch {
          // A failed snapshot only leaves the picture out.
        }
      }
      const savedViews = useStore.getState().savedViews;
      let views: { name: string; shots: { label: string; src: string }[] }[] | undefined;
      if (savedViews.length) {
        try {
          const pics = await renderSavedViews(savedViews);
          views = savedViews.map((v) => ({ name: v.name, shots: pics[v.id] ?? [] }));
        } catch {
          // Without 3D views on screen the pictures are left out.
        }
      }
      const html = printHtml({
        date: longDate(),
        houseName: houseName(variants[active] ?? variants[present[0]]),
        fontCss: reportFontCss,
        variants: present.map((k) => ({ label: VARIANT_LABEL[k], model: variants[k]!, notes: roomNotes(variants[k]!), site: siteOf(sites, k) })),
        areas,
        changes,
        rates,
        snapshots,
        views,
      });
      if (!w) {
        downloadBlob(new Blob([html], { type: "text/html" }), `${prefix}-report-${date}.html`);
        return "Pop-ups are blocked, so the report was saved as a web page instead. Open it and print from there.";
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 400);
    });
  };

  const glb = () =>
    run("glb", async () => {
      const id = ids.includes(active) ? active : ids[0];
      const blob = await exportGlb(id);
      downloadBlob(blob, `${prefix}-3d-${slug(captureLabel(id, active))}-${date}.glb`);
    });

  const csv = () => {
    if (!changes) return;
    downloadBlob(new Blob(["﻿" + changesCsv(changes, rates)], { type: "text/csv;charset=utf-8" }), `${prefix}-changes-${date}.csv`);
  };

  const no3d = ids.length === 0;
  return (
    <div className="rp-export">
      <div className="rp-export-group">
        <h4 className="rp-sub">Plan drawings (SVG, 1:{scale} at A4)</h4>
        {present.map((k) => (
          <div key={k} className="rp-plan-row">
            <span className="muted small">{VARIANT_LABEL[k]}</span>
            <div className="row">
              {[...variants[k]!.floors]
                .sort((a, b) => a.level - b.level)
                .map((f) => (
                  <button key={f.id} onClick={() => plan(k, variants[k]!, f.id)}>
                    {floorDisplayName(f.name)}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="rp-export-group">
        <h4 className="rp-sub">Report</h4>
        <div className="row">
          <button className="primary" onClick={print} disabled={busy !== null}>
            {busy === "print" ? <><Loader kind="lift" size={14} />Preparing…</> : "Print / save as PDF"}
          </button>
          <button onClick={csv} disabled={!changes?.length}>
            Changes and costs (CSV)
          </button>
        </div>
      </div>
      <div className="rp-export-group">
        <h4 className="rp-sub">3D</h4>
        <div className="row">
          <button onClick={() => snapshot(1)} disabled={no3d || busy !== null}>
            {busy === "png1" ? <><Loader kind="lift" size={14} />Saving…</> : "Snapshot (PNG)"}
          </button>
          <button onClick={() => snapshot(2)} disabled={no3d || busy !== null}>
            {busy === "png2" ? <><Loader kind="lift" size={14} />Saving…</> : "Snapshot 2× (PNG)"}
          </button>
          <button onClick={glb} disabled={no3d || busy !== null}>
            {busy === "glb" ? <><Loader kind="lift" size={14} />Exporting…</> : "3D model (GLB)"}
          </button>
        </div>
        <label className="small">
          <input type="checkbox" checked={stamp} onChange={(e) => setStamp(e.target.checked)} /> Add the Storey mark
        </label>
        <p className="muted small">
          {no3d ? (
            <>
              <button
                className="link"
                onClick={() => {
                  useStore.getState().leaveReview();
                  useStore.getState().setUi({ tab: "3d" });
                }}
              >
                Open the 3D view
              </button>{" "}
              <span className="muted">to save pictures or the model.</span>
            </>
          ) : ids.length > 1
              ? "Side by side: a snapshot is saved for each view. The model export uses the selected variant."
              : "Snapshots show the view as it is now, without labels. GLB files open in most 3D apps and online model viewers."}
        </p>
      </div>
      {message && <p className={message.error ? "error small" : "muted small"}>{message.text}</p>}
    </div>
  );
}
