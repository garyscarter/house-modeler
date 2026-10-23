// Build the app for the hosted Claude artifact: relative asset paths, plus a
// page body (the artifact host adds the doctype, head and body around it).
// Usage: `npm run build:hosted`, then publish dist-hosted/house-modeler.html
// with every file under dist-hosted/assets (see CLAUDE.md).
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const out = "dist-hosted";
execSync(`npx vite build --base=./ --outDir ${out} --emptyOutDir`, { stdio: "inherit" });
const assets = readdirSync(`${out}/assets`);
// The entry script and stylesheet, as Vite linked them from its own index.html (the 3D view,
// post-processing and report are separate chunks that the entry loads on demand).
const html = readFileSync(`${out}/index.html`, "utf8");
const pick = (re) => html.match(re)?.[1]?.replace(/^\.?\/?assets\//, "");
const js = pick(/<script type="module"[^>]*src="([^"]+)"/) ?? assets.find((f) => /^index-.*\.js$/.test(f));
const css = pick(/<link rel="stylesheet"[^>]*href="([^"]+)"/) ?? assets.find((f) => /^index-.*\.css$/.test(f));
writeFileSync(
  `${out}/house-modeler.html`,
  `<title>House Modeler</title>
<meta name="description" content="Visualise a house from its listing floorplan and plan the renovation.">
<link rel="stylesheet" href="assets/${css}">
<style>
  /* A one-screen app: fill the page inside the viewer's safe-area padding rather than 100dvh. */
  :root { color-scheme: light; }
  html, body, #root { height: 100%; background: #f6f7f9; }
  .app { height: 100% !important; }
</style>
<div id="root"></div>
<script type="module" src="assets/${js}"></script>
`,
);
console.log(`Wrote ${out}/house-modeler.html (${assets.length} assets)`);
