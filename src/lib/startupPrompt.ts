import { VARIANT_LABEL, type HouseModel, type VariantKey } from "../types";
import type { SiteUpdate } from "./sitePreset";
import { reviewedVersion } from "./layoutMerge";
import { activeHouseId, activeHouseName, storageSuffix } from "./house";

/** What the startup prompt should offer, or nothing. */
export type StartupPrompt =
  | { kind: "load"; version: number; withProposed: boolean }
  | {
      kind: "update";
      /** Newest layout version on offer (0 when only the plot is). */
      version: number;
      /** Layouts that are older than the registry (empty when only the plot is). */
      variants: VariantKey[];
      /** The plot update on offer, if any. */
      site?: SiteUpdate;
      /**
       * The listing version Proposed's review of updates is on offer for, when Proposed is the owner's design
       * started from As listed and hasn't been brought up to it (see lib/layoutMerge.ts).
       */
      review?: number;
    };

/** Versions of each prompt kind the user has already answered "not now" / "keep mine" to. */
export type Remembered = { load?: number; update?: number; site?: number; review?: number };

type Registry = Record<string, { version: number }>;

/**
 * Decide which prompt to show when the app opens, if any.
 *
 * Nothing saved as As listed: offer to load the listing. Otherwise, if a
 * built-in variant (one that still carries a preset) is older than the
 * registry, offer to update it. A layout without a preset, such as a copy made
 * to start a redesign, is the user's own and never counts. The built-in plot
 * (`siteUpdate`, from decideSiteUpdate) is offered in the same prompt. A
 * remembered answer silences each part until the version it was given for is
 * superseded.
 *
 * A Proposed design started from As listed (a copy still carrying As listed's tag, or one that records the
 * version it is `basedOn`) is never replaced, but when the listing is newer than the version it was copied
 * at or last reviewed against, reviewing the listing's updates for it is offered too (`review`).
 */
export function decideStartupPrompt(
  variants: Partial<Record<VariantKey, Pick<HouseModel, "preset" | "basedOn">>>,
  registry: Registry,
  listingPresetId: string,
  remembered: Remembered,
  siteUpdate?: SiteUpdate | null,
): StartupPrompt | null {
  if (!variants.current) {
    const version = registry[listingPresetId]?.version;
    if (version === undefined || (remembered.load ?? 0) >= version) return null;
    // Loading the extension would overwrite a Proposed layout that is already there.
    return { kind: "load", version, withProposed: !variants.proposed };
  }
  const stale: VariantKey[] = [];
  let version = 0;
  for (const k of ["current", "proposed"] as VariantKey[]) {
    const p = variants[k]?.preset;
    // A Proposed still tagged as As listed is a copy made before copies dropped the tag: it is the user's own design.
    if (k === "proposed" && p?.id === listingPresetId) continue;
    const latest = p && registry[p.id]?.version;
    if (p && latest !== undefined && latest > p.version) {
      stale.push(k);
      version = Math.max(version, latest);
    }
  }
  const layoutsDue = stale.length > 0 && (remembered.update ?? 0) < version;
  const siteDue = !!siteUpdate && (siteUpdate.current || !!siteUpdate.proposed) && (remembered.site ?? 0) < siteUpdate.version;
  const latestListing = registry[listingPresetId]?.version;
  const reviewed = reviewedVersion(variants.proposed, listingPresetId);
  // A Proposed with another built-in's tag is that built-in, updated above; it is not a design to review.
  const isDesign = !variants.proposed?.preset || variants.proposed.preset.id === listingPresetId;
  const reviewDue = isDesign && latestListing !== undefined && reviewed !== undefined && reviewed < latestListing && (remembered.review ?? 0) < latestListing;
  if (!layoutsDue && !siteDue && !reviewDue) return null;
  return {
    kind: "update",
    version: layoutsDue ? version : 0,
    variants: layoutsDue ? stale : [],
    ...(siteDue ? { site: siteUpdate } : {}),
    ...(reviewDue ? { review: latestListing } : {}),
  };
}

type UpdatePrompt = Extract<StartupPrompt, { kind: "update" }>;
type Answer = "update" | "site" | "review";

/** What accepting a choice does: layouts to refresh, plots to replace, and which answers to remember afterwards. */
export type UpdatePlan = {
  layouts: VariantKey[];
  /** Plots replaced by the latest built-in one. */
  sites: VariantKey[];
  /** Plots that keep their edits and take only the latest boundary treatments (walls, fences, hedges). */
  boundaries?: VariantKey[];
  /** Afterwards, open the review of the listing's updates for Proposed. */
  review?: boolean;
  remember: Answer[];
};
export type UpdateChoice = { label: string; plan: UpdatePlan | null };

/** The answers a "not now" remembers: one per part that was on offer. */
export const notNowRemembers = (p: UpdatePrompt): Answer[] => [
  ...(p.variants.length ? (["update"] as const) : []),
  ...(p.site ? (["site"] as const) : []),
  ...(p.review ? (["review"] as const) : []),
];

/**
 * The question and buttons for an "update" prompt. A choice with a null plan does nothing and remembers
 * `notNowRemembers`. Proposed's own edited plot is only replaced by the choice that says so.
 *
 * With a review of the listing's changes for Proposed on offer it is one Update and Not now: Update brings
 * As listed (and the plots) up to date, keeping the owner's plot edits where there are any, then opens the
 * review, where the owner picks what to add to Proposed.
 */
export function describeUpdate(prompt: UpdatePrompt, houseName: string = activeHouseName()): { message: string; choices: UpdateChoice[] } {
  if (!prompt.review) return describeLayoutUpdate(prompt, houseName);
  const others = prompt.variants.length || prompt.site ? describeLayoutUpdate(prompt, houseName).choices.filter((c) => c.plan) : [];
  const keep = others.find((c) => !!c.plan?.boundaries?.length) ?? others[0];
  const plan: UpdatePlan = { ...(keep?.plan ?? { layouts: [], sites: [], remember: [] }), review: true };
  const names = plan.layouts.map((k) => VARIANT_LABEL[k]).join(" and ");
  const message = [
    `${houseName} has been updated.`,
    ...(plan.layouts.length ? [`${names} will match it (any edits to ${names} are replaced).`] : []),
    ...(plan.boundaries?.length ? ["Your plot edits are kept: only new fences, walls and neighbouring buildings come in."] : plan.sites.length ? ["Its plot will match it too."] : []),
    "Your Proposed keeps all your changes: next you'll see what's new and pick what to add to it. You can undo it.",
  ].join(" ");
  return {
    message,
    choices: [
      { label: "Update", plan },
      { label: "Not now", plan: null },
    ],
  };
}

function describeLayoutUpdate(prompt: UpdatePrompt, houseName: string): { message: string; choices: UpdateChoice[] } {
  const { variants: layouts, site } = prompt;
  const names = layouts.map((k) => VARIANT_LABEL[k]).join(" and ");
  if (!site) {
    return {
      message: `Newer plans for ${houseName} are available. Update? This replaces any edits you made to the built-in ${names} layout${layouts.length > 1 ? "s" : ""}; layouts you copied or made yourself are not touched. You can undo it.`,
      choices: [
        { label: "Update", plan: { layouts, sites: [], remember: [] } },
        { label: "Not now", plan: null },
      ],
    };
  }
  // The plots replaced by a plain "Update": As listed's, plus Proposed's when it is an unchanged copy of it.
  const sites: VariantKey[] = [...(site.current ? (["current"] as const) : []), ...(site.proposed === "with-current" ? (["proposed"] as const) : [])];
  const own = site.proposed === "own";
  // The plots with edits worth keeping, which can take the new boundary treatments alone.
  const keepers: VariantKey[] = [
    ...(site.current && site.currentEdited ? (["current"] as const) : []),
    ...(own || (site.proposed === "with-current" && site.currentEdited) ? (["proposed"] as const) : []),
  ];
  const boundaryChoice = (replaced: VariantKey[], withLayouts: VariantKey[]): UpdateChoice => ({
    label: withLayouts.length ? "Update, and only the plot's boundaries and neighbours (keep my plot edits)" : "Update the boundaries and neighbours only (keep my edits)",
    plan: { layouts: withLayouts, sites: replaced.filter((k) => !keepers.includes(k)), boundaries: keepers, remember: [] },
  });
  const tail = " Layouts and plots you copied or made yourself are not touched. You can undo it.";

  if (!layouts.length && !sites.length) {
    // Only Proposed's own plot is out of date.
    return {
      message: `A newer plot for ${houseName} is available. Proposed has a plot of its own; updating it replaces your plot edits there.${tail}`,
      choices: [
        { label: "Update Proposed's plot (your plot edits there are lost)", plan: { layouts: [], sites: ["proposed"], remember: [] } },
        boundaryChoice([], []),
        { label: "Not now", plan: null },
      ],
    };
  }
  const parts = [...(layouts.length ? [`house layouts (${layouts.map((k) => VARIANT_LABEL[k]).join(", ")})`] : []), ...(sites.length ? ["the plot"] : [])];
  const edits = [...(layouts.length ? [`the built-in ${names} layout${layouts.length > 1 ? "s" : ""}`] : []), ...(sites.length ? ["the plot"] : [])];
  const ownNote = own ? " Proposed has a plot of its own, which is left as it is unless you choose to update it too." : "";
  const keepNote = keepers.length ? " To keep your plot edits and only bring in the new fences, walls and neighbouring buildings, choose the update that keeps your edits." : "";
  const choices: UpdateChoice[] = [
    // Declining Proposed's own plot is an answer for it, so it is not asked again for this version.
    { label: "Update", plan: { layouts, sites, remember: own ? ["site"] : [] } },
  ];
  if (keepers.length) choices.push(boundaryChoice(sites, layouts));
  if (own) choices.push({ label: "Update, and Proposed's plot too (your plot edits there are lost)", plan: { layouts, sites: [...sites, "proposed"], remember: [] } });
  choices.push({ label: "Not now", plan: null });
  return {
    message: `${layouts.length ? `A newer version of ${houseName} is available: ${parts.join(" and ")}.` : `A newer plot for ${houseName} is available.`} Update? This replaces any edits you made to ${edits.join(" and ")}.${ownNote}${keepNote}${tail}`,
    choices,
  };
}

const BASE_KEY = "house-modeler/startup-prompt";
/** Per house: the default house keeps the old key, so its remembered answers carry over. */
const key = () => BASE_KEY + storageSuffix(activeHouseId());

/** Read the remembered answers; storage can throw or hold junk, so fall back to none. */
export function readRemembered(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): Remembered {
  try {
    const raw = storage?.getItem(key());
    const v = raw ? (JSON.parse(raw) as Remembered) : {};
    const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);
    return { load: num(v.load), update: num(v.update), site: num(v.site), review: num(v.review) };
  } catch {
    return {};
  }
}

export function remember(kind: keyof Remembered, version: number, storage: Pick<Storage, "getItem" | "setItem"> | undefined = safeStorage()) {
  try {
    storage?.setItem(key(), JSON.stringify({ ...readRemembered(storage), [kind]: version }));
  } catch {
    // Private mode or a full quota: the prompt may come back next time, which is harmless.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
