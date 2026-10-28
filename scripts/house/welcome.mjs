// Where am I? `npm run welcome` prints the right next step for this checkout, from the gitignored .storey-local.json.
// --hook   for the SessionStart hook: silent unless there is something new (first welcome) or the intake is not ready yet.
// --quiet  silent when the house is ready or no house is being set up.
import { houseIsIn, intakeLines, intakeState, readLocal, welcomeText, writeLocal } from "./_lib.mjs";

const hook = process.argv.includes("--hook");
const quiet = process.argv.includes("--quiet");
const out = [];
const local = readLocal();
const id = local && typeof local.house === "string" ? local.house : null;

if (id && houseIsIn(id)) {
  if (!hook && !quiet) out.push("Your house is in. In Claude Code run /eras-tour to continue, or `VITE_HOUSES=" + id + " npm run dev` to open it.");
} else if (id) {
  const s = intakeState(id);
  if (s.ready && (hook || quiet)) {
    // nothing to add
  } else out.push(...intakeLines(id, { cap: hook ? 14 : Infinity }));
} else {
  // No house chosen: greet. A first-time checkout (no local file) is greeted once and then marked as welcomed.
  if (!local) {
    out.push(...welcomeText());
    writeLocal({ house: null, welcomed: true });
  } else if (!hook && !quiet) out.push(...welcomeText());
  else if (!local.welcomed) {
    out.push(...welcomeText());
    writeLocal({ ...local, welcomed: true });
  }
}
if (out.length) console.log((hook ? out.slice(0, 15) : out).join("\n"));
