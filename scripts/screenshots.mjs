// Dev helper: screenshot the built-in house in headless Chromium (software WebGL).
// Usage: start `npx vite --port 5173`, then `node scripts/screenshots.mjs <out-dir>`.
import { createRequire } from "module";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const out = process.argv[2];
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto("http://localhost:5173/");
await page.click(".welcome-tile >> nth=0");
await page.waitForTimeout(1500);
await page.uncheck("header label.check:has-text('Labels') input");
const snap = async (n) => { await page.waitForTimeout(3500); await page.screenshot({ path: `${out}/${n}.png`, clip: { x: 340, y: 60, width: 1160, height: 840 } }); };
// Street-level view from front-right like the agent's photo.
await page.evaluate(() => {});
await page.click(".view-buttons button:has-text('front')"); await snap("front");
await page.click(".view-buttons button:has-text('rear')"); await snap("rear");
await page.click(".view-buttons button:has-text('left')"); await snap("left");
await snap0();
async function snap0() { await page.click(".view-buttons button:has-text('top')"); await snap("top"); }
await page.click("header button:has-text('Check plan')"); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/plan-ground.png` });
await page.click("aside button:has-text('Photos')"); await page.waitForTimeout(500);
await page.click("text=/^Load .+ photos$/"); await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/photos.png` });
console.log(errs.join("\n") || "no page errors", await page.locator(".photo-card").count());
await browser.close();
