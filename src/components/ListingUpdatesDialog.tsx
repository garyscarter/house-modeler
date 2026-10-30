import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import "./Dialogs.css";
import "./ListingUpdatesDialog.css";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { activeHouseName } from "../lib/house";
import { applyListingReview, planListingReview, type ListingReview } from "../lib/presetActions";
import { defaultSelection, UPDATE_GROUP_LABEL, UPDATE_GROUP_ORDER, type Change } from "../lib/layoutMerge";

/**
 * "What's new for your Proposed": what the latest built-in house has that the owner's design doesn't. The
 * recommended changes (ticked) come first; the other suggestions are folded away, grouped, and what can't be
 * added is left out. Adding puts the ticked ones in as one undo step.
 */
type Open = { review: ListingReview; resolve: (applied: boolean) => void };
const useReview = create<{ open: Open | null }>(() => ({ open: null }));

/**
 * Work out and show the review for a design (Proposed by default). Resolves true when the owner applied it,
 * false when they cancelled, or when the layout isn't a design based on the built-in house.
 */
export function openListingReview(variant: VariantKey = "proposed"): Promise<boolean> {
  const review = planListingReview(variant);
  if (!review) return Promise.resolve(false);
  useReview.getState().open?.resolve(false);
  return new Promise((resolve) => useReview.setState({ open: { review, resolve } }));
}

type AnyChange = Change<unknown>;

export function ListingUpdatesDialog() {
  const open = useReview((s) => s.open);
  if (!open) return null;
  // Keyed so a fresh review starts from its own default ticks.
  return <ReviewSheet key={open.review.version + ":" + open.review.changes.length} open={open} />;
}

function ReviewSheet({ open }: { open: Open }) {
  const { review } = open;
  const all = useMemo(() => [...review.changes, ...(review.plot?.changes ?? [])] as AnyChange[], [review]);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(defaultSelection(all)));
  const applyButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    requestAnimationFrame(() => applyButton.current?.focus());
  }, []);

  const close = (applied: boolean) => {
    useReview.setState({ open: null });
    open.resolve(applied);
  };
  const toggle = (ids: string[], on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  const usable = all.filter((c) => c.available);
  // Recommended: what is ticked to start with. It stays put when the owner unticks one.
  const recommended = usable.filter((c) => c.defaultSelected);
  const more = UPDATE_GROUP_ORDER.map((g) => ({ group: g, items: usable.filter((c) => c.group === g && !c.defaultSelected) })).filter((g) => g.items.length);
  const moreCount = more.reduce((n, g) => n + g.items.length, 0);
  const count = usable.filter((c) => ticked.has(c.id)).length;
  const name = VARIANT_LABEL[review.variant];
  const plotNote = review.plot && review.plot.variant !== review.variant ? ` Neighbouring buildings are changed on ${VARIANT_LABEL[review.plot.variant]}'s plot, which ${name} uses.` : "";

  return (
    <div className="dialog-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close(false)}>
      <form
        className="dialog review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        onSubmit={(e) => {
          e.preventDefault();
          applyListingReview(review, all.filter((c) => c.available && ticked.has(c.id)).map((c) => c.id));
          close(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close(false);
          }
        }}
      >
        <h3 id="review-title">What's new for your {name}</h3>
        <p>
          {usable.length
            ? `${activeHouseName()} has been updated. Your ${name} keeps all your changes: tick what to add to it. You can undo it.${plotNote}`
            : `Your ${name} already has everything from the latest ${activeHouseName()} that can be added. Mark it as up to date?`}
        </p>
        {usable.length > 0 && (
          <div className="review-groups">
            {recommended.length > 0 && <ReviewGroup title="Recommended" items={recommended} ticked={ticked} toggle={toggle} />}
            {moreCount > 0 && (
              <details className="review-more" open={!recommended.length}>
                <summary>More suggestions ({moreCount})</summary>
                <p className="muted small">Optional: things in the listing your {name} doesn't have, unticked because your design may have left them out on purpose.</p>
                {more.map(({ group, items }) => (
                  <ReviewGroup key={group} title={UPDATE_GROUP_LABEL[group]} items={items} ticked={ticked} toggle={toggle} />
                ))}
              </details>
            )}
          </div>
        )}
        <div className="dialog-buttons">
          <button type="button" onClick={() => close(false)}>
            {usable.length ? "Not now" : "Cancel"}
          </button>
          <button ref={applyButton} type="submit" className="primary">
            {!usable.length ? "Mark as up to date" : count ? `Add ${count} ${count === 1 ? "change" : "changes"}` : "Add nothing"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ReviewGroup({ title, items, ticked, toggle }: { title: string; items: AnyChange[]; ticked: Set<string>; toggle: (ids: string[], on: boolean) => void }) {
  const on = items.filter((c) => ticked.has(c.id)).length;
  return (
    <section className="review-group" aria-label={title}>
      <header>
        <h4>{title}</h4>
        {items.length > 1 && (
          <span className="review-all">
            <button type="button" className="link" disabled={on === items.length} onClick={() => toggle(items.map((c) => c.id), true)}>
              All
            </button>
            <button type="button" className="link" disabled={on === 0} onClick={() => toggle(items.map((c) => c.id), false)}>
              None
            </button>
          </span>
        )}
      </header>
      <ul>
        {items.map((c) => (
          <li key={c.id}>
            <label>
              <input type="checkbox" checked={ticked.has(c.id)} onChange={(e) => toggle([c.id], e.target.checked)} />
              <span>
                {c.label}
                {c.note && <small className="muted">{c.note}</small>}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
