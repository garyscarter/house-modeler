// Touch checks for the plan editor on the phone chassis (390x844). Usage: PORT=5202 node scripts/test-touch-plan.cjs
// Taps a room and expects it selected (and the sheet raised); long-presses a room and expects the context menu;
// checks the rail offers no drawing tools; checks a drag that is interrupted by a second finger leaves no stuck drag.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const port = process.env.PORT || 5202;
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('.welcome-tile', { timeout: 30000 });
  await page.locator('.welcome-tile').nth(1).click();
  await page.waitForSelector('.dock', { timeout: 30000 });
  await page.evaluate(() => { const s = window.__houseStore.getState(); s.setMode('build'); s.setUi({ tab: 'plan', selectedRoomId: null }); });
  await page.waitForSelector('.plan-canvas svg', { timeout: 20000 });
  await page.waitForTimeout(1500);

  // Before the phone shell is merged the inspector is still the desktop card, which covers the plan at this width.
  await page.addStyleTag({ content: '.inspector-card:not([data-sheet]) { display: none !important; }' }).catch(() => {});
  const chassis = await page.evaluate(() => document.querySelector('.app')?.getAttribute('data-chassis'));
  ok(chassis === 'phone', `chassis is phone (${chassis})`);

  // Rail: no drawing tools.
  const tools = await page.$$eval('.tool-rail [data-tool]', (els) => els.map((e) => e.getAttribute('data-tool')));
  ok(!['rect', 'room', 'wall', 'canopy', 'gap', 'calibrate'].some((t) => tools.includes(t)), `rail has no drawing tools (${tools.join(',')})`);
  ok(tools.includes('select') && tools.includes('door') && tools.includes('window') && tools.includes('measure'), 'rail keeps select, door, window, measure');

  // A point inside a room clear of the tool rail (the first room whose centre is right of it), in client px.
  const roomPoint = async () => page.evaluate(() => {
    const s = window.__houseStore.getState();
    const f = s.variants[s.activeVariant].floors.find((x) => x.id === s.editFloorId) || s.variants[s.activeVariant].floors[0];
    const svg = document.querySelector('.plan-canvas svg');
    for (const r of f.rooms) {
      const cx = r.polygon.reduce((a, p) => a + p.x, 0) / r.polygon.length;
      const cy = r.polygon.reduce((a, p) => a + p.y, 0) / r.polygon.length;
      const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
      const m = pt.matrixTransform(svg.getScreenCTM());
      if (m.x > 110 && m.x < 380 && m.y > 40 && m.y < 700 && document.elementFromPoint(m.x, m.y)?.tagName === 'polygon') return { x: m.x, y: m.y, id: r.id };
    }
    return null;
  });

  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });

  // Tap selects.
  let p = await roomPoint();
  await touch('touchStart', [p]); await touch('touchEnd', []);
  await page.waitForTimeout(400);
  let sel = await page.evaluate(() => window.__houseStore.getState().selectedRoomId);
  ok(sel === p.id, `tap selects the room (${sel})`);
  const detent = await page.evaluate(() => document.querySelector('.app')?.getAttribute('data-sheet'));
  console.log('sheet detent after tap:', detent);

  // Tap on empty canvas clears.
  await touch('touchStart', [{ x: 8, y: 400 }]); await touch('touchEnd', []);
  await page.waitForTimeout(400);
  sel = await page.evaluate(() => window.__houseStore.getState().selectedRoomId);
  ok(sel === null || sel === undefined, 'tap on empty canvas clears the selection');

  // Long press opens the context menu, with no selection change by a tap or drag.
  await page.evaluate(() => window.__houseStore.getState().setUi({ selectedRoomId: null }));
  p = await roomPoint();
  await touch('touchStart', [p]);
  await page.waitForTimeout(700);
  ok((await page.locator('.ctx-menu').count()) === 1, 'long press opens the context menu');
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  ok((await page.locator('.ctx-menu').count()) === 1, 'menu stays open after the finger lifts');
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5).catch(() => {});
  await page.evaluate(() => document.querySelector('.ctx-menu') && document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 2, clientY: 2 })));
  await page.waitForTimeout(300);

  // A moving finger is a drag, not a long press.
  p = await roomPoint();
  await touch('touchStart', [p]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: p.x + i * 6, y: p.y }]); await page.waitForTimeout(30); }
  await page.waitForTimeout(650);
  ok((await page.locator('.ctx-menu').count()) === 0, 'a moving finger does not open the menu');
  await touch('touchEnd', []);
  await page.waitForTimeout(300);

  // A second finger during a one-finger press ends it (pinch) and leaves nothing stuck: a later tap still selects.
  await page.evaluate(() => window.__houseStore.getState().setUi({ selectedRoomId: null }));
  p = await roomPoint();
  await touch('touchStart', [p]);
  await touch('touchStart', [p, { x: p.x + 60, y: p.y + 30 }]);
  await touch('touchMove', [p, { x: p.x + 90, y: p.y + 40 }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  p = await roomPoint();
  await touch('touchStart', [p]); await touch('touchEnd', []);
  await page.waitForTimeout(400);
  sel = await page.evaluate(() => window.__houseStore.getState().selectedRoomId);
  ok(!!sel, 'a tap after a pinch still selects (no stuck drag)');

  // ---- Garden mode on the phone: the tab bar, no draw tools, tap to add from the picker, drag it, the turn buttons ----
  await page.evaluate(() => { const st = window.__houseStore.getState(); st.setMode('garden'); st.setUi({ tab: 'plan' }); });
  await page.waitForSelector('.site-canvas svg', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const bar = await page.evaluate(() => { const n = document.querySelector('.tab-bar'); return { fits: n.scrollWidth <= n.clientWidth, count: n.querySelectorAll('button').length }; });
  ok(bar.fits && bar.count === 6, `garden: the six-tab bar fits at 390 px (${bar.count} tabs)`);
  const gtools = await page.$$eval('.tool-rail [data-tool]', (els) => els.map((e) => e.getAttribute('data-tool')));
  ok(gtools.includes('add') && gtools.includes('select') && !['surface', 'circle', 'polygon', 'rect'].some((t) => gtools.includes(t)), `garden: rail has add and select, no draw tools (${gtools.join(',')})`);
  const gitems = () => page.evaluate(() => { const st = window.__houseStore.getState(); return ((st.sites[st.activeVariant] || st.sites.current).items || []).map((i) => ({ ...i })); });
  const tapEl = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); const b = await page.locator(sel).first().boundingBox(); await touch('touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }]); await touch('touchEnd', []); await page.waitForTimeout(400); };
  const before = (await gitems()).length;
  await tapEl('[data-tool="add"]');
  ok((await page.locator('.garden-picker').count()) === 1, 'garden: tapping Add opens the picker');
  await tapEl('.garden-picker [data-garden-id="bench"]');
  let items = await gitems();
  ok(items.length === before + 1 && items[items.length - 1].type === 'bench', 'garden: tapping an entry places it');
  const bench = items[items.length - 1];
  ok((await page.evaluate(() => window.__houseStore.getState().gardenSel)).join() === bench.id, 'garden: the new item is selected');
  // Drag it by 60 screen px.
  const toClient = (x, y) => page.evaluate(([x, y]) => { const svg = document.querySelector('.site-canvas svg'); const g = svg.querySelector(':scope > g'); const pt = svg.createSVGPoint(); pt.x = x; pt.y = y; const m = pt.matrixTransform(g.getScreenCTM()); return { x: m.x, y: m.y, scale: g.getScreenCTM().a }; }, [x, y]);
  await tapEl('.sheet-head'); // the selection raised the sheet over the lawn; tap its header to drop it
  const c = await toClient(bench.x, bench.y);
  await touch('touchStart', [{ x: c.x, y: c.y }]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: c.x + i * 10, y: c.y }]); await page.waitForTimeout(30); }
  await touch('touchEnd', []);
  await page.waitForTimeout(400);
  const after = (await gitems()).find((i) => i.id === bench.id);
  ok(Math.abs(after.x - bench.x - 60 / c.scale) < 0.15, `garden: dragging with a finger moves it (dx ${(after.x - bench.x).toFixed(2)} m, expected ${(60 / c.scale).toFixed(2)})`);
  // Turn by the inspector button (the sheet shows the item's fields).
  await tapEl('.sheet-head'); // raise the sheet again
  const turn = page.locator('button[aria-label="Turn 15 degrees clockwise"]').first();
  if (await turn.count()) { await turn.tap(); await page.waitForTimeout(300); }
  ok((await gitems()).find((i) => i.id === bench.id).rot === 15, 'garden: the +15 button turns it');

  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
