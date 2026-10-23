// Render the Storey app icons in public/ from the stacked-floors mark (roof, first floor, ground floor).
// Usage: node scripts/make-icons.mjs (needs Playwright; in the cloud container it is under /opt/node22).
// The same mark is drawn in the top bar by src/components/BrandMark.tsx and on the passcode page in server/page.mjs.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/opt/node22/lib/node_modules/playwright"));
}

const TEAL = "#0f6e66";
const MARK = `<path d="M10 27L32 9L54 27Z" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
  <rect x="12" y="31" width="40" height="10" rx="2" fill="#fff"/><rect x="12" y="45" width="40" height="10" rx="2" fill="#fff"/>`;

// scale: share of the icon the 64-unit mark box fills; radius: corner rounding as a share of the size (0 = full bleed).
const ICONS = [
  { file: "favicon-32.png", size: 32, scale: 0.8, radius: 0.2 },
  { file: "apple-touch-icon.png", size: 180, scale: 0.7, radius: 0 },
  { file: "icon-192.png", size: 192, scale: 0.7, radius: 0.225 },
  { file: "icon-512.png", size: 512, scale: 0.7, radius: 0.225 },
  // Maskable: full bleed, mark inside the 80% safe circle.
  { file: "icon-maskable-512.png", size: 512, scale: 0.56, radius: 0 },
];

function svg({ size, scale, radius }) {
  const box = 64 / scale;
  const o = (box - 64) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-o} ${-o} ${box} ${box}">
  <rect x="${-o}" y="${-o}" width="${box}" height="${box}" rx="${box * radius}" fill="${TEAL}"/>${MARK}</svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of ICONS) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg(icon)}`);
  await page.locator("svg").screenshot({ path: `public/${icon.file}`, omitBackground: true });
  console.log(`Wrote public/${icon.file}`);
}
await browser.close();
