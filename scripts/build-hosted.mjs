// Build the app for the hosted Claude artifact: relative asset paths, plus a
// page body (the artifact host adds the doctype, head and body around it).
// Usage: `npm run build:hosted`, then publish dist-hosted/house-modeler.html
// with every file under dist-hosted/assets (see CLAUDE.md).
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const out = "dist-hosted";
execSync(`npx vite build --base=./ --outDir ${out} --emptyOutDir`, { stdio: "inherit" });
const assets = readdirSync(`${out}/assets`);
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
