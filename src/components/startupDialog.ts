import { choose } from "./Dialogs";
import { useStore } from "../store";
import { loadListing, updatePreset, updateSitePreset } from "../lib/presetActions";
import { describeUpdate, notNowRemembers, remember, type StartupPrompt } from "../lib/startupPrompt";

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
  // The layouts and plots go in together, so one undo reverts the lot.
  plan.layouts.forEach(updatePreset);
  plan.sites.forEach(updateSitePreset);
  note(plan.remember);
}
