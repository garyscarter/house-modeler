// Build the app for the hosted Claude artifact: relative asset paths, plus a
// page body (the artifact host adds the doctype, head and body around it).
// Usage: `npm run build:hosted`, then publish dist-hosted/house-modeler.html
// with every file under dist-hosted/assets (see CLAUDE.md).
// `npm run build:hosted -- --house <id>` builds another house (default: the id in src/houses/default.json): only that house's code
// and photos go into the build, and the build fails if anything from another house turns up.
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

const out = "dist-hosted";
const args = process.argv.slice(2);
const at = args.indexOf("--house");
const house = at >= 0 ? args[at + 1] : JSON.parse(readFileSync("src/houses/default.json", "utf8")).id;
if (!house || house.startsWith("--") || !existsSync(`src/houses/${house}/index.ts`)) {
  console.error(`No house "${house ?? ""}" under src/houses/ (usage: build-hosted.mjs [--house <id>])`);
  process.exit(1);
}
execSync(`npx vite build --base=./ --outDir ${out} --emptyOutDir`, { stdio: "inherit", env: { ...process.env, VITE_HOUSES: house } });
const assets = readdirSync(`${out}/assets`);

// Guard: nothing under dist-hosted/assets may come from a house that was left out. Vite names a copied file
// "<name>-<hash>.<ext>", so compare against the file names under each other house's assets/, and look for the
// house's source path in the code.
const others = readdirSync("src/houses", { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== house && existsSync(`src/houses/${d.name}/index.ts`))
  .map((d) => d.name);
const filesUnder = (dir) =>
  !existsSync(dir) ? [] : readdirSync(dir).flatMap((f) => (statSync(`${dir}/${f}`).isDirectory() ? filesUnder(`${dir}/${f}`) : [f]));
const leaks = [];
for (const other of others) {
  const own = new Set(filesUnder(`src/houses/${house}/assets`));
  for (const f of filesUnder(`src/houses/${other}/assets`)) {
    if (own.has(f)) continue; // the same file name in the chosen house is that house's own
    const dot = f.lastIndexOf(".");
    const re = new RegExp(`^${f.slice(0, dot).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-[\\w-]{6,}${f.slice(dot).replace(".", "\\.")}$`);
    for (const a of assets) if (re.test(a)) leaks.push(`${a} (asset of ${other})`);
  }
  for (const a of assets.filter((n) => /\.(js|css)$/.test(n))) {
    if (readFileSync(`${out}/assets/${a}`, "utf8").includes(`houses/${other}/`)) leaks.push(`${a} (mentions src/houses/${other}/)`);
  }
}
if (leaks.length) {
  console.error(`Hosted build for "${house}" contains files from other houses:\n  ${[...new Set(leaks)].join("\n  ")}`);
  process.exit(1);
}
// The entry script, the chunks it imports at startup (preloaded) and every stylesheet, as Vite linked
// them from its own index.html. The 3D view, plan editor, review and post-processing are separate
// chunks that the entry loads on demand.
const html = readFileSync(`${out}/index.html`, "utf8");
const strip = (href) => href.replace(/^\.?\/?assets\//, "");
const all = (re) => [...html.matchAll(new RegExp(re, "g"))].map((m) => strip(m[1]));
const js = all(/<script type="module"[^>]*src="([^"]+)"/)[0] ?? assets.find((f) => /^index-.*\.js$/.test(f));
const css = all(/<link rel="stylesheet"[^>]*href="([^"]+)"/);
if (!css.length) css.push(assets.find((f) => /^index-.*\.css$/.test(f)));
// The splash (its style and the root div) comes from index.html, so the two pages show the same thing.
const splashCss = (html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "").trim().split("\n").map((l) => "  " + l.trim()).join("\n");
const root = html.match(/<div id="root">[\s\S]*?<\/div><\/div>/)?.[0] ?? '<div id="root"></div>';
const preload = all(/<link rel="modulepreload"[^>]*href="([^"]+)"/);
writeFileSync(
  `${out}/house-modeler.html`,
  `<title>Storey</title>
<meta name="description" content="Visualise a house from its listing floorplan and plan the renovation.">
${css.map((f) => `<link rel="stylesheet" href="assets/${f}">`).join("\n")}
${preload.map((f) => `<link rel="modulepreload" crossorigin href="assets/${f}">`).join("\n")}
<style>
  /* A one-screen app: fill the page inside the viewer's safe-area padding rather than 100dvh. */
  :root { color-scheme: light; }
  html, body, #root { height: 100%; background: #eef0ec; }
${splashCss}
  .app { height: 100% !important; }
</style>
${root}
<script type="module" src="assets/${js}"></script>
`,
);
console.log(`Wrote ${out}/house-modeler.html (${assets.length} assets)`);
