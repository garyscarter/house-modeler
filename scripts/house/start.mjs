// Begin a house: `npm run house:start <id> "<Name>"`.
// Makes reference/<id>/ (INTAKE.md, photos/) from reference/_template/, never overwriting, and remembers the
// choice in the gitignored .storey-local.json. It does not make src/houses/<id>/ (that is house:new, run by /eras-tour).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SLUG, fail, helpAndExit, intakeLines, root, ticket, writeLocal } from "./_lib.mjs";

helpAndExit(process.argv.slice(2), `Usage: npm run house:start <id> "<Name>"
Begins a house: makes reference/<id>/ with INTAKE.md and photos/, and remembers the id in .storey-local.json.
The id is a slug such as my-semi (2 to 40 lowercase letters, digits and hyphens), never an address.`);
const [id, name] = process.argv.slice(2);
if (!id || !name) fail('Usage: npm run house:start <id> "<Name>"   (id is a slug such as my-semi, never an address)');
if (!SLUG.test(id) || id.startsWith("_")) fail(`"${id}" is not a valid id: use 2 to 40 lowercase letters, digits and hyphens, starting with a letter or digit.`);

const ref = path.join(root, "reference", id);
mkdirSync(path.join(ref, "photos"), { recursive: true });
for (const f of ["INTAKE.md"]) {
  const from = path.join(root, "reference/_template", f);
  const to = path.join(ref, f);
  // NOTES.md is not copied: it lives in src/houses/<id>/, made by house:new from the template.
  // The template says <id> where the house's id goes: fill it in, so the form reads as this house's own.
  if (existsSync(from) && !existsSync(to)) writeFileSync(to, readFileSync(from, "utf8").replaceAll("<id>", id));
}
const keep = path.join(ref, "photos/.gitkeep");
if (!existsSync(keep)) writeFileSync(keep, "");
writeLocal({ house: id, name, welcomed: true });

console.log(ticket(id).join("\n"));
console.log(`Your ticket is stamped for "${name}". Your files go in reference/${id}/ (photos in reference/${id}/photos/).`);
console.log(intakeLines(id).join("\n"));
console.log(`Fill in reference/${id}/INTAKE.md, then run: npm run welcome`);
