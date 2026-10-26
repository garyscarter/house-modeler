// Garden mode checks, desktop 1440x900 then phone 390x844 and 360x780. Usage: PORT=5301 node scripts/test-garden.cjs
// Needs a dev server (npx vite --port 5301). Software GL, so the plan tab only; screenshots go to $SHOTS (default /tmp).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const port = process.env.PORT || 5301;
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; };
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const siteOf = (page) => page.evaluate(() => { const s = window.__houseStore.getState(); const x = s.sites[s.activeVariant] || s.sites.current; return JSON.parse(JSON.stringify(x)); });
const itemsOf = async (page) => (await siteOf(page)).items || [];
const gardenSel = (page) => page.evaluate(() => window.__houseStore.getState().gardenSel);
/** A world point (metres) as client px on the site plan. */
const toClient = (page, x, y) => page.evaluate(([x, y]) => {
  const svg = document.querySelector('.site-canvas svg');
  const g = svg.querySelector(':scope > g');
  const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
  const m = pt.matrixTransform(g.getScreenCTM());
  return { x: m.x, y: m.y, scale: g.getScreenCTM().a };
}, [x, y]);

async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failed++; });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('.welcome-tile', { timeout: 60000 });
  await page.locator('.welcome-tile').nth(1).click();
  await page.waitForSelector('.dock, .tab-bar', { timeout: 60000 });
  await page.evaluate(() => { const s = window.__houseStore.getState(); s.setMode('garden'); s.setUi({ tab: 'plan' }); });
  await page.waitForSelector('.site-canvas svg', { timeout: 30000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}

/** A free spot on the rear lawn in world metres (the centre of the biggest lawn). */
const lawnCentre = async (page) => {
  const s = await siteOf(page);
  const lawns = s.surfaces.filter((x) => x.kind === 'lawn').map((x) => {
    const xs = x.polygon.map((p) => p.x), ys = x.polygon.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    return { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2, a: w * h };
  }).sort((a, b) => b.a - a.a);
  return lawns[0];
};

(async () => {
  const browser = await chromium.launch({ args });

  // ---------------- desktop ----------------
  {
    const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const rail = await page.$$eval('.tool-rail [data-tool]', (els) => els.map((e) => e.getAttribute('data-tool')));
    ok(['add', 'select', 'surface', 'circle', 'polygon'].every((t) => rail.includes(t)), `garden rail has add, select, rectangle, circle, polygon (${rail.join(',')})`);
    ok(await page.$('.garden-panel') !== null, 'Garden panel is the inspector when nothing is selected');

    // Add the dining set by picker + click.
    const before = (await itemsOf(page)).length;
    await page.click('[data-tool="add"]');
    await page.waitForSelector('.garden-picker');
    await page.screenshot({ path: `${shots}/garden-desktop-picker.png`, timeout: 180000, animations: 'disabled' });
    await page.click('.garden-picker [data-garden-id="dining-6"]');
    const lawn = await lawnCentre(page);
    const at = await toClient(page, lawn.x, lawn.y);
    await page.mouse.move(at.x - 30, at.y - 30); await page.mouse.move(at.x, at.y);
    await page.screenshot({ path: `${shots}/garden-desktop-ghost.png`, timeout: 180000, animations: 'disabled' });
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(300);
    let items = await itemsOf(page);
    ok(items.length === before + 1 && items[items.length - 1].type === 'dining-6', 'picker + click places dining-6');
    const placed = items[items.length - 1];
    ok((await gardenSel(page)).join() === placed.id, 'the new item is selected');
    ok(await page.$('[data-garden-inspector="item"]') !== null, 'item inspector shown');

    // Drag it 1 m to the right.
    const start = await toClient(page, placed.x, placed.y);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(start.x + (start.scale * i) / 8, start.y);
    await page.mouse.up();
    await page.waitForTimeout(200);
    const moved = (await itemsOf(page)).find((i) => i.id === placed.id);
    ok(Math.abs(moved.x - placed.x - 1) < 0.1 && Math.abs(moved.y - placed.y) < 0.1, `drag moved it 1 m (dx ${(moved.x - placed.x).toFixed(2)})`);

    // E turns 15 degrees, Q back.
    await page.keyboard.press('e'); await page.waitForTimeout(100);
    ok((await itemsOf(page)).find((i) => i.id === placed.id).rot === 15, 'E rotates 15 degrees');
    await page.keyboard.press('q'); await page.waitForTimeout(100);
    ok((await itemsOf(page)).find((i) => i.id === placed.id).rot === 0, 'Q rotates back');
    await page.keyboard.press('e');

    // Rotate handle drag snaps to 15.
    const handle = await page.$('.site-rot');
    ok(!!handle, 'rotate handle is shown for a table');
    if (handle) {
      const hb = await handle.boundingBox();
      const c = await toClient(page, moved.x, moved.y);
      await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
      await page.mouse.down();
      await page.mouse.move(c.x + 120, c.y, { steps: 6 }); // straight right of the centre: 90 degrees
      await page.mouse.up();
      await page.waitForTimeout(150);
      ok((await itemsOf(page)).find((i) => i.id === placed.id).rot === 90, 'rotate handle turns it to 90');
    }

    // Duplicate, delete, undo.
    await page.keyboard.press('Control+d'); await page.waitForTimeout(200);
    items = await itemsOf(page);
    ok(items.length === before + 2, 'Ctrl+D duplicates');
    ok((await gardenSel(page)).length === 1 && (await gardenSel(page))[0] !== placed.id, 'the copy is selected');
    await page.waitForTimeout(800); // edits within 700 ms share one undo step
    await page.keyboard.press('Delete'); await page.waitForTimeout(200);
    ok((await itemsOf(page)).length === before + 1, 'Delete removes the copy');
    await page.waitForTimeout(800);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(250);
    ok((await itemsOf(page)).length === before + 2, 'Ctrl+Z restores it');
    await page.waitForTimeout(800);
    await page.keyboard.press('Control+z'); await page.waitForTimeout(150); // undo the duplicate too
    ok((await itemsOf(page)).length === before + 1, 'Ctrl+Z again removes the duplicate');

    // Copy and paste within the site.
    await page.click('.site-canvas svg', { position: { x: 700, y: 120 } });
    await page.waitForTimeout(100);
    await page.keyboard.press('Escape');

    // Circle lawn.
    await page.keyboard.press('c');
    const spot = await toClient(page, lawn.x - 3, lawn.y + 1);
    const surfacesBefore = (await siteOf(page)).surfaces.length;
    await page.mouse.move(spot.x, spot.y); await page.mouse.down();
    await page.mouse.move(spot.x + spot.scale, spot.y, { steps: 5 });
    await page.mouse.move(spot.x + spot.scale * 1.5, spot.y, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    let site = await siteOf(page);
    const circle = site.surfaces[site.surfaces.length - 1];
    ok(site.surfaces.length === surfacesBefore + 1 && circle.smooth === true && circle.polygon.length === 8, `circle tool draws a smooth 8-point surface (n=${circle.polygon.length}, smooth ${circle.smooth})`);
    ok(await page.$('[data-garden-inspector="surface"]') !== null, 'the new surface is selected');
    await page.screenshot({ path: `${shots}/garden-desktop-circle.png`, timeout: 180000, animations: 'disabled' });

    // Curved edges toggle and kerb.
    const curved = page.locator('[data-garden-inspector="surface"] label:has-text("Curved edges") input');
    await curved.uncheck(); await page.waitForTimeout(150);
    ok((await siteOf(page)).surfaces.find((s) => s.id === circle.id).smooth === false, 'Curved edges off');
    await curved.check(); await page.waitForTimeout(150);
    ok((await siteOf(page)).surfaces.find((s) => s.id === circle.id).smooth === true, 'Curved edges on');
    await page.selectOption('[aria-label="Kerb style"]', 'sleeper'); await page.waitForTimeout(150);
    ok((await siteOf(page)).surfaces.find((s) => s.id === circle.id).kerb === 'sleeper', 'kerb set to sleeper');
    await page.evaluate(() => document.activeElement && document.activeElement.blur()); // keys go to the select while it has focus
    await page.keyboard.press('Escape');

    // Polygon surface: four clicks and Enter.
    await page.keyboard.press('p');
    const pts = [[-4, -3], [-2, -3], [-2, -1], [-4, -1]].map(([dx, dy]) => [lawn.x + dx, lawn.y + dy]);
    const surfacesBefore2 = (await siteOf(page)).surfaces.length;
    for (const [x, y] of pts) { const c = await toClient(page, x, y); await page.mouse.click(c.x, c.y); await page.waitForTimeout(60); }
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    site = await siteOf(page);
    ok(site.surfaces.length === surfacesBefore2 + 1 && site.surfaces[site.surfaces.length - 1].polygon.length === 4, 'polygon tool: four clicks and Enter make a surface');
    await page.keyboard.press('Escape');

    // Festoon by two clicks.
    await page.keyboard.press('a');
    await page.waitForSelector('.garden-picker');
    await page.click('.garden-picker [data-garden-id="festoon"]');
    const f1 = await toClient(page, lawn.x - 2, lawn.y + 3), f2 = await toClient(page, lawn.x + 2, lawn.y + 3);
    await page.mouse.click(f1.x, f1.y); await page.waitForTimeout(80);
    await page.mouse.move(f2.x - 20, f2.y); await page.mouse.move(f2.x, f2.y);
    await page.mouse.click(f2.x, f2.y); await page.waitForTimeout(250);
    items = await itemsOf(page);
    const fest = items[items.length - 1];
    ok(fest.type === 'festoon' && fest.to && Math.abs(fest.to.x - fest.x - 4) < 0.2, 'festoon placed by two clicks has `to`');
    ok(await page.$$eval('.site-handle', (e) => e.length) >= 2, 'a selected run shows its end handles');
    await page.screenshot({ path: `${shots}/garden-desktop.png`, timeout: 180000, animations: 'disabled' });

    // Plant by picker: the spread handle.
    await page.keyboard.press('Escape');
    await page.keyboard.press('a');
    await page.click('.garden-picker [data-garden-id="apple-tree"]');
    const t = await toClient(page, lawn.x + 3, lawn.y - 2);
    await page.mouse.click(t.x, t.y); await page.waitForTimeout(250);
    items = await itemsOf(page);
    ok(items[items.length - 1].type === 'apple-tree', 'apple tree placed');
    ok(await page.$('.site-rot') === null, 'plants have no rotate handle');

    // Plot mode no longer selects surfaces.
    await page.evaluate(() => window.__houseStore.getState().setMode('plot'));
    await page.waitForTimeout(800);
    const pc = await toClient(page, lawn.x, lawn.y + 6);
    await page.mouse.click(pc.x, pc.y); await page.waitForTimeout(200);
    ok(await page.$('[data-garden-inspector="surface"]') === null, 'Plot mode: clicking a surface does not select it');
    ok(await page.$('.garden-items') !== null, 'Plot mode still draws the items');
    await page.screenshot({ path: `${shots}/garden-plot-faded.png`, timeout: 180000, animations: 'disabled' });
    await ctx.close();
  }

  // ---------------- phone ----------------
  for (const [w, h] of [[390, 844], [360, 780]]) {
    const { ctx, page } = await open(browser, { viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const bar = await page.evaluate(() => {
      const nav = document.querySelector('.tab-bar');
      const btns = [...nav.querySelectorAll('button')];
      return {
        fits: nav.scrollWidth <= nav.clientWidth,
        labels: btns.map((b) => b.querySelector('span').textContent),
        clipped: btns.filter((b) => { const s = b.querySelector('span'); const r = s.getBoundingClientRect(); const br = b.getBoundingClientRect(); return s.scrollWidth > s.clientWidth + 1 || r.left < br.left - 0.5 || r.right > br.right + 0.5 || r.right > nav.getBoundingClientRect().right + 0.5; }).map((b) => b.textContent),
      };
    });
    ok(bar.fits && bar.labels.length === 6 && bar.clipped.length === 0, `${w}px: six tab labels fit and none clips (${bar.labels.join(', ')}; clipped: ${bar.clipped.join(',') || 'none'})`);
    if (w === 390) {
      const rail = await page.$$eval('.tool-rail [data-tool]', (els) => els.map((e) => e.getAttribute('data-tool')));
      ok(!['surface', 'circle', 'polygon', 'rect'].some((t) => rail.includes(t)) && rail.includes('add') && rail.includes('select'), `phone rail has no draw tools (${rail.join(',')})`);
      await page.screenshot({ path: `${shots}/garden-phone.png`, timeout: 180000, animations: 'disabled' });
    }
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
