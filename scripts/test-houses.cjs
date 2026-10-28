// Two houses in one build (docs/onboarding-plan.md §7 check 3). Needs a dev server built with two houses:
//   VITE_HOUSES=<default house id from src/houses/default.json>,_template npx vite --port 5302
// Usage: PORT=5302 node scripts/test-houses.cjs
// Checks: a fresh browser shows the picker; choosing the template opens it with its two rooms; "Switch house…"
// in the House menu goes back to the picker; the listing's saved project survives a visit to the template.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const port = process.env.PORT || 5302;
const fs = require('fs');
const path = require('path');
const DEFAULT_ID = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/houses/default.json'), 'utf8')).id;
const DEFAULT_NAME = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/houses/' + DEFAULT_ID + '/meta.json'), 'utf8')).name;
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; };
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const roomsOf = (page) => page.evaluate(() => {
  const s = window.__houseStore.getState();
  const m = s.variants.current;
  return m ? m.floors.flatMap((f) => f.rooms.map((r) => r.name)) : null;
});
const houseOf = (page) => page.evaluate(() => localStorage.getItem('storey-house'));

(async () => {
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failed++; });

  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('.house-picker, .welcome-tile', { timeout: 60000 });
  const picker = await page.locator('.house-picker').count();
  ok(picker === 1, 'a fresh browser with two houses shows the picker');
  const tiles = await page.locator('.house-picker button').allTextContents();
  ok(tiles.some((t) => t.includes(DEFAULT_NAME)) && tiles.some((t) => /Template house/.test(t)), `the picker lists both houses (${tiles.map((t) => t.trim()).join(' | ')})`);

  // Open the listing first and load it, so there is a saved project to protect.
  await page.locator('.house-picker button', { hasText: DEFAULT_NAME }).first().click();
  await page.waitForSelector('.welcome-tile', { timeout: 60000 });
  ok((await houseOf(page)) === DEFAULT_ID, 'choosing the listing remembers it');
  await page.locator('.welcome-tile').first().click();
  await page.waitForSelector('.dock, .tab-bar', { timeout: 60000 });
  const listingRooms = await roomsOf(page);
  ok(listingRooms && listingRooms.length > 10, `the listing loads (${listingRooms ? listingRooms.length : 0} rooms)`);
  await page.waitForTimeout(1500); // let the project persist

  // Switch to the template through the House menu.
  await page.locator('.house-menu button, button.house-menu-button, [aria-label="House menu"]').first().click();
  const switchItem = page.locator('[role="menuitem"], button', { hasText: /Switch house/ }).first();
  ok((await switchItem.count()) === 1, 'the House menu offers Switch house…');
  await switchItem.click();
  await page.waitForSelector('.house-picker', { timeout: 30000 });
  await page.locator('.house-picker button', { hasText: 'Template house' }).first().click();
  await page.waitForSelector('.welcome-tile', { timeout: 60000 });
  ok((await houseOf(page)) === '_template', 'choosing the template remembers it');
  await page.locator('.welcome-tile').first().click();
  await page.waitForSelector('.dock, .tab-bar', { timeout: 60000 });
  const templateRooms = await roomsOf(page);
  ok(templateRooms && templateRooms.length === 2, `the template opens with its two rooms (${templateRooms ? templateRooms.join(', ') : 'none'})`);
  const title = await page.title();
  ok(/Template house/.test(title) || !title.includes(DEFAULT_NAME), `the tab title is the template's (${title})`);

  // Back to the listing: its project is still there, no Welcome card.
  await page.evaluate((id) => { localStorage.setItem('storey-house', id); }, DEFAULT_ID);
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('.dock, .tab-bar, .welcome-tile', { timeout: 60000 });
  const backRooms = await roomsOf(page);
  ok(backRooms && backRooms.length === (listingRooms || []).length, `the listing's saved project survived the visit (${backRooms ? backRooms.length : 0} rooms)`);

  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'all passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL ' + e.message); process.exit(1); });
