// Screenshots the walk-through of the BUILT-IN house on every viewport, checks each shot, and logs the tour's and stops' times.
// Usage: PORT=5201 OUT=/path/to/shots [QUALITY=balanced|high|low] [ONLY=1440x900,...] [SKIP_SHOTS=1] node scripts/shoot-walk.cjs  (against a running dev server)
// Writes <w>x<h>-<stop>-<lens>.png and index.html (a contact sheet) under OUT; never writes into the repo. Exit 1 if a check FAILs.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const PORT = process.env.PORT || 5313;
const OUT = process.env.OUT || '/tmp/shots-walk';
const QUALITY = process.env.QUALITY || 'balanced';
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const COARSE = [[390, 844], [844, 390], [820, 1180], [1180, 820], [320, 1100]];
const FINE = [[1440, 900], [1920, 1080], [2560, 1080], [600, 900], [1400, 480]];
const TIMED = new Set(['390x844', '844x390', '1440x900']); // tour times, as the lens rule differs
const LENS_ALSO = new Set(['1440x900', '844x390']);

// An exact copy of the lens rule: keep in step with src/lib/walkLens.ts.
// D = 99, then V floor 46, H ceiling 100, zoom 0.77 / 1 / 1.19, caps V 104 then H 104 (and a 58 degree floor across, see walkLens.ts).
const ZOOM = { narrow: 0.77, normal: 1, wide: 1.19 };
const lensJs = (w, h, choice = 'normal') => {
  const R = Math.PI / 180, G = 180 / Math.PI;
  const a = Math.max(0.05, w / Math.max(1, h)), t = Math.tan((99 * R) / 2), sq = Math.sqrt(1 + a * a);
  let tanH = (t * a) / sq, tanV = t / sq;
  if (2 * Math.atan(tanH) * G < 58) { tanH = Math.tan((58 * R) / 2); tanV = tanH / a; }
  if (2 * Math.atan(tanV) * G < 46) { tanV = Math.tan((46 * R) / 2); tanH = tanV * a; }
  if (2 * Math.atan(tanH) * G > 100) { tanH = Math.tan((100 * R) / 2); tanV = tanH / a; }
  tanH *= ZOOM[choice]; tanV *= ZOOM[choice];
  const cap = Math.tan((104 * R) / 2);
  if (tanV > cap) { tanV = cap; tanH = tanV * a; }
  if (tanH > cap) { tanH = cap; tanV = tanH / a; }
  return { h: 2 * Math.atan(tanH) * G, v: 2 * Math.atan(tanV) * G };
};

async function open(w, h, coarse) {
  const browser = await chromium.launch({ args });
  const ctxOpts = coarse ? { viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } };
  const page = await (await browser.newContext(ctxOpts)).newPage();
  page.setDefaultTimeout(180000);
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); failed++; });
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.welcome-tile', { timeout: 120000 });
  await page.locator('.welcome-tile').nth(0).click(); // "as listed", the built-in house
  await page.waitForSelector('.dock', { timeout: 120000 });
  await page.evaluate((q) => { const s = window.__houseStore.getState(); s.setSettings({ quality: q }); s.setUi({ tab: '3d' }); }, QUALITY);
  await page.waitForFunction(() => !document.querySelector('.viewer-loading'), null, { timeout: 180000 });
  if (coarse && !(await page.evaluate(() => matchMedia('(pointer: coarse)').matches))) { console.log('FAIL coarse pointer missing'); failed++; }
  await page.evaluate(() => window.__walkStore.getState().requestWalk({ kind: 'front' }));
  await page.waitForFunction(() => window.__walk && window.__walkExposure, null, { timeout: 120000 });
  await page.evaluate(() => window.__walkStore.getState().stopTour());
  return { browser, page };
}

// Mean and standard deviation of luminance (0..255) of the 3D canvas, from a screenshot saved to `path`.
async function shoot(page, path) {
  await page.waitForFunction(() => !document.querySelector('.viewer-loading'), null, { timeout: 180000 });
  await page.waitForTimeout(QUALITY === 'high' ? 4000 : 1200);
  const box = await page.evaluate(() => { const r = document.querySelector('.viewer canvas').getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
  const buf = await page.screenshot({ path, timeout: 180000 });
  const stats = await page.evaluate(async ([b64, box]) => {
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas'); c.width = Math.round(box.width); c.height = Math.round(box.height);
    const g = c.getContext('2d'); g.drawImage(img, box.x, box.y, box.width, box.height, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const v = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += v; s2 += v * v; }
    return { mean: s / n, sd: Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) };
  }, [buf.toString('base64'), box]);
  return { box, ...stats };
}

const roomsOf = (page) => page.evaluate(() => {
  const l = window.__walk.nav().levels.find((x) => x.level === 0);
  const hall = l.rooms.find((r) => r.name === "Hallway (front)") || [...l.rooms].sort((a, b) => b.area - a.area)[0];
  const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i].y > p.y) !== (poly[j].y > p.y) && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) c = !c; return c; };
  const edge = (p, poly) => { let m = 1e9; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[j], b = poly[i], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))); m = Math.min(m, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)); } return m; };
  // The most open spot inside the room (an L-shaped room's vertex mean can fall outside it).
  const cen = (poly) => { let best = null; const xs = poly.map((q) => q.x), ys = poly.map((q) => q.y); for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.1) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.1) { const p = { x, y }; if (!inside(p, poly)) continue; const d = edge(p, poly); if (!best || d > best.d) best = { x, y, d }; } return { x: best.x, y: best.y }; };
  const c = cen(hall.poly);
  // Longest free direction from the centre, by marching 16 headings until the polygon is left.
  let best = { yaw: 0, t: -1 };
  for (let a = 0; a < 16; a++) { const yaw = (a * Math.PI) / 8; let t = 0; while (t < 8 && inside({ x: c.x - Math.sin(yaw) * t, y: c.y - Math.cos(yaw) * t }, hall.poly)) t += 0.1; if (t > best.t) best = { yaw, t }; }
  return { c, yaw: best.yaw, baseY: l.baseY };
});

// Shoot the three stands with the current lens. Returns one record per shot.
async function stands(page, w, h, lens, R) {
  const rows = [];
  const record = async (stop) => {
    const sh = await shoot(page, `${OUT}/${w}x${h}-${stop}-${lens}.png`);
    const info = await page.evaluate(() => ({ fov: window.__houseCamera.camera.fov, vfov: window.__walk.state().lens.vfov, ev: window.__walkExposure.state().ev }));
    const rule = lensJs(sh.box.width, sh.box.height, lens);
    const vOk = Math.abs(info.fov - rule.v) <= 0.05 && Math.abs(info.fov - info.vfov) <= 0.05;
    const pass = sh.sd > 8 && vOk;
    if (!pass) failed++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${w}x${h} ${stop} ${lens}: ${rule.h.toFixed(0)} x ${rule.v.toFixed(0)} deg, EV ${info.ev.toFixed(2)}, sd ${sh.sd.toFixed(1)}${vOk ? '' : ` (fov ${info.fov.toFixed(2)} vs rule ${rule.v.toFixed(2)} / state ${info.vfov.toFixed(2)})`}`);
    rows.push({ w, h, stop, lens, file: `${w}x${h}-${stop}-${lens}.png`, pass });
  };
  // The empty hall, facing its longest free direction.
  await page.evaluate((R) => {
    const wk = window.__walkStore.getState(); wk.stopTour(); wk.setRoute(null);
    wk.setPose({ x: R.c.x, y: R.c.y, level: 0, stair: null, feetY: R.baseY, yaw: R.yaw, pitch: -0.14 });
  }, R);
  await page.evaluate(() => window.__walk.sim(3));
  await record('hall');
  // Play the tour from the hall; shoot each wanted room 3 s into its look-round.
  await page.evaluate(() => window.__walkStore.getState().playTour());
  const want = { kitchen: /^Kitchen$/, living: /^Living Room \(rear\)/ };
  const done = new Set();
  for (let guard = 0; guard < 160 * 30 && done.size < 2; guard++) {
    const hit = await page.evaluate((src) => {
      window.__walk.sim(1 / 30);
      const t = window.__walkStore.getState().tour;
      if (t.status === 'off') return 'end';
      if (t.phase !== 'looking') return null;
      const name = t.stops[t.index].name;
      for (const [k, re] of Object.entries(src)) if (new RegExp(re).test(name)) return k;
      return null;
    }, { kitchen: want.kitchen.source, living: want.living.source });
    if (hit === 'end') break;
    if (hit && !done.has(hit)) {
      done.add(hit);
      await page.evaluate(() => { window.__walk.sim(3); window.__walkStore.getState().pauseTour(); }); // paused, so the page is idle for the screenshot
      await record(hit);
      await page.evaluate(() => window.__walkStore.getState().playTour());
    }
  }
  if (done.size < 2) { console.log(`FAIL ${w}x${h} ${lens}: tour reached ${[...done].join(',') || 'neither'} of kitchen and living room`); failed++; }
  await page.evaluate(() => window.__walkStore.getState().stopTour());
  return rows;
}

// Tour length and per-stop times, in virtual time from the hall, Normal lens.
async function timings(page, R) {
  await page.evaluate(() => window.__houseStore.getState().setSettings({ walkLens: undefined }));
  return page.evaluate((R) => {
    const wk = window.__walkStore.getState(); wk.stopTour(); wk.setRoute(null);
    wk.setPose({ x: R.c.x, y: R.c.y, level: 0, stair: null, feetY: R.baseY, yaw: R.yaw, pitch: 0 });
    window.__walk.sim(0.5);
    wk.playTour();
    const per = new Map(); let total = 0, names = [];
    for (let i = 0; i < 300 * 30; i++) {
      window.__walk.sim(1 / 30); total += 1 / 30;
      const t = window.__walkStore.getState().tour;
      if (t.status === 'off') break;
      if (t.stops.length) names = t.stops.map((s) => s.name);
      const r = per.get(t.index) || { walk: 0, look: 0 }; r[t.phase === 'looking' ? 'look' : 'walk'] += 1 / 30; per.set(t.index, r);
    }
    return { total, stops: [...per.entries()].map(([i, r]) => ({ name: names[i] || String(i), ...r })) };
  }, R);
}

// Real-time frames per second while a look-round plays (SwiftShader, so only relative cost means anything).
async function fps(page, R) {
  await page.evaluate((R) => {
    const wk = window.__walkStore.getState(); wk.stopTour(); wk.setRoute(null);
    wk.setPose({ x: R.c.x, y: R.c.y, level: 0, stair: null, feetY: R.baseY, yaw: R.yaw, pitch: 0 });
    window.__walk.sim(0.5); wk.playTour();
    for (let i = 0; i < 40 * 30; i++) { window.__walk.sim(1 / 30); if (window.__walkStore.getState().tour.phase === 'looking') break; }
  }, R);
  const n = await page.evaluate(() => new Promise((res) => { let c = 0; const t0 = performance.now(); const f = () => { c++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(c); }; requestAnimationFrame(f); }));
  await page.evaluate(() => window.__walkStore.getState().stopTour());
  return n / 3;
}

(async () => {
  const fpsRows = [];
  const timing = [];
  for (const [coarse, list] of [[true, COARSE], [false, FINE]]) {
    for (const [w, h] of list) {
      if (process.env.ONLY && !process.env.ONLY.split(',').includes(`${w}x${h}`)) continue; // e.g. ONLY=1440x900,844x390
      const { browser, page } = await open(w, h, coarse);
      const R = await roomsOf(page);
      const key = `${w}x${h}`;
      const lenses = LENS_ALSO.has(key) ? ['normal', 'narrow', 'wide'] : ['normal'];
      for (const lens of process.env.SKIP_SHOTS ? [] : lenses) {
        await page.evaluate((l) => window.__houseStore.getState().setSettings({ walkLens: l === 'normal' ? undefined : l }), lens);
        await page.evaluate(() => window.__walk.sim(1 / 30));
        await stands(page, w, h, lens, R);
      }
      if (TIMED.has(key)) timing.push([key, await timings(page, R)]);
      if (coarse && (key === '390x844' || key === '1180x820')) fpsRows.push([key, await fps(page, R)]);
      await browser.close();
    }
  }
  for (const [key, t] of timing) {
    console.log(`\nTour at ${key} (sim seconds)\nstop\twalk\tlook`);
    for (const s of t.stops) console.log(`${s.name}\t${s.walk.toFixed(1)}\t${s.look.toFixed(1)}`);
    console.log(`TOTAL ${key}\t${t.total.toFixed(1)} s`);
  }
  for (const [k, f] of fpsRows) console.log(`INFO fps ${k} during a look-round: ${f.toFixed(1)}`);
  // Contact sheet: one row per viewport, the Normal shots side by side. Built from every shot in OUT, so a partial rerun (ONLY=) keeps the rest.
  const order = [...COARSE, ...FINE].map(([w, h]) => `${w}x${h}`);
  const stopOrder = ['hall', 'kitchen', 'living'];
  const files = fs.readdirSync(OUT).map((f) => /^(\d+x\d+)-(hall|kitchen|living)-(normal|narrow|wide)\.png$/.exec(f)).filter(Boolean)
    .map((m) => ({ file: m[0], v: m[1], stop: m[2], lens: m[3] }))
    .sort((a, b) => order.indexOf(a.v) - order.indexOf(b.v) || stopOrder.indexOf(a.stop) - stopOrder.indexOf(b.stop));
  const viewports = order.filter((v) => files.some((r) => r.v === v));
  const cell = (r) => `<figure><a href="${r.file}"><img src="${r.file}" loading="lazy"></a><figcaption>${r.stop} ${r.lens}</figcaption></figure>`;
  const rowsHtml = viewports.map((v) => `<h2>${v}</h2><div class="row">${files.filter((r) => r.v === v && r.lens === 'normal').map(cell).join('')}</div>${files.some((r) => r.v === v && r.lens !== 'normal') ? `<div class="row">${files.filter((r) => r.v === v && r.lens !== 'normal').map(cell).join('')}</div>` : ''}`).join('');
  fs.writeFileSync(`${OUT}/index.html`, `<!doctype html><meta charset="utf-8"><title>Walk shots</title><style>body{font:14px system-ui;margin:16px;background:#222;color:#eee}.row{display:flex;gap:8px;align-items:flex-start;margin-bottom:8px}figure{margin:0}img{max-height:340px;max-width:32vw}</style><h1>Walk shots (${QUALITY})</h1>${rowsHtml}`);
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
