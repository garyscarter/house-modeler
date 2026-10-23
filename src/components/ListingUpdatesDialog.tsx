import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import "./Dialogs.css";
import "./ListingUpdatesDialog.css";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { applyListingReview, planListingReview, type ListingReview } from "../lib/presetActions";
import { defaultSelection, UPDATE_GROUP_LABEL, UPDATE_GROUP_ORDER, type Change, type UpdateGroup } from "../lib/layoutMerge";

/**
 * "Bring in updates from listing 91770873": a checklist of what the latest built-in house has that the
 * owner's design doesn't, grouped, with sensible ticks. Apply puts the ticked ones in as one undo step.
 */
type Open = { review: ListingReview; resolve: (applied: boolean) => void };
const useReview = create<{ open: Open | null }>(() => ({ open: null }));

/**
 * Work out and show the review for a design (Proposed by default). Resolves true when the owner applied it,
 * false when they cancelled, or when the layout isn't a design based on the listing.
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

  const groups = UPDATE_GROUP_ORDER.map((g) => ({ group: g, items: all.filter((c) => c.group === g) })).filter((g) => g.items.length);
  const count = all.filter((c) => c.available && ticked.has(c.id)).length;
  const plotNote = review.plot && review.plot.variant !== review.variant ? ` Neighbouring buildings are changed on ${VARIANT_LABEL[review.plot.variant]}'s plot, which ${VARIANT_LABEL[review.variant]} uses.` : "";

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
        <h3 id="review-title">Bring in updates from listing 91770873</h3>
        <p>
          {all.length
            ? `The built-in house has changed since your ${VARIANT_LABEL[review.variant]} design was copied from it. Tick the changes to bring in. Your rooms, walls and your own furniture stay as they are, and nothing you leave unticked changes. You can undo it.${plotNote}`
            : `Your ${VARIANT_LABEL[review.variant]} design already has everything from the latest listing 91770873 that can be brought in. Mark it as up to date?`}
        </p>
        {groups.length > 0 && (
          <div className="review-groups">
            {groups.map(({ group, items }) => (
              <ReviewGroup key={group} group={group} items={items} ticked={ticked} toggle={toggle} />
            ))}
          </div>
        )}
        <div className="dialog-buttons">
          <button type="button" onClick={() => close(false)}>
            Cancel
          </button>
          <button ref={applyButton} type="submit" className="primary">
            {all.length ? `Apply selected (${count})` : "Mark as up to date"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ReviewGroup({ group, items, ticked, toggle }: { group: UpdateGroup; items: AnyChange[]; ticked: Set<string>; toggle: (ids: string[], on: boolean) => void }) {
  const usable = items.filter((c) => c.available);
  const left = items.filter((c) => !c.available);
  const on = usable.filter((c) => ticked.has(c.id)).length;
  return (
    <section className="review-group" aria-label={UPDATE_GROUP_LABEL[group]}>
      <header>
        <h4>{UPDATE_GROUP_LABEL[group]}</h4>
        {usable.length > 1 && (
          <span className="review-all">
            <button type="button" className="link" disabled={on === usable.length} onClick={() => toggle(usable.map((c) => c.id), true)}>
              All
            </button>
            <button type="button" className="link" disabled={on === 0} onClick={() => toggle(usable.map((c) => c.id), false)}>
              None
            </button>
          </span>
        )}
      </header>
      <ul>
        {usable.map((c) => (
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
      {left.length > 0 && (
        <details>
          <summary className="muted">
            {left.length} {left.length === 1 ? "change can't" : "changes can't"} be brought in
          </summary>
          <ul className="review-left">
            {left.map((c) => (
              <li key={c.id}>
                {c.label}
                {c.note && <small className="muted">{c.note}</small>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
