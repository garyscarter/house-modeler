// Where am I? `npm run welcome` prints the right next step for this checkout, from the gitignored .storey-local.json.
// --hook   for the SessionStart hook: silent unless there is something new (first welcome) or the intake is not ready yet.
// --quiet  silent when the house is ready or no house is being set up.
import { beadsOf, bracelet, helpAndExit, houseIsIn, intakeLines, intakeState, nextEra, readLocal, soundcheckLines, surpriseSong, welcomeText, writeLocal } from "./_lib.mjs";

helpAndExit(process.argv.slice(2), `Usage: npm run welcome [-- --hook | --quiet]
Prints the right next step for this checkout, from the gitignored .storey-local.json.
--hook   for the SessionStart hook: silent unless there is something new or the intake is not ready.
--quiet  silent when the house is ready or no house is being set up.`);
const hook = process.argv.includes("--hook");
const HOOK_NOTE =
  "Storey first-run note for Claude: share the welcome below only if the person is new to this repo, asks how to start, or wants to add a house; otherwise leave it unsaid. When you share it, keep its gig framing (Ed Sheeran's support act is their intake, Taylor headlines as you building the house).";
const quiet = process.argv.includes("--quiet");
const out = [];
const local = readLocal();
const id = local && typeof local.house === "string" ? local.house : null;

// The soundcheck always comes first, hook or not: nothing else is worth saying if the checkout cannot run.
out.push(...soundcheckLines(id));

if (id && houseIsIn(id)) {
  const next = nextEra(id);
  // The hook shows the bracelet and the next era while the show is still on; once the encore is done it stays quiet.
  if (hook && next)
    out.push(
      bracelet(id),
      `Next up: ${next.name}. In Claude Code run /eras-tour to play it.`,
      `Note for Claude: open your first reply by offering, in one line, to play ${next.name} now with /eras-tour, unless the person has asked for something else.`,
    );
  if (!hook && !quiet) {
    out.push(bracelet(id));
    out.push(next ? `The show's on: run /eras-tour to play ${next.name}, or VITE_HOUSES=${id} npm run dev to see it.` : `That's the whole show. VITE_HOUSES=${id} npm run dev to see it.`);
    const song = surpriseSong(id);
    if (song) out.push(`Tonight's surprise song: ${song}`);
  }
} else if (id) {
  if (!(intakeState(id).ready && (hook || quiet))) out.push(...intakeLines(id));
  // A ready intake still needs its call to action in the hook, or the bracelet arrives with nothing to do next.
  if (hook && intakeState(id).ready)
    out.push(
      "Ed's set is done. Taylor's on next: in Claude Code run /eras-tour.",
      "Note for Claude: open your first reply by offering, in one line, to start /eras-tour now, unless the person has asked for something else.",
    );
  if (!quiet && (intakeState(id).ready || beadsOf(id).length)) out.push(bracelet(id));
} else {
  // No house chosen: greet. A first-time checkout (no local file) is greeted once and then marked as welcomed.
  // In the hook, a fresh checkout greets as a note for Claude rather than an announcement: cloud sessions start from
  // a fresh clone every time, so the owner's sessions would otherwise open on the welcome again and again.
  const note = hook ? [HOOK_NOTE] : [];
  if (!local) {
    out.push(...note, ...welcomeText());
    writeLocal({ house: null, welcomed: true });
  } else if (!hook && !quiet) out.push(...welcomeText());
  else if (!local.welcomed) {
    out.push(...note, ...welcomeText());
    writeLocal({ ...local, welcomed: true });
  }
}
if (out.length) console.log((hook ? out.slice(0, 15) : out).join("\n"));
