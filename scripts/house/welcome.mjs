// Where am I? `npm run welcome` prints the right next step for this checkout, from the gitignored .storey-local.json.
// --hook   for the SessionStart hook: silent unless there is something new (first welcome) or the intake is not ready yet.
// --quiet  silent when the house is ready or no house is being set up.
import { houseIsIn, intakeLines, intakeState, readLocal, welcomeText, writeLocal } from "./_lib.mjs";

const hook = process.argv.includes("--hook");
const HOOK_NOTE =
  "Storey first-run note for Claude: share the welcome below only if the person is new to this repo, asks how to start, or wants to add a house; otherwise leave it unsaid.";
const quiet = process.argv.includes("--quiet");
const out = [];
const local = readLocal();
const id = local && typeof local.house === "string" ? local.house : null;

if (id && houseIsIn(id)) {
  if (!hook && !quiet) out.push("The show's on: run /eras-tour to pick up the next era, or VITE_HOUSES=" + id + " npm run dev to see it.");
} else if (id) {
  if (!(intakeState(id).ready && (hook || quiet))) out.push(...intakeLines(id));
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
