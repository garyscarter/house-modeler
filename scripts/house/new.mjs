// Start a new house: `npm run house:new <id> "<Name>"`.
// Copies src/houses/_template to src/houses/<id>/ (renaming its ids), and makes reference/<id>/ for the source
// material (from reference/_template/ when that exists).
// It refuses only when src/houses/<id>/index.ts already exists. A reference/<id>/ folder that is already there (the
// intake may have been filled in first) is kept: template files are copied in without overwriting any file that
// exists, and an existing reference/<id>/INTAKE.md is never touched.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [id, argName] = process.argv.slice(2);
// With no name given, use the one house:start saved in the gitignored .storey-local.json for this id.
let name = argName;
if (id && !name) {
  try {
    const local = JSON.parse(readFileSync(path.join(root, ".storey-local.json"), "utf8"));
    if (local.house === id && typeof local.name === "string") name = local.name;
  } catch {}
}
if (!id || !name) {
  console.error('Usage: npm run house:new <id> ["<Name>"]   (id is a slug such as semi-on-the-hill)');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id) || id.startsWith("_")) {
  console.error(`"${id}" is not a valid id: use 2 to 40 lowercase letters, digits and hyphens, starting with a letter or digit.`);
  process.exit(1);
}
const dest = path.join(root, "src/houses", id);
const refDest = path.join(root, "reference", id);
if (existsSync(path.join(dest, "index.ts"))) {
  console.error(`${path.relative(root, path.join(dest, "index.ts"))} already exists; nothing was changed.`);
  process.exit(1);
}

cpSync(path.join(root, "src/houses/_template"), dest, { recursive: true, force: false, errorOnExist: false });
writeFileSync(path.join(dest, "meta.json"), JSON.stringify({ name }) + "\n");

// Rename the preset ids and the house id in the copied sources (tests too, which mention them).
const rename = (file) => {
  const before = readFileSync(file, "utf8");
  const after = before
    .replaceAll("_template-site", `${id}-site`)
    .replaceAll('"_template"', JSON.stringify(id))
    .replace("the template house", name);
  if (after !== before) writeFileSync(file, after);
};
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|md)$/.test(f)) rename(p);
  }
};
walk(dest);

const made = [path.relative(root, dest) + "/"];
const refTemplate = path.join(root, "reference/_template");
if (existsSync(refTemplate)) cpSync(refTemplate, refDest, { recursive: true, force: false, errorOnExist: false });
else {
  mkdirSync(refDest, { recursive: true });
  const intake = path.join(refDest, "INTAKE.md");
  if (!existsSync(intake)) writeFileSync(intake, `Run /eras-tour in Claude Code to fill in the intake for ${name}.\n`);
}
made.push(path.relative(root, refDest) + "/");

console.log(`Made ${made.join(" and ")} for "${name}" (id ${id}; presets ${id} and ${id}-site).`);
console.log(`Next: run /eras-tour in Claude Code to trace the house, or edit src/houses/${id}/house.ts by hand.`);
console.log(`Try it: VITE_HOUSES=${id} npm run dev   |   Check: npm run check   |   Overlay: npm run house:overlay ${id}`);
