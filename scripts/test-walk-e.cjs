// Walk eyes-adjust acceptance: the CPU meter, the eased exposure and where it is applied (ExposureEffect on high,
// toneMappingExposure on balanced and low), the frame budget, and the eye menu row.
// Usage: PORT=5191 SHOTS=<dir> node scripts/test-walk-e.cjs (against a running dev server). Every check must PASS.
// Uses the built-in house only (Welcome tile 0).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const PORT = process.env.PORT || 5313;
const SHOTS = process.env.SHOTS || '/tmp/shots-walk-e';
fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function open(quality, ctxOpts = { viewport: { width: 1440, height: 900 } }) {
  const browser = await chromium.launch({ args });
  const page = await (await browser.newContext(ctxOpts)).newPage();
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); failed++; });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.welcome-tile', { timeout: 120000 });
  await page.locator('.welcome-tile').nth(0).click();
  await page.waitForSelector('.dock', { timeout: 120000 });
  await page.evaluate((q) => { const s = window.__houseStore.getState(); s.setSettings({ quality: q }); s.setUi({ tab: '3d' }); }, quality);
  await page.waitForFunction(() => !document.querySelector('.viewer-loading'), null, { timeout: 180000 });
  return { browser, page };
}
// Mean luminance (0..255) of the 3D canvas, from a screenshot decoded in the page.
async function lum(page) {
  const box = await page.evaluate(() => { const r = document.querySelector('.viewer canvas').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  const buf = await page.screenshot({ clip: box, timeout: 180000 });
  return page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return s / (d.length / 4);
  }, buf.toString('base64'));
}
const settle = (page, q) => page.waitForTimeout(q === 'high' ? 4000 : 1000);
const sim = (page, s) => page.evaluate((s) => window.__walk.sim(s), s);
const rooms = (page) => page.evaluate(() => {
  const n = window.__walk.nav(), l = n.levels.find((x) => x.level === 0);
  const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i].y > p.y) !== (poly[j].y > p.y) && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) c = !c; return c; };
  const edge = (p, poly) => { let m = 1e9; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[j], b = poly[i], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); m = Math.min(m, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)); } return m; };
  // The most open spot inside the room (an L-shaped room's vertex mean can fall outside it).
  const cen = (poly) => { let best = null; const xs = poly.map((q) => q.x), ys = poly.map((q) => q.y); for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.1) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.1) { const p = { x, y }; if (!inside(p, poly)) continue; const d = edge(p, poly); if (!best || d > best.d) best = { x, y, d }; } return { x: best.x, y: best.y }; };
  const by = (re) => { const r = l.rooms.find((x) => re.test(x.name)); return r && { id: r.id, name: r.name, c: cen(r.poly) }; };
  return { hall: by(/^Hallway \(stairs\)$/), sunny: by(/^Living Room \(rear\)$/), baseY: l.baseY };
});
// Stand in the (windowless) hall facing the sunny room.
const standHall = (page, R) => page.evaluate((R) => {
  const w = window.__walkStore.getState();
  const dx = R.sunny.c.x - R.hall.c.x, dy = R.sunny.c.y - R.hall.c.y;
  w.setRoute(null); w.stopTour();
  for (const d of window.__walk.nav().doors) w.setDoor(d.key, true); // open, so the routes below are not stopped at a door
  w.setPose({ x: R.hall.c.x, y: R.hall.c.y, level: 0, stair: null, feetY: R.baseY, yaw: Math.atan2(-dx, -dy), pitch: -0.14 });
}, R);
const exp = (page) => page.evaluate(() => window.__walkExposure.state());

async function suite(quality) {
  console.log(`--- ${quality} ---`);
  const { browser, page } = await open(quality);
  // Orbit before the walk, for the "back to 1" check.
  await page.evaluate(() => window.__houseStore.getState().setSun({ enabled: true, dayOfYear: 172, hour: 13 }));
  await page.waitForFunction(() => !document.querySelector('.viewer-loading'));
  await settle(page, quality);
  const lumBefore = await lum(page);
  const progBefore = await page.evaluate(() => window.__houseRenderer.info.programs.length);

  await page.evaluate(() => window.__walkStore.getState().requestWalk({ kind: 'front' }));
  await page.waitForFunction(() => window.__walk && window.__walkExposure, null, { timeout: 120000 });
  await page.evaluate(() => window.__walkStore.getState().stopTour());
  const R = await rooms(page);
  ok(!!R.hall && !!R.sunny, `found the hall (${R.hall && R.hall.name}) and the sunny room (${R.sunny && R.sunny.name})`);
  await page.evaluate(() => window.__houseStore.getState().setSettings({ walkAdapt: 'natural', walkLens: undefined }));

  // 1. Hall at midsummer noon.
  await standHall(page, R);
  await sim(page, 3);
  let s = await exp(page);
  const hallEV = s.ev;
  console.log(`INFO hall: ev ${s.ev.toFixed(2)} target ${s.target.toFixed(2)} L ${s.L.toFixed(3)} glazing ${s.glazing.toFixed(3)} mode ${s.mode}`);
  ok(s.ev >= 0 && s.ev <= 1.0, `hall at noon meters dim: EV ${s.ev.toFixed(2)} in [0, 1]`);
  await settle(page, quality);
  await page.screenshot({ path: `${SHOTS}/e-${quality}-hall.png` });
  // 7. No new programs on walk entry (high compiles the effect from the start); taken before the sun moves, which lights lamps.
  const progAfter = await page.evaluate(() => window.__houseRenderer.info.programs.length);
  console.log(`INFO programs before ${progBefore}, in the walk ${progAfter}`);
  if (quality === 'high') ok(progAfter === progBefore, `walk entry adds no programs on high (${progBefore} -> ${progAfter})`);

  // 2. Forced exposure changes the picture.
  await page.evaluate(() => window.__walkExposure.force(1)); await sim(page, 1 / 30); await settle(page, quality);
  const l1 = await lum(page);
  await page.evaluate(() => window.__walkExposure.force(0)); await sim(page, 1 / 30); await settle(page, quality);
  const l0 = await lum(page);
  await page.evaluate(() => window.__walkExposure.force(null));
  ok(l1 > l0 * 1.3, `force(1) is more than 30% brighter than force(0): ${l1.toFixed(1)} vs ${l0.toFixed(1)}`);

  // 6. After Stop everything is back to 1, and the orbit picture is as before (done before the night step, whose lamp shaders slow SwiftShader).
  await page.evaluate(() => window.__walkExposure.force(1)); await sim(page, 1 / 30);
  await page.evaluate(() => window.__walkStore.getState().stopWalk());
  await page.waitForFunction(() => !window.__walk, null, { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('.viewer-loading'));
  await settle(page, quality);
  const glAfter = await page.evaluate(() => window.__walkExposure.glExposure());
  const uni = await page.evaluate(() => window.__exposureEffect ? window.__exposureEffect.uniforms.get('exposure').value : 1);
  ok(glAfter === 1 && uni === 1, `after Stop toneMappingExposure ${glAfter} and effect uniform ${uni} are 1`);
  const lumAfter = await lum(page);
  ok(Math.abs(lumAfter - lumBefore) <= 1, `orbit picture unchanged by a walk (${lumBefore.toFixed(2)} -> ${lumAfter.toFixed(2)})`);
  // Back into the walk for the rest.
  await page.evaluate(() => window.__walkStore.getState().requestWalk({ kind: 'front' }));
  await page.waitForFunction(() => window.__walk, null, { timeout: 120000 });
  await page.evaluate(() => { window.__walkStore.getState().stopTour(); window.__walkExposure.force(null); });

  // 3. Dim hall to the sunny room by a mini-map goal (this house's windowless stairs hall to the patio-doored living room).
  await standHall(page, R);
  await sim(page, 3);
  const evHall = (await exp(page)).ev;
  await page.evaluate((id) => window.__walkStore.getState().requestGoal({ kind: 'room', level: 0, roomId: id }), R.sunny.id);
  const trace = await page.evaluate(() => {
    const ev = [];
    for (let i = 0; i < 30 * 40; i++) { window.__walk.sim(1 / 30); ev.push(window.__walk.state().exposure); if (!window.__walkStore.getState().route && i > 5) break; }
    return ev;
  });
  const lo = Math.min(...trace), hi = Math.max(...trace);
  await sim(page, 4);
  s = await exp(page);
  console.log(`INFO hall ${evHall.toFixed(2)} -> sunny room ${s.ev.toFixed(2)} (trace ${hi.toFixed(2)}..${lo.toFixed(2)}, ${trace.length} frames) glazing ${s.glazing.toFixed(3)}`);
  ok(hi - lo > 0.05 && s.ev < evHall, `the exposure moves on the way and ends lower in the sunny room (${evHall.toFixed(2)} -> ${s.ev.toFixed(2)})`);
  const busy = await page.evaluate(() => window.__walk.state().busy);
  ok(!busy.includes('exposure'), `exposure is not busy after settling (busy: ${busy.join(',') || 'none'})`);
  const inv0 = await page.evaluate(() => window.__walk.invalidates);
  await sim(page, 2);
  ok((await page.evaluate(() => window.__walk.invalidates)) === inv0, 'no frames requested once settled');

  // 4. Snap at night.
  await page.evaluate(() => window.__houseStore.getState().setSun({ hour: 23 }));
  await page.waitForTimeout(500);
  await sim(page, 1 / 30);
  s = await exp(page);
  ok(Math.abs(s.ev - s.target) < 1e-9, `a change of time of day snaps (ev ${s.ev.toFixed(2)} = target ${s.target.toFixed(2)})`);
  await page.evaluate(() => window.__houseStore.getState().setSun({ hour: 13 }));
  await page.waitForTimeout(300);

  // 5. Off.
  await page.evaluate(() => window.__houseStore.getState().setSettings({ walkAdapt: 'off' }));
  await sim(page, 1 / 30);
  s = await exp(page);
  ok(s.ev === 0 && s.factor === 1 && s.gl === 1, `Off: ev 0 and factor 1 (ev ${s.ev}, factor ${s.factor}, gl ${s.gl})`);
  await page.evaluate(() => window.__houseStore.getState().setSettings({ walkAdapt: 'natural' }));

  // 9. The eye menu row.
  await page.click('.walk-eye .popover-btn');
  const ad = await page.$eval('.walk-eye-adapt', (e) => ({ ready: e.getAttribute('data-ready'), disabled: [...e.querySelectorAll('button')].map((b) => b.disabled) }));
  ok(ad.ready === 'true' && ad.disabled.every((d) => !d), 'Eyes adjust row is ready and enabled');
  await page.locator('.walk-adapt button', { hasText: 'Strong' }).click();
  ok((await page.evaluate(() => window.__houseStore.getState().settings.walkAdapt)) === 'strong', 'clicking Strong saves walkAdapt strong');
  await page.locator('.walk-adapt button', { hasText: 'Natural' }).click();
  await page.click('.walk-eye .popover-btn');

  await browser.close();
}

async function phone() {
  console.log('--- phone portrait ---');
  const { browser, page } = await open('balanced', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  ok(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'phone context has a coarse pointer');
  await page.evaluate(() => window.__houseStore.getState().setSun({ enabled: true, dayOfYear: 172, hour: 13 }));
  await page.evaluate(() => window.__walkStore.getState().requestWalk({ kind: 'front' }));
  await page.waitForFunction(() => window.__walk && window.__walkExposure, null, { timeout: 120000 });
  await page.evaluate(() => window.__walkStore.getState().stopTour());
  const R = await rooms(page);
  await page.evaluate(() => window.__houseStore.getState().setSettings({ walkAdapt: 'strong' }));
  await standHall(page, R);
  await sim(page, 3);
  await page.evaluate((id) => window.__walkStore.getState().requestGoal({ kind: 'room', level: 0, roomId: id }), R.sunny.id);
  const trace = await page.evaluate(() => {
    const ev = [];
    for (let i = 0; i < 30 * 40; i++) { window.__walk.sim(1 / 30); ev.push(window.__walk.state().exposure); if (!window.__walkStore.getState().route && i > 5) break; }
    return ev;
  });
  const lo = Math.min(...trace), hi = Math.max(...trace);
  ok(lo >= -1.0 - 1e-9 && hi <= 0.7 + 1e-9, `phone portrait EV stays in [-1.0, 0.7] (${lo.toFixed(2)}..${hi.toFixed(2)})`);
  await browser.close();
}

(async () => {
  const only = process.env.ONLY;
  if (!only || only === 'balanced') await suite('balanced');
  if (!only || only === 'high') await suite('high');
  if (!only || only === 'phone') await phone();
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
