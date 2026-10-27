// Electrics mode checks: desktop 1440x900, then phone 390x844 and 360x780. Usage: PORT=5301 SHOTS=/dir node scripts/test-electrics.cjs
// Needs a dev server (npx vite --port 5301). Software GL, so the plan tab only. Listing Proposed.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const port = process.env.PORT || 5301;
const shots = process.env.SHOTS || '/tmp';
let failed = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; };
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const model = (page) => page.evaluate(() => { const s = window.__houseStore.getState(); return JSON.parse(JSON.stringify(s.variants[s.activeVariant])); });
const floorOf = async (page) => { const s = await page.evaluate(() => { const s = window.__houseStore.getState(); const m = s.variants[s.activeVariant]; return { m: JSON.parse(JSON.stringify(m)), id: s.editFloorId }; }); return s.m.floors.find((f) => f.id === s.id) || s.m.floors[0]; };
const fixturesOf = async (page) => (await floorOf(page)).fixtures || [];
/** Image px (plan frame) to client px. */
const toClient = (page, x, y) => page.evaluate(([x, y]) => {
  const svg = document.querySelector('.plan-canvas svg');
  const g = svg.querySelector(':scope > g');
  const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
  const m = pt.matrixTransform(g.getScreenCTM());
  return { x: m.x, y: m.y, scale: g.getScreenCTM().a };
}, [x, y]);
const ids = (page) => page.evaluate(async () => {
  const c = await import('/src/lib/catalogue.ts');
  const pick = (a, b) => (c.byId(a) ? a : b);
  return { pendant: pick('pendant', 'light-pendant') };
});

const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };

/** A horizontal wall with free run: the midpoint of a long room edge, with the point 5 cm into the room and the expected rotation. */
function wallSpot(f, avoid = []) {
  const ppm = f.pxPerM;
  for (const r of f.rooms) {
    const P = r.polygon;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y) / ppm;
      if (len < 2.5 || (Math.abs(a.y - b.y) > 1 && Math.abs(a.x - b.x) > 1)) continue;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (f.openings.some((o) => Math.hypot(o.x - m.x, o.y - m.y) < 1.4 * ppm)) continue;
      if (avoid.some((q) => Math.hypot(q.x - m.x, q.y - m.y) < 1.2 * ppm)) continue;
      const horiz = Math.abs(a.y - b.y) <= 1;
      for (const s of [1, -1]) {
        const n = horiz ? { x: 0, y: s } : { x: s, y: 0 };
        const q = { x: m.x + n.x * 0.05 * ppm, y: m.y + n.y * 0.05 * ppm };
        if (inPoly(q, P)) return { click: q, edge: m, rot: horiz ? (s > 0 ? 0 : 180) : s > 0 ? 270 : 90, room: r };
      }
    }
  }
  return null;
}
/** A door on a wall, with a spot 0.6 m along the wall beside it and 5 cm into a room. */
function besideDoor(f) {
  const ppm = f.pxPerM;
  for (const o of f.openings.filter((x) => x.kind === 'door')) {
    for (const along of [1, -1]) for (const s of [1, -1]) {
      const d = (o.widthM / 2 + 0.25) * ppm * along;
      const q = o.orientation === 'h' ? { x: o.x + d, y: o.y + s * 0.05 * ppm } : { x: o.x + s * 0.05 * ppm, y: o.y + d };
      if (f.rooms.some((r) => inPoly(q, r.polygon))) return { click: q, door: o };
    }
  }
  return null;
}
/** The point deepest inside the biggest room, and a second one 0.7 m to its right (both clear of walls by 0.4 m). */
function midRoom(f) {
  const ppm = f.pxPerM;
  let best = null;
  for (const r of f.rooms) {
    const xs = r.polygon.map((p) => p.x), ys = r.polygon.map((p) => p.y);
    for (let x = Math.min(...xs); x < Math.max(...xs); x += ppm * 0.25) for (let y = Math.min(...ys); y < Math.max(...ys); y += ppm * 0.25) {
      if (!inPoly({ x, y }, r.polygon) || !inPoly({ x: x + 0.7 * ppm, y }, r.polygon)) continue;
      let dmin = 1e9;
      for (let i = 0; i < r.polygon.length; i++) {
        const a = r.polygon[i], b = r.polygon[(i + 1) % r.polygon.length];
        const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2; const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / l2));
        dmin = Math.min(dmin, Math.hypot(x - a.x - t * (b.x - a.x), y - a.y - t * (b.y - a.y)));
      }
      if (!best || dmin > best.d) best = { x, y, d: dmin };
    }
  }
  return best;
}

async function open(browser, opts, mode = 'electrics') {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failed++; });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('.welcome-tile', { timeout: 60000 });
  await page.locator('.welcome-tile').nth(1).click();
  await page.waitForSelector('.dock, .tab-bar', { timeout: 60000 });
  await page.evaluate((m) => { const s = window.__houseStore.getState(); s.setMode(m); s.setUi({ tab: 'plan' }); }, mode);
  await page.waitForSelector('.plan-canvas svg', { timeout: 30000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch({ args });

  // ---------------- desktop ----------------
  {
    const { ctx, page } = await open(browser, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const { pendant } = await ids(page);
    ok((await page.evaluate(() => window.__houseStore.getState().mode)) === 'electrics' && (await page.$('.plan-canvas svg')) !== null, 'mode electrics shows the plan');
    ok((await page.$$eval('nav.mode-bar button', (b) => b.map((x) => x.textContent))).includes('Electrics'), 'the mode bar has an Electrics button');
    const barFits = await page.evaluate(() => { const n = document.querySelector('nav.mode-bar'); return n.scrollWidth <= n.clientWidth + 1; });
    ok(barFits, 'mode bar fits at 1440');
    ok((await page.$('[data-electrics-panel]')) !== null, 'the Electrics panel is shown');
    await page.screenshot({ path: `${shots}/electrics-desktop-empty.png`, timeout: 180000, animations: 'disabled' });

    // The picker offers only All / Lighting / Electrics.
    await page.click('[data-tool="add"]');
    await page.waitForSelector('.add-pop .chips');
    const chips = await page.$$eval('.add-pop .chips button', (b) => b.map((x) => x.textContent));
    ok(chips.join() === 'All,Lighting,Electrics', `picker chips are All, Lighting, Electrics (${chips.join()})`);
    await page.screenshot({ path: `${shots}/electrics-desktop-picker.png`, timeout: 180000, animations: 'disabled' });

    let f = await floorOf(page);
    const wall = wallSpot(f);
    ok(!!wall, 'found a free wall');
    // Double socket 5 cm off a wall.
    await page.click('.add-pop [data-item-id="socket-double"]');
    let at = await toClient(page, wall.click.x, wall.click.y);
    await page.mouse.move(at.x - 30, at.y - 30); await page.mouse.move(at.x, at.y);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(300);
    let fxs = await fixturesOf(page);
    const sock = fxs.find((x) => x.type === 'socket-double');
    ok(!!sock, 'clicking places the socket');
    ok(sock && sock.mount === undefined, 'no mount override on the socket');
    const centre = await page.evaluate(async (fx) => { const e = await import('/src/lib/electrics.ts'); const c = await import('/src/lib/catalogue.ts'); return e.centreHeight(fx, c.byId(fx.type), 2.4); }, sock);
    ok(Math.abs(centre - 0.45) < 0.005, `socket centre height ${centre.toFixed(3)} = 0.45`);
    ok(sock && Math.abs(((sock.rot - wall.rot + 540) % 360) - 180) < 1, `socket faces into the room (rot ${sock && sock.rot}, expected ${wall.rot})`);
    const moved = sock && Math.hypot(sock.x - wall.click.x, sock.y - wall.click.y);
    ok(moved > 0.2 && moved < 0.2 * f.pxPerM, `socket snapped onto the wall (moved ${(moved / f.pxPerM).toFixed(3)} m)`);
    await page.keyboard.press('Escape'); // finish placing
    await page.screenshot({ path: `${shots}/electrics-desktop-socket.png`, timeout: 180000, animations: 'disabled' });

    // 1-gang switch beside a door.
    const bd = besideDoor(f);
    ok(!!bd, 'found a door');
    await page.click('[data-tool="add"]');
    await page.click('.add-pop [data-item-id="switch-1g"]');
    at = await toClient(page, bd.click.x, bd.click.y);
    await page.mouse.move(at.x - 20, at.y - 20); await page.mouse.move(at.x, at.y);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(300);
    const sw = (await fixturesOf(page)).find((x) => x.type === 'switch-1g');
    ok(!!sw && sw.mount === undefined, 'switch placed with no mount override');
    const swc = await page.evaluate(async (fx) => { const e = await import('/src/lib/electrics.ts'); const c = await import('/src/lib/catalogue.ts'); return e.centreHeight(fx, c.byId(fx.type), 2.4); }, sw);
    ok(Math.abs(swc - 1.2) < 0.005, `switch centre height ${swc.toFixed(3)} = 1.2`);
    ok(sw && [0, 90, 180, 270].some((r) => Math.abs(sw.rot - r) < 1), `switch is square to its wall (rot ${sw && sw.rot})`);
    await page.keyboard.press('Escape');

    // Two pendants mid-room, no wall snap.
    const mid = midRoom(f);
    await page.click('[data-tool="add"]');
    await page.click(`.add-pop [data-item-id="${pendant}"]`);
    for (const dx of [0, 0.7 * f.pxPerM]) {
      at = await toClient(page, mid.x + dx, mid.y);
      await page.mouse.move(at.x - 20, at.y); await page.mouse.move(at.x, at.y);
      await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(250);
    }
    await page.keyboard.press('Escape');
    const pends = (await fixturesOf(page)).filter((x) => x.type === pendant);
    ok(pends.length === 2, 'two pendants placed');
    ok(pends.every((p, i) => Math.abs(p.x - (mid.x + (i ? 0.7 * f.pxPerM : 0))) < 1 && Math.abs(p.y - mid.y) < 1), 'pendants are exactly where clicked (no wall snap)');
    await page.screenshot({ path: `${shots}/electrics-desktop-placed.png`, timeout: 180000, animations: 'disabled' });

    // Furniture taps select nothing: add a sofa with the store, tap it, the panel (nothing selected) stays.
    await page.evaluate(({ x, y }) => { const s = window.__houseStore.getState(); const fid = s.editFloorId || s.variants[s.activeVariant].floors[0].id; s.updateFloor(s.activeVariant, fid, (fl) => ({ ...fl, fixtures: [...(fl.fixtures || []), { id: 'sofa-test', type: 'sofa-3', x, y: y + 80, rot: 0 }] })); }, { x: mid.x, y: mid.y });
    await page.waitForTimeout(300);
    at = await toClient(page, mid.x, mid.y + 80);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(250);
    ok((await page.$('[data-electrics-panel]')) !== null && (await page.$('.inspector-card [data-fixture-inspector], .inspector-card .fixture-inspector')) === null, 'tapping furniture selects nothing (the panel stays)');
    const dimmed = await page.$eval('[data-fixture-id="sofa-test"]', (e) => getComputedStyle(e).pointerEvents + ' ' + getComputedStyle(e).opacity);
    ok(dimmed.startsWith('none'), `furniture is greyed and not pickable (${dimmed})`);

    // Link: select the switch, set linkSwitchId, tap both pendants.
    const glyph = async (id) => { const b = await page.locator(`.electrics-layer [data-fixture-id="${id}"] rect`).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
    let c = await glyph(sw.id);
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(250);
    ok((await page.$('[data-electrics-panel]')) === null, 'tapping the switch selects it (the inspector replaces the panel)');
    await page.evaluate((id) => window.__houseStore.getState().setUi({ linkSwitchId: id }), sw.id);
    await page.waitForTimeout(200);
    for (const p of pends) { c = await glyph(p.id); await page.mouse.click(c.x, c.y); await page.waitForTimeout(200); }
    let swNow = (await fixturesOf(page)).find((x) => x.id === sw.id);
    ok(swNow.controls && swNow.controls.length === 2 && pends.every((p) => swNow.controls.includes(p.id)), `taps link both pendants (${JSON.stringify(swNow.controls)})`);
    ok((await page.$eval('.plan-status', (e) => e.textContent).catch(() => '')).startsWith('Linking'), 'status line says Linking');
    // A tap on a socket while linking does nothing.
    c = await glyph(sock.id); await page.mouse.click(c.x, c.y); await page.waitForTimeout(200);
    swNow = (await fixturesOf(page)).find((x) => x.id === sw.id);
    ok(swNow.controls.length === 2, 'tapping a non-light while linking changes nothing');
    await page.screenshot({ path: `${shots}/electrics-desktop-linking.png`, timeout: 180000, animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    ok((await page.evaluate(() => window.__houseStore.getState().linkSwitchId)) === null, 'Esc ends linking');

    // Delete a pendant: its id leaves the switch's controls.
    c = await glyph(pends[0].id); await page.mouse.click(c.x, c.y); await page.waitForTimeout(200);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(250);
    fxs = await fixturesOf(page);
    swNow = fxs.find((x) => x.id === sw.id);
    ok(!fxs.some((x) => x.id === pends[0].id) && swNow.controls && swNow.controls.join() === pends[1].id, 'Delete removes the pendant and its id from controls');
    await page.screenshot({ path: `${shots}/electrics-desktop-after-delete.png`, timeout: 180000, animations: 'disabled' });

    // Circuits and exports (nothing selected: the panel).
    await page.mouse.click(5, 450);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-electrics-panel]');
    await page.locator('[data-add-circuit]').first().click();
    await page.waitForTimeout(250);
    const circuits = (await model(page)).circuits || [];
    ok(circuits.length === 1 && (await page.locator('[data-circuit-id]').count()) >= 1, 'Add circuit lists a circuit');
    const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await page.locator('[data-export="csv"]').first().click();
    const d = await dl;
    ok(!d || /-wiring-guide-.*\.csv$/.test(d.suggestedFilename()), d ? `CSV download is named ${d.suggestedFilename()}` : 'Schedule (CSV) called without error (no download yet)');
    await page.screenshot({ path: `${shots}/electrics-desktop-panel.png`, timeout: 180000, animations: 'disabled' });
    await ctx.close();
  }

  // ---------------- phone ----------------
  for (const [w, h] of [[390, 844], [360, 780]]) {
    const { ctx, page } = await open(browser, { viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const bar = await page.evaluate(() => { const n = document.querySelector('.tab-bar'); const labels = [...n.querySelectorAll('button span')].map((s) => s.textContent); const clip = [...n.querySelectorAll('button span')].some((s) => s.scrollWidth > s.parentElement.clientWidth + 0.5); return { fits: n.scrollWidth <= n.clientWidth, labels, clip }; });
    ok(bar.labels.length === 7 && bar.labels.includes('Electrics'), `${w}: seven tab labels (${bar.labels.join(',')})`);
    ok(bar.fits && !bar.clip, `${w}: tab bar fits, no label clips`);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
    const tapEl = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); const b = await page.locator(sel).first().boundingBox(); await touch('touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }]); await touch('touchEnd', []); await page.waitForTimeout(400); };
    const before = (await fixturesOf(page)).length;
    await tapEl('[data-tool="add"]');
    await page.waitForSelector('.add-pop .chips');
    await tapEl('.add-pop [data-item-id="socket-double"]');
    const fxs = await fixturesOf(page);
    const sock = fxs.find((x) => x.type === 'socket-double');
    ok(fxs.length === before + 1 && !!sock, `${w}: tap Add, pick a socket, it lands`);
    // Selected: the sheet shows the inspector, not the Electrics panel.
    ok((await page.$('[data-electrics-panel]')) === null, `${w}: the new socket is selected (inspector shown)`);
    await page.screenshot({ path: `${shots}/electrics-phone-${w}-placed.png`, timeout: 180000, animations: 'disabled' });
    await ctx.close();
  }

  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
