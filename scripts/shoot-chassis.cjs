const { chromium, devices } = require('/opt/node22/lib/node_modules/playwright');
const out = process.env.OUT || '/tmp/shots';
require('fs').mkdirSync(out, { recursive: true });
// Usage: PORT=5201 OUT=/path/to/shots node scripts/shoot-chassis.cjs  (against a running `npx vite --port 5201`)
// Screenshots every mode (Build, Decorate, Furnish, Electrics, Garden, Plot, Review) at phone (390x844), iPad portrait (820x1180) and iPad landscape (1180x820), all touch.
const sizes = [
  ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }],
  ['tablet-portrait', { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }],
  ['tablet-land', { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }],
];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [name, opts] of sizes) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
    await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/');
    await page.waitForSelector('.welcome-tile', { timeout: 20000 });
    await page.screenshot({ timeout: 120000, animations: "disabled", path: `${out}/${name}-welcome.png` });
    await page.locator('.welcome-tile').nth(1).click();
    await page.waitForSelector('.dock', { timeout: 30000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ timeout: 120000, animations: "disabled", path: `${out}/${name}-3d-build.png` });
    // select a room via store
    await page.evaluate(() => { const s = window.__houseStore.getState(); const f = s.variants[s.activeVariant].floors[0]; s.setUi({ selectedRoomId: f.rooms[0].id, editFloorId: f.id }); });
    await page.waitForTimeout(500);
    await page.screenshot({ timeout: 120000, animations: "disabled", path: `${out}/${name}-3d-build-room.png` });
    await page.evaluate(() => window.__houseStore.getState().setMode('decorate'));
    await page.waitForTimeout(500);
    await page.screenshot({ timeout: 120000, animations: "disabled", path: `${out}/${name}-3d-decorate-room.png` });
    await page.evaluate(() => window.__houseStore.getState().setMode('build'));
    await page.evaluate(() => window.__houseStore.getState().setUi({ tab: 'plan' }));
    await page.waitForTimeout(2500);
    await page.screenshot({ timeout: 120000, animations: "disabled", path: `${out}/${name}-plan-build.png` });
    await page.evaluate(() => window.__houseStore.getState().setMode('furnish'));
    await page.waitForTimeout(800);
    await page.screenshot({ timeout: 120000, animations: "disabled", path: `${out}/${name}-plan-furnish.png` });
    await page.evaluate(() => window.__houseStore.getState().setMode('electrics'));
    await page.waitForTimeout(800);
    await page.screenshot({ timeout: 120000, animations: "disabled", path: `${out}/${name}-plan-electrics.png` });
    // Garden: the plan with the panel, then with a table and a tree placed and the table selected (the phone sheet shows its fields), then 3D.
    await page.evaluate(() => window.__houseStore.getState().setMode('garden'));
    await page.waitForTimeout(1500);
    await page.screenshot({ timeout: 120000, animations: "disabled", path: `${out}/${name}-plan-garden.png` });
    await page.evaluate(() => {
      const s = window.__houseStore.getState();
      const site = s.sites[s.activeVariant] || s.sites.current;
      const lawn = site.surfaces.filter((x) => x.kind === 'lawn').sort((a, b) => b.polygon.length - a.polygon.length)[0];
      const cx = lawn.polygon.reduce((a, p) => a + p.x, 0) / lawn.polygon.length, cy = lawn.polygon.reduce((a, p) => a + p.y, 0) / lawn.polygon.length;
      s.updateSite((st) => ({ ...st, items: [...(st.items || []), { id: 'shoot-dining', type: 'dining-6', x: cx, y: cy, rot: 0 }, { id: 'shoot-tree', type: 'apple-tree', x: cx + 2.5, y: cy - 1.5, rot: 0 }] }));
      s.setUi({ gardenSel: ['shoot-dining'] });
    });
    await page.waitForTimeout(1200);
    await page.screenshot({ timeout: 120000, animations: "disabled", path: `${out}/${name}-plan-garden-item.png` });
    await page.evaluate(() => window.__houseStore.getState().setUi({ tab: '3d' }));
    await page.waitForTimeout(3500);
    await page.screenshot({ timeout: 120000, animations: "disabled", path: `${out}/${name}-3d-garden.png` });
    await page.evaluate(() => window.__houseStore.getState().setUi({ tab: 'plan' }));
    await page.evaluate(() => window.__houseStore.getState().setMode('plot'));
    await page.waitForTimeout(1500);
    await page.screenshot({ timeout: 120000, animations: "disabled", path: `${out}/${name}-plan-plot.png` });
    await page.evaluate(() => window.__houseStore.getState().setMode('review'));
    await page.waitForTimeout(1500);
    await page.screenshot({ timeout: 120000, animations: "disabled", path: `${out}/${name}-review.png` });
    await page.evaluate(() => window.__houseStore.getState().setMode('build'));
    await page.evaluate(() => window.__houseStore.getState().setUi({ tab: '3d' }));
    await page.locator('.house-menu-btn').click();
    await page.waitForTimeout(400);
    await page.screenshot({ timeout: 120000, animations: "disabled", path: `${out}/${name}-housemenu.png` });
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
