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
  `<title>Storey</title>
<meta name="description" content="Visualise a house from its listing floorplan and plan the renovation.">
<link rel="stylesheet" href="assets/${css}">
<style>
  /* A one-screen app: fill the page inside the viewer's safe-area padding rather than 100dvh. */
  :root { color-scheme: light; }
  html, body, #root { height: 100%; background: #eef0ec; }
  .splash{height:100vh;height:100dvh;display:grid;place-content:center;justify-items:center;gap:14px;color:#6a736f;font:14px system-ui,sans-serif}
  .app { height: 100% !important; }
</style>
<div id="root"><div class="splash"><svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true" style="color:#0f6e66" fill="currentColor"><path d="M14 45H50Q52 45 52 47V53Q52 55 50 55H14Q12 55 12 53V47Q12 45 14 45Z"/><path d="M14 31H50Q52 31 52 33V39Q52 41 50 41H14Q12 41 12 39V33Q12 31 14 31Z"/><path d="M10 27L32 9L54 27Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>Opening your project</div></div>
<script type="module" src="assets/${js}"></script>
`,
);
console.log(`Wrote ${out}/house-modeler.html (${assets.length} assets)`);
