import { useEffect, useRef, type ReactNode } from "react";
import { create } from "zustand";
import { useStore } from "../store";
import { PlanningBody, PLANNING_TITLE, usePlanningCheck, useSwitchToProposed } from "./PlanningPanel";
import { AreaCheck, Areas, Changes, Costs, Exports, Notes, useReportData } from "./ReportPanel";
import { costTile, houseTile, planningTile, reviewSubtitle } from "../lib/reviewSummary";
import type { VariantKey } from "../types";
import "./ReviewPage.css";

export type ReviewSection = "report" | "planning";

interface ReviewState {
  /** Which section to scroll to when opening; `nonce` makes repeated opens of the same section re-scroll. */
  section?: ReviewSection;
  nonce: number;
}

const useReview = create<ReviewState>(() => ({ nonce: 0 }));

/** Review is a mode: opening it switches to Review mode (the page below the top bar is its open state). */
export function openReview(section?: ReviewSection) {
  useStore.getState().setMode("review");
  useReview.setState((s) => ({ section, nonce: s.nonce + 1 }));
}

/** Leave Review, back to the mode it was opened from. */
export function closeReview() {
  useStore.getState().leaveReview();
  useReview.setState({ section: undefined });
}

const KEYS: VariantKey[] = ["current", "proposed"];

/** Full-screen, document-style Review: report, planning check and exports, under the top bar. */
export function ReviewPage() {
  const open = useStore((s) => s.mode === "review" && !!s.variants[s.activeVariant]);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const section = (e as CustomEvent<{ section?: ReviewSection } | undefined>).detail?.section;
      openReview(section === "report" || section === "planning" ? section : undefined);
    };
    window.addEventListener("house:open-review", onEvent);
    return () => window.removeEventListener("house:open-review", onEvent);
  }, []);

  return open ? <ReviewDocument /> : null;
}

function Section({ id, title, count, children }: { id: string; title: string; count?: number; children: ReactNode }) {
  return (
    <section className="rv-section" id={id}>
      <h2>
        {title}
        {count !== undefined && <span className="rv-count">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function ReviewDocument() {
  const section = useReview((s) => s.section);
  const nonce = useReview((s) => s.nonce);
  const rootRef = useRef<HTMLDivElement>(null);
  const data = useReportData();
  const { check, wing, setWing } = usePlanningCheck();
  useSwitchToProposed();
  const { variants, areas, changes, estimate, notes, noteCount, both } = data;

  const scrollTo = (id: string) => {
    const el = rootRef.current?.querySelector<HTMLElement>(`#${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Focus the page so Esc works at once, and jump to the requested section.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
    if (section === "planning") {
      const id = "rv-planning";
      requestAnimationFrame(() => {
        const el = rootRef.current?.querySelector<HTMLElement>(`#${id}`);
        el?.scrollIntoView({ block: "start" });
      });
    } else rootRef.current?.scrollTo({ top: 0 });
  }, [section, nonce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector(".modal-backdrop, .dialog-backdrop")) {
        e.preventDefault();
        closeReview();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const house = houseTile(areas);
  const cost = costTile(estimate);
  const plan = planningTile(check);
  const present = KEYS.filter((k) => variants[k]);

  return (
    <div className="review-page" ref={rootRef} tabIndex={-1} role="dialog" aria-label="Review">
      <header className="rv-bar">
        <div className="rv-bar-inner">
          <div>
            <h1>Review</h1>
            <p className="rv-subtitle">{reviewSubtitle(present)}</p>
          </div>
          <button className="rv-close" onClick={closeReview} aria-label="Close review" title="Close (Esc)">
            ×
          </button>
        </div>
      </header>

      <div className="rv-body">
        <div className="rv-tiles">
          <div className="rv-tile">
            <span className="rv-tile-label">Whole house</span>
            <span className="rv-tile-value">{house.line}</span>
            <span className="rv-tile-detail">{house.delta ?? (both ? "" : "One layout loaded")}</span>
          </div>
          <button className="rv-tile rv-tile-link" onClick={() => scrollTo("rv-costs")}>
            <span className="rv-tile-label">Rough cost</span>
            <span className={`rv-tile-value${cost.kind === "none" ? " rv-tile-cta" : ""}`}>{cost.label}</span>
            <span className="rv-tile-detail">{cost.detail}</span>
          </button>
          <button className={`rv-tile rv-tile-link rv-tone-${plan.tone}`} onClick={() => scrollTo("rv-planning")}>
            <span className="rv-tile-label">Planning</span>
            <span className="rv-tile-value">{plan.label}</span>
            <span className="rv-tile-detail">Proposed vs As listed</span>
          </button>
        </div>

        <div className="rv-columns">
          <div className="rv-col">
            <Section id="rv-areas" title="Areas">
              <Areas report={areas} both={both} />
            </Section>
            <Section id="rv-measured" title="Measured like the listing">
              <AreaCheck variants={variants} hideTitle />
            </Section>
            <Section id="rv-changes" title="Changes" count={changes?.length}>
              {changes ? <Changes changes={changes} /> : <p className="muted">Load or draw a Proposed layout (House menu → Layouts) to list what changes from As listed.</p>}
            </Section>
            <Section id="rv-costs" title="Rough costs">
              {changes && estimate ? <Costs estimate={estimate} /> : <p className="muted">Costs appear once there is a Proposed layout to compare with As listed.</p>}
            </Section>
            <Section id="rv-notes" title="Notes" count={noteCount}>
              <Notes notes={notes} />
            </Section>
          </div>
          <div className="rv-col">
            <Section id="rv-planning" title={PLANNING_TITLE}>
              <PlanningBody check={check} wing={wing} onWing={setWing} />
            </Section>
          </div>
        </div>

        <Section id="rv-exports" title="Exports">
          <Exports areas={areas} changes={changes} />
        </Section>
      </div>
    </div>
  );
}
