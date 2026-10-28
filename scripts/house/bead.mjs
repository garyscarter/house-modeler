// `npm run house:bead <era> [--house <id>]`: thread the bead for a finished era onto the house's friendship bracelet
// (reference/<id>/tour.json, committed with the era's work) and print the bracelet. The house comes from
// .storey-local.json unless --house names it. Eras: debut fearless speak-now red 1989 reputation lover folklore
// taylors-version encore.
import { existsSync } from "node:fs";
import path from "node:path";
import { addBead, bracelet, ERAS, fail, nextEra, parseArgs, readLocal, root } from "./_lib.mjs";

const { flags, pos } = parseArgs(process.argv.slice(2));
const id = flags.house ?? readLocal()?.house;
const era = pos[0];
if (!id) fail('No house: run npm run house:start <id> "<Name>" first, or pass --house <id>.');
if (!existsSync(path.join(root, "reference", id))) fail(`No reference/${id}/ folder: run npm run house:start ${id} first.`);
if (!era) {
  console.log(bracelet(id));
  process.exit(0);
}
if (!addBead(id, era)) fail(`Unknown era "${era}". Eras: ${ERAS.map((e) => e.key).join(", ")}.`);
console.log(bracelet(id));
const next = nextEra(id);
console.log(next ? `Next up: ${next.name}.` : "That's the whole show. Thank you, goodnight!");
