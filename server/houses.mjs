// The default house id, shared with the app build (src/houses/default.json): its project stays in project.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "houses", "default.json");

export const DEFAULT_HOUSE_ID = JSON.parse(fs.readFileSync(FILE, "utf8")).id;
