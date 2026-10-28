// Start a new house: `npm run house:new <id> "<Name>"`.
// Copies src/houses/_template to src/houses/<id>/ (renaming its ids), and makes reference/<id>/ for the source
// material (from reference/_template/ when that exists).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [id, name] = process.argv.slice(2);
if (!id || !name) {
  console.error('Usage: npm run house:new <id> "<Name>"   (id is a slug such as semi-on-the-hill)');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id) || id.startsWith("_")) {
  console.error(`"${id}" is not a valid id: use 2 to 40 lowercase letters, digits and hyphens, starting with a letter or digit.`);
  process.exit(1);
}
const dest = path.join(root, "src/houses", id);
const refDest = path.join(root, "reference", id);
if (existsSync(dest) || existsSync(refDest)) {
  console.error(`${existsSync(dest) ? path.relative(root, dest) : path.relative(root, refDest)} already exists; nothing was changed.`);
  process.exit(1);
}

cpSync(path.join(root, "src/houses/_template"), dest, { recursive: true });
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
if (existsSync(refTemplate)) cpSync(refTemplate, refDest, { recursive: true });
else {
  mkdirSync(refDest, { recursive: true });
  writeFileSync(path.join(refDest, "INTAKE.md"), `Run /eras-tour in Claude Code to fill in the intake for ${name}.\n`);
}
made.push(path.relative(root, refDest) + "/");

console.log(`Made ${made.join(" and ")} for "${name}" (id ${id}; presets ${id} and ${id}-site).`);
console.log(`Next: run /eras-tour in Claude Code to trace the house, or edit src/houses/${id}/house.ts by hand.`);
console.log(`Try it: VITE_HOUSES=${id} npm run dev   |   Check: npm run check   |   Overlay: npm run house:overlay ${id}`);
