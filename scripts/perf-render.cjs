// Render performance of the 3D view in headless Chromium (SwiftShader), for comparing commits.
// Usage: npx vite --port 5253 & then PORT=5253 LABEL=head QUALITY=high EXTRA=1 LAMPS=3 node scripts/perf-render.cjs (LAMPS: fittings per room, pendants and spot bars)
// Adds a pendant to every room (and floor lamps; EXTRA=1 gives Proposed more, so the lamp pool resizes on a switch),
// wraps the renderer's render() with a GPU sync, then times layout switches, a sun move, a day and a night orbit, and
// the lights switching, printing per step the span, render ms, draw calls, triangles and the shader program count.
// Absolute times are SwiftShader's; compare runs against each other, and watch the program count and the slowest call.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const PORT = process.env.PORT, LABEL = process.env.LABEL, QUALITY = process.env.QUALITY || 'balanced';
const log = (...a) => console.log(LABEL, ...a);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 650 } })).newPage();
  page.on('pageerror', (e) => log('PAGEERROR', e.message));
  page.setDefaultTimeout(180000);
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.welcome-tile', { timeout: 120000 });
  await page.locator('.welcome-tile').nth(1).click();
  await page.waitForSelector('.dock', { timeout: 120000 });
  await page.waitForTimeout(8000);
  await page.evaluate(([q, x, n]) => { window.__perfQuality = q; window.__perfExtra = x; window.__perfLamps = n; }, [QUALITY, process.env.EXTRA === '1', Number(process.env.LAMPS || 1)]);
  // Lamps: a pendant in every room of both layouts, and a floor lamp in the first two rooms of each ground floor.
  await page.evaluate(() => {
    const s = window.__houseStore.getState();
    for (const k of ['current', 'proposed']) {
      const m = s.variants[k]; if (!m) continue;
      m.floors.forEach((f, fi) => {
        const add = [];
        f.rooms.forEach((r, ri) => {
          const pts = r.poly || r.points || r.polygon || []; if (!pts.length) return;
          const c = pts.reduce((a, p) => [a[0] + (p.x ?? p[0]), a[1] + (p.y ?? p[1])], [0, 0]).map((v) => v / pts.length);
          for (let n = 0; n < (window.__perfLamps || 1); n++) add.push({ id: `perf-pend-${k}-${f.id}-${r.id}-${n}`, type: n % 2 ? 'spot-bar' : 'pendant', x: c[0] + n * 25, y: c[1] - n * 15, rot: 0, on: true });
          if (fi === 0 && (ri < 2 || (window.__perfExtra && k === 'proposed'))) add.push({ id: `perf-floor-${k}-${f.id}-${r.id}`, type: 'floor-lamp', x: c[0] + 20, y: c[1] + 20, rot: 0, on: true });
        });
        s.updateFloor(k, f.id, (fl) => ({ ...fl, fixtures: [...(fl.fixtures || []), ...add] }));
      });
    }
    s.setSettings({ quality: window.__perfQuality });
    s.setSun({ enabled: true, dayOfYear: 172, hour: 15, lights: 'auto' });
  });
  await page.waitForTimeout(20000);
  // Instrument the renderer.
  await page.evaluate(() => {
    const gl = window.__houseRenderer; const orig = gl.render.bind(gl);
    window.__perf = { renders: [], all: [], last: performance.now(), step: 'load' };
    const ctx = gl.getContext(); gl.render = (sc, cam) => { const p0 = gl.info.programs.length; const t0 = performance.now(); orig(sc, cam); ctx.finish(); const t1 = performance.now(); const rec = { t: t1, dur: t1 - t0, calls: gl.info.render.calls, tris: gl.info.render.triangles, p: gl.info.programs.length - p0, step: window.__perf.step }; window.__perf.renders.push(rec); window.__perf.all.push(rec); window.__perf.last = t1; };
    window.__perfPrograms = () => gl.info.programs.length;
  });
  const settle = async (quietMs = 1500, max = 240000, minMs = 2500) => {
    const t0 = Date.now();
    await page.waitForTimeout(minMs);
    for (;;) { const q = await page.evaluate(() => performance.now() - window.__perf.last); if (q > quietMs) break; if (Date.now() - t0 > max) { log('settle timeout'); break; } await page.waitForTimeout(250); }
  };
  const take = async () => page.evaluate(() => { const r = window.__perf.renders; window.__perf.renders = []; return r; });
  const sum = (r) => ({ n: r.length, ms: Math.round(r.reduce((a, x) => a + x.dur, 0)), maxMs: Math.round(Math.max(0, ...r.map((x) => x.dur))), stallMs: Math.round(r.filter((x) => x.dur > 300).reduce((a, x) => a + x.dur, 0)), calls: r.length ? Math.round(r.reduce((a, x) => a + x.calls, 0) / r.length) : 0, tris: r.length ? Math.round(r.reduce((a, x) => a + x.tris, 0) / r.length) : 0 });
  const setStep = (name) => page.evaluate((n) => { window.__perf.step = n; }, name);
  const step = async (name, fn) => {
    await settle(1500); await take(); await setStep(name);
    const p0 = await page.evaluate(() => window.__perfPrograms());
    const t0 = Date.now(); await fn(); await settle(1500);
    const r = await take(); const p1 = await page.evaluate(() => window.__perfPrograms());
    const lastT = r.length ? Math.round(r[r.length - 1].t - r[0].t + r[0].dur) : 0; log(name, JSON.stringify({ spanMs: lastT, ...sum(r), programs: `${p0}->${p1}` }));
  };
  const view = (detail) => page.evaluate((d) => window.dispatchEvent(new CustomEvent('house:view', { detail: d })), detail);
  const ui = (patch) => page.evaluate((p) => window.__houseStore.getState().setUi(p), patch);
  const sun = (patch) => page.evaluate((p) => window.__houseStore.getState().setSun(p), patch);
  const views = ['home', 'front', 'rear', 'left', 'right'];
  const orbit = async (name) => {
    await settle(1500); await take(); await setStep(name);
    const durs = [];
    for (const side of views) { await view({ side }); await settle(1200); const r = await take(); durs.push(sum(r)); }
    const frames = durs.reduce((a, d) => a + d.n, 0), ms = durs.reduce((a, d) => a + d.ms, 0), maxMs = Math.max(...durs.map((d) => d.maxMs));
    log(name, JSON.stringify({ frames, msPerFrame: frames ? Math.round(ms / frames) : 0, maxMs, calls: Math.max(...durs.map((d) => d.calls)), tris: Math.max(...durs.map((d) => d.tris)) }));
  };
  // A pan: the home view, then the camera and its target slid sideways 0.8 m at a time (the lamp pool re-picks past 1 m).
  const pan = async (name) => {
    await view({ side: 'home' }); await settle(1500); await take(); await setStep(name);
    const base = await page.evaluate(() => { const c = window.__houseCamera; const p = c.camera.position, t = c.controls.target; return { p: [p.x, p.y, p.z], t: [t.x, t.y, t.z] }; });
    const durs = [];
    for (let i = 1; i <= 6; i++) {
      const dx = 0.8 * i;
      await view({ pose: { position: { x: base.p[0] + dx, y: base.p[1], z: base.p[2] }, target: { x: base.t[0] + dx, y: base.t[1], z: base.t[2] } } });
      await settle(1000, 60000, 1200); const r = await take(); durs.push(sum(r));
    }
    const frames = durs.reduce((a, d) => a + d.n, 0), ms = durs.reduce((a, d) => a + d.ms, 0), maxMs = Math.max(...durs.map((d) => d.maxMs));
    log(name, JSON.stringify({ frames, msPerFrame: frames ? Math.round(ms / frames) : 0, maxMs, calls: Math.max(...durs.map((d) => d.calls)), tris: Math.max(...durs.map((d) => d.tris)) }));
  };
  log('programs after load', await page.evaluate(() => window.__perfPrograms()));
  await step('switch->proposed (cold)', () => ui({ activeVariant: 'proposed' }));
  await step('switch->current (warm)', () => ui({ activeVariant: 'current' }));
  await step('switch->proposed (warm)', () => ui({ activeVariant: 'proposed' }));
  await step('sun 15->16h (shadow redraw)', () => sun({ hour: 16 }));
  await orbit('day views');
  await pan('day pan');
  await step('night + lights on', () => sun({ hour: 23.5, lights: 'on' }));
  log('lights', await page.evaluate(() => JSON.stringify((window.__houseLights && window.__houseLights()) || null)));
  await orbit('night views');
  await pan('night pan');
  await step('night: lights off', () => sun({ lights: 'off' }));
  await step('night: lights on', () => sun({ lights: 'on' }));
  await step('night switch->current', () => ui({ activeVariant: 'current' }));
  // The whole run: every render over 300 ms, tagged with its step and whether shader programs were created in it.
  await settle(1500);
  const all = await page.evaluate(() => window.__perf.all);
  const stalls = all.filter((r) => r.dur > 300).map((r) => ({ step: r.step, ms: Math.round(r.dur), newPrograms: r.p }));
  log('SUMMARY', JSON.stringify({ renders: all.length, totalMs: Math.round(all.reduce((a, r) => a + r.dur, 0)), stallMs: Math.round(stalls.reduce((a, r) => a + r.ms, 0)), programs: await page.evaluate(() => window.__perfPrograms()), stalls }));
  await browser.close();
})().catch((e) => { console.error(LABEL, 'FAILED', e.message); process.exit(1); });
