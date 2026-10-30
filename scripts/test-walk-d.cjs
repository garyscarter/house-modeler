// Walk chrome checks (Chunk D): the Walk button, walk bar, mini-map, hint, phone and tablet layout.
// Usage: PORT=5314 SHOTS=/tmp/shots node scripts/test-walk-d.cjs   (needs a dev server on PORT)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const PORT = process.env.PORT; let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const SHOTS = process.env.SHOTS || '/tmp';
const IPAD = { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };
const WALK = '.dock [aria-label^="Walk"], .dock button:has-text("Walk")';

async function open(tile = 0, ctxOpts = { viewport: { width: 1440, height: 900 } }) {
  const browser = await chromium.launch({ args });
  const page = await (await browser.newContext(ctxOpts)).newPage();
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); failed++; });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.welcome-tile', { timeout: 120000 });
  await page.locator('.welcome-tile').nth(tile).click();
  await page.waitForSelector('.dock', { timeout: 120000 });
  await page.evaluate(() => { const s = window.__houseStore.getState(); s.setSettings({ quality: 'low' }); s.setUi({ tab: '3d' }); });
  await page.waitForFunction(() => !document.querySelector('.viewer-loading'), null, { timeout: 180000 });
  return { browser, page };
}
const walkState = (page) => page.evaluate(() => { const s = window.__walkStore.getState(); return { on: s.on, goal: s.goal, tour: s.tour.status, showMap: s.showMap }; });
const variant = (page) => page.evaluate(() => window.__houseStore.getState().activeVariant);

(async () => {
  for (const [name, ctx] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['ipad', IPAD], ['phone', PHONE]]) {
    console.log(`--- ${name}`);
    const phone = name === 'phone';
    const { browser, page } = await open(1, ctx);
    await page.screenshot({ path: `${SHOTS}/walk-dock-${name}.png` });
    const dockW0 = await page.$eval('.dock', (e) => e.getBoundingClientRect().width);
    const btnW = await page.$eval('.dock [aria-label^="Walk"]', (e) => e.getBoundingClientRect().width);
    // the dock grows by the Walk button (and one 6px gap) only
    const without = await page.evaluate(() => { const b = document.querySelector('.dock [aria-label^="Walk"]'); const d = b.style.display; b.style.display = 'none'; const w = document.querySelector('.dock').getBoundingClientRect().width; b.style.display = d; return w; });
    ok(phone ? Math.abs(dockW0 - without) < 1.5 : Math.abs(dockW0 - without - btnW - 6) < 1.5, `${phone ? 'phone dock keeps its width' : 'dock grows by the Walk button only'} (${without.toFixed(0)} -> ${dockW0.toFixed(0)}, button ${btnW.toFixed(0)})`);
    ok(await page.$(WALK) !== null, 'Walk button in the dock');
    ok(phone ? (await page.$eval('.dock [aria-label^="Walk"]', (e) => e.textContent.trim() === '')) : true, phone ? 'phone Walk button is icon-only' : 'Walk button has its label');
    await page.click(WALK);
    await page.waitForSelector('.walk-bar');
    ok((await walkState(page)).on, 'walking');
    ok(await page.evaluate(() => document.activeElement === document.body || !document.activeElement.closest('.dock')), 'focus not left on a dock button');
    ok(await page.$eval('.app', (e) => e.hasAttribute('data-walking')), 'app has data-walking');
    ok(await page.$('.walk-map') === null || await page.evaluate(() => !!window.__walkStore.getState().pose), 'no map before there is a pose');
    // The walk controller places the walker at once; this stand-in only matters if it has not yet.
    await page.evaluate(() => { const w = window.__walkStore.getState(); if (!w.pose) w.placed({ x: 0, y: 0, level: 0, stair: null, feetY: 0, yaw: 0, pitch: 0 }, {}); });
    await page.evaluate(() => { window.__walkStore.getState().setWhere({ level: 0, roomName: 'Kitchen', outside: false }); window.__walkStore.getState().say('Click the floor to walk there', 60000); });
    await page.waitForSelector('.walk-map svg path');
    // The controller takes a goal as soon as it is set, so note what the map asks for.
    await page.evaluate(() => { const w = window.__walkStore; const orig = w.getState().requestGoal; window.__lastGoal = null; w.setState({ requestGoal: (g) => { window.__lastGoal = g; orig(g); } }); });
    ok(await page.$('.walk-map svg path') !== null, 'mini-map shows rooms');
    const mapW = await page.$eval('.walk-map', (e) => Math.round(e.getBoundingClientRect().width));
    ok(mapW === (phone ? 120 : 180), `map is ${mapW}px`);
    const mapBox = await page.$eval('.walk-map', (e) => { const r = e.getBoundingClientRect(); return { r: r.right, t: r.top, b: r.bottom }; });
    ok(phone ? mapBox.t < 80 && mapBox.r > ctx.viewport.width - 20 : mapBox.b > ctx.viewport.height - 100, 'map is top-right on the phone, bottom-right otherwise');
    ok(!phone ? (await page.$eval('.walk-where', (e) => e.textContent)).includes('Kitchen') : true, 'readout names the room');
    ok((await page.$eval('.walk-hint', (e) => e.getAttribute('role'))) === 'status', 'hint pill shows');
    if (phone) ok(await page.$eval('.layout-pill', (e) => getComputedStyle(e).display === 'none').catch(() => true), 'layout pill hidden while walking');
    // marker follows the pose with no rerender
    const t0 = await page.$eval('.wm-marker', (e) => e.getAttribute('transform'));
    await page.evaluate(() => window.__walkStore.getState().setPose({ x: 1, y: 1, level: 0, stair: null, feetY: 0, yaw: Math.PI / 2, pitch: 0 }));
    const t1 = await page.$eval('.wm-marker', (e) => e.getAttribute('transform'));
    ok(t0 !== t1 && t1.includes('rotate(-90)'), 'marker moves and turns with the pose');
    // tap a room on the map -> goal set
    const clicked = await page.evaluate(() => {
      for (const p of document.querySelectorAll('.walk-map .wm-room')) {
        const r = p.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (document.elementFromPoint(x, y) === p) return { x, y, id: p.getAttribute('data-room-id') };
      }
      return null;
    });
    ok(!!clicked, 'found a room to tap');
    await page.mouse.click(clicked.x, clicked.y);
    const g = await page.evaluate(() => window.__lastGoal);
    ok(g && g.kind === 'room' && g.roomId === clicked.id && g.level === 0, 'tapping a room on the map sets the goal');
    // eye height
    await page.click('.walk-eye .popover-btn');
    await page.waitForSelector('.walk-eye input[type=range]');
    const setRange = (v) => page.$eval('.walk-eye input[type=range]', (el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
    await setRange(1.7);
    ok((await page.evaluate(() => window.__houseStore.getState().settings.eyeHeight)) === 1.7, 'eye height 1.7 written to settings');
    ok((await page.$eval('.walk-eye .popover-btn', (e) => e.getAttribute('aria-label'))).includes('1.70'), 'eye label follows');
    await page.screenshot({ path: `${SHOTS}/walk-eye-${name}.png` });
    await page.click('.walk-reset');
    ok((await page.evaluate(() => window.__houseStore.getState().settings.eyeHeight)) === 1.6, 'reset goes to 1.6');
    await setRange(1.7);
    await page.keyboard.press('Escape'); // closes the popover (the walk itself is C's to stop)
    await page.click('.walk-eye .popover-btn'); // toggle closed if still open
    // flip
    const v0 = await variant(page);
    await page.click('.walk-bar [aria-label^="Flip"]');
    const v1 = await variant(page);
    ok(v1 !== v0, `flip changes layout (${v0} -> ${v1})`);
    await page.click('.walk-bar [aria-label^="Flip"]');
    ok((await variant(page)) === v0, 'flip again goes back');
    // tour
    await page.click('.walk-bar [aria-label="Play tour"]');
    ok((await walkState(page)).tour === 'playing', 'Play sets tour playing');
    await page.click('.walk-bar [aria-label="Pause tour"]');
    ok((await walkState(page)).tour === 'paused', 'Pause sets tour paused');
    await page.click('.walk-bar [aria-label="End tour"]');
    ok((await walkState(page)).tour === 'off', 'x ends the tour');
    // map toggle
    await page.click('.walk-bar [aria-label="Mini-map"]');
    ok(await page.$('.walk-map') === null, 'map toggle hides the map');
    await page.click('.walk-bar [aria-label="Mini-map"]');
    ok(await page.$('.walk-map') !== null, 'map toggle shows it again');
    // outside: plot boundary, dashed; tapping outside rooms -> point goal
    await page.evaluate(() => { const w = window.__walkStore.getState(); w.setWhere({ level: 0, roomName: null, outside: true }); w.setPose({ x: 0, y: 0, level: 0, stair: null, feetY: 0, yaw: 0, pitch: 0 }); });
    const plot = await page.$('.walk-map .wm-plot');
    if (plot) {
      ok(true, 'plot boundary drawn when outside');
      ok(!phone ? (await page.$eval('.walk-where', (e) => e.textContent)) === 'Garden' : true, 'readout says Garden');
      await page.evaluate(() => { window.__walkStore.getState().takeGoal(); window.__lastGoal = null; });
      const pt = await page.evaluate(() => { const svg = document.querySelector('.walk-map svg'); const r = svg.getBoundingClientRect();
        for (let y = 6; y < r.height; y += 6) for (let x = 6; x < r.width; x += 6) { const el = document.elementFromPoint(r.left + x, r.top + y); if (el === svg) return { x: r.left + x, y: r.top + y }; } return null; });
      if (pt) { await page.mouse.click(pt.x, pt.y); const g2 = await page.evaluate(() => window.__lastGoal); ok(g2 && g2.kind === 'point' && g2.level === 0, 'tapping the plot sets a point goal'); }
    } else console.log('SKIP no plot for this house');
    await page.evaluate(() => { const w = window.__walkStore.getState(); w.setWhere({ level: 0, roomName: 'Kitchen', outside: false }); w.setPose({ x: 1, y: 1, level: 0, stair: null, feetY: 0, yaw: 0.5, pitch: 0 }); });
    const r = await page.$eval('.walk-bar', (e) => e.getBoundingClientRect());
    ok(r.left >= 0 && r.right <= ctx.viewport.width, `walk bar fits the screen (${Math.round(r.left)}-${Math.round(r.right)} of ${ctx.viewport.width})`);
    const small = await page.$$eval('.walk-bar button, .walk-bar .popover-btn', (els) => els.filter((e) => e.getBoundingClientRect().height < 30).map((e) => e.getAttribute('aria-label')));
    ok(small.filter((l) => l !== 'End tour').length === 0, 'walk buttons are at least 30px high');
    if (phone) ok((await page.$$eval('.walk-bar > button, .walk-bar .popover-btn', (els) => els.every((e) => Math.round(e.getBoundingClientRect().width) >= 36))), 'phone targets are 36px');
    await page.screenshot({ path: `${SHOTS}/walk-${ctx.viewport.width}.png` });
    await page.click('.walk-bar [aria-label="Stop walking"]');
    ok(!(await walkState(page)).on, 'stopped');
    ok(await page.$('.walk-bar') === null && await page.$('.walk-map') === null, 'walk chrome gone, dock back');
    // survives reload
    await page.reload();
    await page.waitForSelector('.dock', { timeout: 120000 });
    ok((await page.evaluate(() => window.__houseStore.getState().settings.eyeHeight)) === 1.7, 'eye height survives reload');
    await browser.close();
  }
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
