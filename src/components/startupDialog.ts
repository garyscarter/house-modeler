import { ask, choose } from "./Dialogs";
import { useStore } from "../store";
import { VARIANT_LABEL, type VariantKey } from "../types";
import { applyBoundaryUpdate, loadListing, planBoundaryUpdate, updatePreset, updateSitePreset } from "../lib/presetActions";
import { describeBoundaryChanges } from "../lib/siteMerge";
import { describeUpdate, notNowRemembers, remember, type StartupPrompt } from "../lib/startupPrompt";

/**
 * Work out the boundary-only update for these layouts' plots and ask the owner to confirm it, listing what
 * changes. Resolves with a function that puts it in (one undo step), or null when there is nothing to update
 * or the owner declined.
 */
export async function confirmBoundaryUpdates(variants: VariantKey[]): Promise<(() => void) | null> {
  const plans = variants.flatMap((variant) => {
    const merge = planBoundaryUpdate(variant);
    return merge ? [{ variant, merge }] : [];
  });
  if (!plans.length) return null;
  const message = describeBoundaryChanges(plans.map((p) => ({ name: plans.length > 1 ? VARIANT_LABEL[p.variant] : undefined, changes: p.merge.changes })));
  const none = plans.every((p) => !p.merge.changes.length);
  if (!(await ask(message, { ok: none ? "OK" : "Update the boundaries" }))) return null;
  return () => plans.forEach((p) => applyBoundaryUpdate(p.variant, p.merge));
}

/** Ask the startup question for `prompt` and carry out the answer; "not now" answers are remembered per version. */
export async function runStartupPrompt(prompt: StartupPrompt): Promise<void> {
  if (prompt.kind === "load") {
    const choices = prompt.withProposed ? ["Load As listed", "Load As listed and the proposed extension", "Not now"] : ["Load As listed", "Not now"];
    const i = await choose("Load the plans for listing 91770873 to see the house in 3D?", choices);
    if (i === null || i === choices.length - 1) return remember("load", prompt.version);
    await loadListing("current");
    if (i === 1) await loadListing("proposed");
    useStore.getState().setUi({ activeVariant: "current", tab: "3d" });
    return;
  }
  const { message, choices } = describeUpdate(prompt);
  const i = await choose(
    message,
    choices.map((c) => c.label),
  );
  const plan = i === null ? null : choices[i].plan;
  const note = (kinds: ("update" | "site")[]) => kinds.forEach((k) => remember(k, k === "update" ? prompt.version : prompt.site!.version));
  if (!plan) return note(notNowRemembers(prompt));
  // Edited plots take the boundary changes only, after the owner has seen what changes; declining stops it all.
  const keepEdits = plan.boundaries?.length ? await confirmBoundaryUpdates(plan.boundaries) : undefined;
  if (keepEdits === null) return;
  // The layouts and plots go in together, so one undo reverts the lot.
  plan.layouts.forEach(updatePreset);
  plan.sites.forEach(updateSitePreset);
  keepEdits?.();
  note(plan.remember);
}
