// `npm run soundcheck`: can this checkout run Storey? Node version, dependencies and the houses registry, and the
// house folder when one is being set up. Exits 1 when a check fails. Starts nothing.
import { readLocal, soundcheck } from "./_lib.mjs";

const local = readLocal();
const id = local && typeof local.house === "string" ? local.house : null;
const checks = soundcheck(id);
console.log("Soundcheck:");
for (const c of checks) console.log(`  ${c.ok ? "[x]" : "[ ]"} ${c.label}${c.ok ? "" : `: ${c.fix}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(bad ? `${bad} to sort before the show.` : "All good. Mics on.");
process.exit(bad ? 1 : 0);
