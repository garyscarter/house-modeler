// `npm run soundcheck`: can this checkout run Storey? Node version, dependencies and the houses registry, and the
// house folder when one is being set up, and a browser for the screenshot steps. Exits 1 when a check fails.
import { browserAvailable, helpAndExit, readLocal, soundcheck } from "./_lib.mjs";

helpAndExit(process.argv.slice(2), `Usage: npm run soundcheck
Checks this checkout can run Storey: Node version, dependencies, houses registry, the local house folder and a browser
for screenshots. Prints a line per check; exits 1 when one fails.`);

const local = readLocal();
const id = local && typeof local.house === "string" ? local.house : null;
const checks = soundcheck(id);
if (checks.every((c) => c.ok))
  checks.push({
    ok: await browserAvailable(),
    label: "a browser for screenshots",
    fix: "Install Google Chrome (or Microsoft Edge), or run npx playwright-core install chromium once.",
  });
console.log("Soundcheck:");
for (const c of checks) console.log(`  ${c.ok ? "[x]" : "[ ]"} ${c.label}${c.ok ? "" : `: ${c.fix}`}`);
const bad = checks.filter((c) => !c.ok).length;
console.log(bad ? `${bad} to sort before the show.` : "All good. Mics on.");
process.exit(bad ? 1 : 0);
