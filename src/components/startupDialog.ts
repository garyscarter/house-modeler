import { ask, choose } from "./Dialogs";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { applyBoundaryUpdate, planBoundaryUpdate, updatePreset, updateSitePreset } from "../lib/presetActions";
import { describeBoundaryChanges } from "../lib/siteMerge";
import { describeUpdate, notNowRemembers, remember, type Remembered, type StartupPrompt } from "../lib/startupPrompt";
import { openListingReview } from "./ListingUpdatesDialog";

/**
 * Work out the keep-my-edits update (boundaries and neighbouring buildings) for these layouts' plots and ask the owner to confirm it, listing what
 * changes. Resolves with a function that puts it in (one undo step), or null when there is nothing to update
 * or the owner declined.
 */
export async function confirmBoundaryUpdates(variants: VariantKey[]): Promise<(() => void) | null> {
  const plans = variants.flatMap((variant) => {
    const merge = planBoundaryUpdate(variant);
    return merge ? [{ variant, merge }] : [];
  });
  if (!plans.length) return null;
  const message = describeBoundaryChanges(plans.map((p) => ({ name: plans.length > 1 ? VARIANT_LABEL[p.variant] : undefined, changes: p.merge.changes, buildings: p.merge.buildings })));
  const none = plans.every((p) => !p.merge.changes.length && !p.merge.buildings?.length);
  if (!(await ask(message, { ok: none ? "OK" : "Update" }))) return null;
  return () => plans.forEach((p) => applyBoundaryUpdate(p.variant, p.merge));
}

/** Ask the startup question for `prompt` and carry out the answer; "not now" answers are remembered per version. */
export async function runStartupPrompt(prompt: StartupPrompt): Promise<void> {
  // The first-run Welcome card (components/Welcome.tsx) is the empty state: nothing to ask here.
  if (prompt.kind === "load") return;
  const { message, choices } = describeUpdate(prompt);
  const i = await choose(
    message,
    choices.map((c) => c.label),
  );
  const plan = i === null ? null : choices[i].plan;
  const versionOf: Record<"update" | "site" | "review", () => number> = {
    update: () => prompt.version,
    site: () => prompt.site!.version,
    review: () => prompt.review!,
  };
  const note = (kinds: (keyof Remembered & ("update" | "site" | "review"))[]) => kinds.forEach((k) => remember(k, versionOf[k]()));
  if (!plan) return note(notNowRemembers(prompt));
  // Edited plots take the boundary changes only, after the owner has seen what changes; declining stops it all.
  const keepEdits = plan.boundaries?.length ? await confirmBoundaryUpdates(plan.boundaries) : undefined;
  if (keepEdits === null) return;
  // The layouts and plots go in together, so one undo reverts the lot.
  plan.layouts.forEach(updatePreset);
  plan.sites.forEach(updateSitePreset);
  keepEdits?.();
  note(plan.remember);
  // Then the owner's own Proposed design: they pick what to bring in. Cancelling it is a "not now" for this version.
  if (plan.review && prompt.review !== undefined && !(await openListingReview("proposed"))) note(["review"]);
}
