// Walk-through acceptance: the first-person walk controller with the walk logic and the door leaves.
// Usage: PORT=5191 node scripts/test-walk-c.cjs (against a running dev server). Every check must PASS.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const PORT = process.env.PORT || 5313;
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user-house-modeler/fb69ded0-7598-55a9-80ca-486cb25f050d/scratchpad/shots-c';
fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
// Once tagged with the chunk each check needed; every chunk is merged now, so they are plain checks.
const needs = (_tag, c, m) => ok(c, m);
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

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
const toScreen = (page, x, y, z) => page.evaluate(([x, y, z]) => {
  const cam = window.__houseCamera.camera; cam.updateMatrixWorld(); const v = cam.position.clone().set(x, y, z).project(cam);
  const r = document.querySelector('.viewer canvas').getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, z: v.z };
}, [x, y, z]);
const st = (page) => page.evaluate(() => ({ w: window.__walkStore.getState(), cam: window.__houseCamera.camera.position.toArray(), m: window.__houseStore.getState() }));
const poly = (r) => r.poly;
const REST_PITCH = (-8 * Math.PI) / 180;
// An exact copy of the lens rule and the rest pitch: keep in step with src/lib/walkLens.ts. Returns degrees { h, v }.
const LENS_ZOOM = { narrow: 0.77, normal: 1, wide: 1.19 };
const walkLensJs = (w, h, choice = 'normal') => {
  const R = Math.PI / 180, Dg = 180 / Math.PI;
  const a = Math.max(0.05, w / Math.max(1, h)), t = Math.tan((99 * R) / 2), sq = Math.sqrt(1 + a * a);
  let tanH = (t * a) / sq, tanV = t / sq;
  if (2 * Math.atan(tanV) * Dg < 46) { tanV = Math.tan((46 * R) / 2); tanH = tanV * a; }
  if (2 * Math.atan(tanH) * Dg > 100) { tanH = Math.tan((100 * R) / 2); tanV = tanH / a; }
  tanH *= LENS_ZOOM[choice]; tanV *= LENS_ZOOM[choice];
  const cap = Math.tan((104 * R) / 2);
  if (tanV > cap) { tanV = cap; tanH = tanV * a; }
  if (tanH > cap) { tanH = cap; tanV = tanH / a; }
  return { h: 2 * Math.atan(tanH) * Dg, v: 2 * Math.atan(tanV) * Dg };
};
const restPitchJs = (vDeg) => ((vDeg >= 55 ? -8 : Math.max(-12, -8 - (55 - vDeg) / 3)) * Math.PI) / 180;
const canvasSize = (page) => page.evaluate(() => { const r = document.querySelector('.viewer canvas').getBoundingClientRect(); return { w: r.width, h: r.height }; });
const camFov = (page) => page.evaluate(() => window.__houseCamera.camera.fov);
// Tour length on commit 0373f84 (the sweep look-round), in sim seconds, from the same loop as below; the new tour must stay within 10% of it.
const TOUR_BASE_S = 144.73;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Per-frame feel of a pose series sampled at 30 fps: biggest yaw step (rad), biggest change of yaw step, biggest speed change (m/s).
const feel = (ps) => {
  let yawStep = 0, rateChange = 0, speedChange = 0, prevRate = 0, prevSp = 0, at = 0;
  for (let i = 1; i < ps.length; i++) {
    const r = wrap(ps[i].yaw - ps[i - 1].yaw), sp = Math.hypot(ps[i].x - ps[i - 1].x, ps[i].y - ps[i - 1].y) * 30;
    yawStep = Math.max(yawStep, Math.abs(r));
    if (i > 1) { // the first diff has no predecessor to compare with
      rateChange = Math.max(rateChange, Math.abs(r - prevRate));
      if (Math.abs(sp - prevSp) > speedChange) { speedChange = Math.abs(sp - prevSp); at = i; }
    }
    prevRate = r; prevSp = sp;
  }
  return { yawStep, rateChange, speedChange, at };
};
const fmt = (f) => `yaw step ${f.yawStep.toFixed(3)} rad, yaw-rate change ${f.rateChange.toFixed(3)} rad/frame, speed change ${(f.speedChange).toFixed(3)} m/s/frame (frame ${f.at})`;
const feelOk = (f) => f.yawStep <= 0.08 && f.rateChange <= 0.03 && f.speedChange <= 0.06;

// Play the tour in virtual time from the first room's middle, recording state() after every frame; stops after `maxFrames` or when `until(row, i)` is true.
const runTour = (page, opts = {}) => page.evaluate((opts) => {
  const nav = window.__walk.nav(), w = window.__walkStore.getState();
  const l = nav.levels.find((x) => x.level === 0), r = l.rooms[0];
  const c = r.poly.reduce((a, p) => ({ x: a.x + p.x / r.poly.length, y: a.y + p.y / r.poly.length }), { x: 0, y: 0 });
  w.stopTour(); w.setRoute(null);
  w.setPose({ x: c.x, y: c.y, level: 0, stair: null, feetY: l.baseY, yaw: 0, pitch: 0 });
  w.playTour();
  const rows = []; let stops = 0, ended = false;
  for (let i = 0; i < (opts.maxFrames || 36 * 150) && !ended; i++) {
    window.__walk.sim(1 / 30);
    const st = window.__walk.state(), t = window.__walkStore.getState().tour;
    if (t.stops.length) stops = t.stops.length;
    rows.push({ yaw: st.yaw, pitch: st.pitch, ph: st.tour.phase, i: st.tour.index, busy: st.busy, lt: st.look ? st.look.t : null, lp: st.look ? st.look.total : null, cap: st.look ? st.look.yawCap : null });
    ended = t.status === 'off' && stops > 0;
    if (opts.stopAfterLooks && rows.filter((q) => q.lt !== null).length && !st.look && rows.filter((q) => q.lt !== null).length > 30 && rows[rows.length - 2].lt !== null) break;
  }
  return { rows, stops, ended, frames: rows.length };
}, opts);
const degWrap = (a) => (wrap(a) * 180) / Math.PI;
// A hold is a stretch still (under 3 deg/s) for at least 0.5 s: the exit hold is fixed at 0.5 s (plus the tail of the move into it), and a room with one target
// besides an exit behind you has no time for more (three 60 deg moves of the turn round eat the stop's length).
const HOLD_FRAMES = 15;
// Per-stop look-round facts from runTour rows: peak turn rate (deg/s), holds (still >= 0.6 s), the pitch at the end, and whether "look" was busy throughout.
function lookFacts(rows) {
  const byStop = new Map();
  rows.forEach((q, k) => { if (q.ph === 'looking' && q.lt !== null) { if (!byStop.has(q.i)) byStop.set(q.i, []); byStop.get(q.i).push(k); } });
  return [...byStop.entries()].map(([i, ks]) => {
    let peak = 0, holds = 0, run = 0, lookBusy = true;
    for (let a = 1; a < ks.length; a++) {
      const rate = Math.abs(degWrap(rows[ks[a]].yaw - rows[ks[a - 1]].yaw)) * 30;
      if (rows[ks[a]].lt >= 0) peak = Math.max(peak, rate);
      if (rows[ks[a]].lt >= 0 && rate < 3) { run++; if (run === HOLD_FRAMES) holds++; } else run = 0;
      if (rows[ks[a]].lt > 0.1 && rows[ks[a]].lt < rows[ks[a]].lp - 0.2 && !rows[ks[a]].busy.includes('look')) lookBusy = false;
    }
    const first = ks[0], last = ks[ks.length - 1];
    const jump = first > 0 ? Math.abs(degWrap(rows[first].yaw - rows[first - 1].yaw)) : 0;
    return { i, peak, holds, jump, endPitch: rows[last].pitch, frames: ks.length, lookBusy };
  });
}
const centroid = (p) => ({ x: p.reduce((a, q) => a + q.x, 0) / p.length, y: p.reduce((a, q) => a + q.y, 0) / p.length });
// Largest ground-floor room of the nav.
const bigRoom = (page, level = 0) => page.evaluate((level) => {
  const l = window.__walk.nav().levels.find((x) => x.level === level);
  const r = [...l.rooms].sort((a, b) => b.area - a.area)[0];
  return { id: r.id, name: r.name, poly: r.poly, baseY: l.baseY, floorId: l.floorId };
}, level);
// Stand in a room looking at the floor ahead; returns the screen point of a floor spot `d` metres in front.
async function standLooking(page, room, d = 1.4) {
  const c = centroid(room.poly);
  await page.evaluate(([c, room]) => {
    const w = window.__walkStore.getState();
    w.setPose({ x: c.x, y: c.y, level: 0, stair: null, feetY: room.baseY, yaw: 0, pitch: -0.5 });
  }, [c, room]);
  await page.evaluate(() => window.__walk.sim(0.1));
  const yaw = 0;
  const target = { x: c.x - Math.sin(yaw) * d, y: c.y - Math.cos(yaw) * d };
  const p = await toScreen(page, target.x, room.baseY, target.y);
  return { p, target, c };
}

(async () => {
  // ================= desktop, as listed =================
  let { browser, page } = await open(0);
  const orbit = await page.evaluate(() => window.__houseCamera.camera.position.toArray());
  const orbitFov = await page.evaluate(() => window.__houseCamera.camera.fov);
  await page.evaluate(() => window.__walkStore.getState().requestWalk({ kind: 'front' }));
  await page.waitForFunction(() => window.__walkStore.getState().pose && window.__walk);
  let s = await st(page);
  ok(Math.abs(s.cam[1] - (s.w.pose.feetY + 1.7)) < 0.05 && s.m.showCeilings && s.m.viewMode === 'single', 'eye at 1.7 m, ceilings on, single view');
  const lens = await page.evaluate(() => { const c = window.__houseCamera.camera; return { fov: c.fov, near: c.near, order: c.rotation.order, ctl: window.__houseCamera.controls }; });
  const cv = await canvasSize(page);
  const want = walkLensJs(cv.w, cv.h);
  ok(Math.abs(lens.fov - want.v) < 0.05 && lens.near === 0.05 && lens.order === 'YXZ' && lens.ctl === null, `lens: fov ${lens.fov.toFixed(2)} (rule for ${cv.w.toFixed(0)}x${cv.h.toFixed(0)} = ${want.v.toFixed(2)} V, ${want.h.toFixed(1)} H), near ${lens.near}, order ${lens.order}, controls off`);
  // The Lens setting: legacy 75 reads as Narrow, 'wide' is Wide, nothing is Normal.
  await page.evaluate(() => window.__houseStore.getState().setSettings({ walkLens: 75 }));
  await page.waitForTimeout(300);
  const narrow = await camFov(page);
  await page.evaluate(() => window.__houseStore.getState().setSettings({ walkLens: 'wide' }));
  await page.waitForTimeout(300);
  const wide = await camFov(page);
  await page.evaluate(() => window.__houseStore.getState().setSettings({ walkLens: undefined }));
  await page.waitForTimeout(300);
  const normalAgain = await camFov(page);
  ok(Math.abs(narrow - walkLensJs(cv.w, cv.h, 'narrow').v) < 0.05 && Math.abs(wide - walkLensJs(cv.w, cv.h, 'wide').v) < 0.05 && Math.abs(normalAgain - want.v) < 0.05, `Lens setting: Narrow ${narrow.toFixed(1)}, Wide ${wide.toFixed(1)}, back to Normal ${normalAgain.toFixed(1)}`);
  const restWant = restPitchJs(want.v);
  ok(Math.abs(s.w.pose.pitch - restWant) < 0.01, `placed looking slightly down: pitch ${s.w.pose.pitch.toFixed(3)} rad (restPitch(${want.v.toFixed(1)}) ${restWant.toFixed(3)})`);
  ok(/Click the floor to walk/.test(s.w.hint?.text || ''), `first-time hint on desktop ("${s.w.hint?.text}")`);
  ok(s.w.where && s.w.where.outside === true && !s.w.where.roomName, 'standing outside in the garden at the start');
  const start = s.w.pose;
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/walk-front.png` });

  // Keys: W walks forward, A/D strafe, arrows turn, digits are swallowed.
  const before = s.w.pose;
  const polesW = await page.evaluate(() => { const fire = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyW', key: 'w', bubbles: true, cancelable: true })); fire('keydown'); const r = window.__walk.sim(1); fire('keyup'); return r; });
  s = await st(page);
  ok(polesW.length === 30 && Math.hypot(s.w.pose.x - before.x, s.w.pose.y - before.y) > 0.8, `W walks about 1.4 m in a second (${Math.hypot(s.w.pose.x - before.x, s.w.pose.y - before.y).toFixed(2)} m)`);
  const fwd = { x: -Math.sin(before.yaw), y: -Math.cos(before.yaw) }, mx = s.w.pose.x - before.x, my = s.w.pose.y - before.y;
  ok(mx * fwd.x + my * fwd.y > 0.9 * Math.hypot(mx, my), 'W walks the way you face');
  const yawL = s.w.pose.yaw;
  await page.keyboard.down('ArrowLeft'); await page.evaluate(() => window.__walk.sim(1)); await page.keyboard.up('ArrowLeft'); await page.evaluate(() => window.__walk.sim(1));
  s = await st(page);
  const turned = Math.atan2(Math.sin(s.w.pose.yaw - yawL), Math.cos(s.w.pose.yaw - yawL));
  ok(turned > 1.2, `left arrow turns left (${turned.toFixed(2)} rad in a second)`);
  await page.evaluate(() => { const w = window.__walkStore.getState(); w.setPose({ ...w.pose, yaw: 0 }); });
  const fl = s.m.editFloorId;
  await page.keyboard.press('1'); await page.keyboard.press('m');
  s = await st(page);
  ok(s.m.editFloorId === fl && s.m.maxLevel === null && s.w.on, 'digits and M are swallowed while walking');
  await page.keyboard.up('w');
  // Mouse drag looks round: dragging right turns left, down looks up.
  const box = await page.locator('.viewer canvas').boundingBox();
  const y0 = s.w.pose.yaw, p0 = s.w.pose.pitch;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 6 }); await page.mouse.up();
  s = await st(page);
  ok(s.w.pose.yaw - y0 > 0.1 && s.w.pose.pitch - p0 > 0.05, `drag right turns left, drag down looks up (yaw +${(s.w.pose.yaw - y0).toFixed(2)}, pitch +${(s.w.pose.pitch - p0).toFixed(2)})`);
  const camQ = await page.evaluate(() => window.__houseCamera.camera.rotation.y);
  ok(Math.abs(camQ - s.w.pose.yaw) < 0.4, 'camera follows the pose');

  // Front door: shut, stops you outside.
  await page.evaluate(() => { const w = window.__walkStore.getState(); w.setPose({ ...w.pose, yaw: 0, pitch: 0 }); });
  const front = await page.evaluate(() => window.__walk.nav().doors.find((d) => d.kind === 'front') || null);
  needs('B', !!front, 'nav has a front door');
  if (front) {
    // Back at the start, outside and facing the door.
    await page.evaluate((p) => window.__walkStore.getState().setPose(p), start);
    await page.keyboard.down('w'); await page.evaluate(() => window.__walk.sim(5)); await page.keyboard.up('w');
    s = await st(page);
    needs('B', Math.hypot(s.w.pose.x - front.centre.x, s.w.pose.y - front.centre.y) > 0.2 && !s.w.where?.roomName, 'shut front door stops you outside');
    // Step back to the start to see the door whole, then tap its leaf.
    await page.evaluate((p) => window.__walkStore.getState().setPose(p), start);
    await page.evaluate(() => window.__walk.sim(0.2));
    const p = await toScreen(page, front.centre.x, start.feetY + 1.0, front.centre.y);
    await page.mouse.click(p.x, p.y);
    const opened = await page.waitForFunction((k) => window.__walkStore.getState().doors[k] === true, front.key, { timeout: 4000 }).then(() => true, () => false);
    needs('A', opened, 'tapping the front door leaf opens it');
    if (!opened) await page.evaluate((k) => window.__walkStore.getState().setDoor(k, true), front.key);
  }

  // Tap-to-walk across the biggest ground-floor room (the hall holds the stairs, so a tap there can land on a riser).
  const hall = await page.evaluate(() => { const n = window.__walk.nav(); const l = n.levels.find((x) => x.level === 0); const r = [...l.rooms].sort((a, b) => b.area - a.area)[0]; return { id: r.id, name: r.name, poly: r.poly, baseY: l.baseY }; });
  const hc = centroid(hall.poly);
  // Stand 1.5 m south of the centre, looking at the floor 2 m ahead.
  await page.evaluate(([hc, hall]) => { const w = window.__walkStore.getState(); w.setPose({ x: hc.x, y: hc.y + 1.5, level: 0, stair: null, feetY: hall.baseY, yaw: 0, pitch: -0.65 }); }, [hc, hall]);
  await page.evaluate(() => window.__walk.sim(0.1));
  const hp = await toScreen(page, hc.x, hall.baseY, hc.y - 0.6);
  await page.mouse.click(hp.x, hp.y);
  await page.waitForTimeout(300);
  s = await st(page);
  ok(!!s.w.route && s.w.route.points.length >= 1, `clicking the floor sets a route (${s.w.route ? s.w.route.points.length : 0} points)`);
  // The target is snapped to the nearest free spot (clear of the furniture), so check against the route's end.
  const goalPt = s.w.route ? s.w.route.points[s.w.route.points.length - 1] : { x: hc.x, y: hc.y - 0.6 };
  ok(Math.hypot(goalPt.x - hc.x, goalPt.y - (hc.y - 0.6)) < 1.0, 'the route ends near the tapped spot');
  const poses = await page.evaluate(() => window.__walk.sim(12));
  console.log('INFO tap route in a room:', fmt(feel(poses)));
  s = await st(page);
  const endP = poses[poses.length - 1];
  ok(!s.w.route && s.w.where?.roomName && Math.hypot(endP.x - goalPt.x, endP.y - goalPt.y) < 0.3, `route followed to the tapped spot, now in ${s.w.where?.roomName}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/walk-room.png` });
  // Key ramps, in the open: stand mid-room facing along its longest side and hold W for 0.6 s, then let go.
  {
    const r = await page.evaluate(([hc, hall]) => {
      const w = window.__walkStore.getState();
      const poly = hall.poly; let best = null;
      for (let a = 0; a < 16; a++) { const yaw = (a * Math.PI) / 8; const fx = -Math.sin(yaw), fy = -Math.cos(yaw); let t = 0; while (t < 4) { const p = { x: hc.x + fx * t, y: hc.y + fy * t }; let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i].y > p.y) !== (poly[j].y > p.y) && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) c = !c; if (!c) break; t += 0.1; } if (!best || t > best.t) best = { yaw, t }; }
      w.setPose({ x: hc.x, y: hc.y, level: 0, stair: null, feetY: hall.baseY, yaw: best.yaw, pitch: 0 });
      window.__walk.sim(1);
      const p0 = window.__walkStore.getState().pose;
      const fire = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyW', key: 'w', bubbles: true, cancelable: true }));
      fire('keydown'); const up = window.__walk.sim(0.6); fire('keyup'); const down = window.__walk.sim(0.6);
      return { p0, up, down, room: best.t };
    }, [hc, hall]);
    const sp = (ps, p0) => ps.map((q, i) => Math.hypot(q.x - (i ? ps[i - 1].x : p0.x), q.y - (i ? ps[i - 1].y : p0.y)) * 30);
    const up = sp(r.up, r.p0), down = sp(r.down, r.up[r.up.length - 1]);
    const vm = Math.max(...up);
    const tUp = (up.findIndex((v) => v >= 0.9 * vm) + 1) / 30, tDown = (down.findIndex((v) => v <= 0.1 * vm) + 1) / 30;
    console.log('INFO W speeds up:', up.slice(0, 10).map((v) => v.toFixed(2)).join(' '), '| down:', down.slice(0, 10).map((v) => v.toFixed(2)).join(' '), `| clear room ahead ${r.room.toFixed(1)} m`);
    ok(vm > 1.3 && tUp >= 0.15 && tUp <= 0.3 && up[0] < 0.5 * vm, `holding W: speed ramps up to 90% in ${tUp.toFixed(2)} s (first frame ${up[0].toFixed(2)} of ${vm.toFixed(2)} m/s)`);
    ok(tDown >= 0.1 && tDown <= 0.3 && down[0] > 0.4 * vm, `releasing W: speed falls below 10% in ${tDown.toFixed(2)} s (first frame ${down[0].toFixed(2)} m/s)`);
  }
  const wallRoute = await page.evaluate(() => window.__walkStore.getState().route);
  ok(wallRoute === null, 'route cleared on arrival');

  // A place behind a shut door: you walk up to the door, face it, and are told it is shut.
  if (front) {
    await page.evaluate((k) => window.__walkStore.getState().setDoor(k, false), front.key);
    const hallIn = await page.evaluate((f) => {
      const l = window.__walk.nav().levels.find((x) => x.level === 0);
      const nx = -f.dir.y, ny = f.dir.x;
      // The room just inside the front door: 1 m along the normal, on whichever side is indoors.
      for (const side of [1, -1]) {
        const p = { x: f.centre.x + nx * 1.0 * side, y: f.centre.y + ny * 1.0 * side };
        const r = l.rooms.find((room) => { let c = false; const q = room.poly; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i].y > p.y) !== (q[j].y > p.y) && p.x < ((q[j].x - q[i].x) * (p.y - q[i].y)) / (q[j].y - q[i].y) + q[i].x) c = !c; return c; });
        if (r) return { p, baseY: l.baseY, name: r.name };
      }
      return null;
    }, front);
    ok(!!hallIn, `found the room inside the front door (${hallIn && hallIn.name})`);
    if (hallIn) {
      await page.evaluate(([h, f]) => { const w = window.__walkStore.getState(); w.setRoute(null); w.clearHint(); w.setPose({ x: h.p.x + (h.p.x - f.centre.x) * 0.8, y: h.p.y + (h.p.y - f.centre.y) * 0.8, level: 0, stair: null, feetY: h.baseY, yaw: 0, pitch: 0 }); }, [hallIn, front]);
      await page.evaluate(() => window.__walk.sim(0.1));
      await page.evaluate((p) => window.__walkStore.getState().requestGoal({ kind: 'point', level: 0, at: { x: p.x, y: p.y } }), start);
      await page.evaluate(() => window.__walk.sim(0.1));
      const hint0 = await page.evaluate(() => window.__walkStore.getState().hint?.text || '');
      ok(!/shut/i.test(hint0), 'no shut-door hint before you get there');
      await page.evaluate(() => window.__walk.sim(10));
      s = await st(page);
      const dDoor = Math.hypot(s.w.pose.x - front.centre.x, s.w.pose.y - front.centre.y);
      const face = Math.atan2(-(front.centre.x - s.w.pose.x), -(front.centre.y - s.w.pose.y));
      const off = Math.abs(Math.atan2(Math.sin(face - s.w.pose.yaw), Math.cos(face - s.w.pose.yaw)));
      ok(/shut/i.test(s.w.hint?.text || '') && dDoor < 1.0 && s.w.where?.roomName && off < 0.2, `a place behind a shut door: walked up to it (${dDoor.toFixed(2)} m, facing ${off.toFixed(2)} rad off) and "${s.w.hint?.text}"`);
    }
    await page.evaluate((k) => window.__walkStore.getState().setDoor(k, true), front.key);
  }

  // Stairs: walk to the largest level-1 room.
  const hasUp = await page.evaluate(() => window.__walk.nav().levels.some((l) => l.level === 1));
  if (hasUp) {
    const up = await bigRoom(page, 1);
    // Every door open, so the bedroom door doesn't stop the climb.
    await page.evaluate(() => { const w = window.__walkStore.getState(); for (const d of window.__walk.nav().doors) w.setDoor(d.key, true); w.clearHint(); });
    // First a route across at least two rooms on the ground floor (doors open): the farthest room from here.
    const across = await page.evaluate(() => {
      const w = window.__walkStore.getState(), p = w.pose, l = window.__walk.nav().levels.find((x) => x.level === 0);
      const cen = (r) => r.poly.reduce((a, q) => ({ x: a.x + q.x / r.poly.length, y: a.y + q.y / r.poly.length }), { x: 0, y: 0 });
      const far = [...l.rooms].sort((a, b) => Math.hypot(cen(b).x - p.x, cen(b).y - p.y) - Math.hypot(cen(a).x - p.x, cen(a).y - p.y))[0];
      w.requestGoal({ kind: 'room', level: 0, roomId: far.id });
      // Same call, so no slow real frame runs between the request and the simulated frames.
      const out = { id: far.id, name: far.name, route: window.__walkStore.getState().route, poses: window.__walk.sim(30), stand: window.__walk.goalPoint({ kind: 'room', level: 0, roomId: far.id }).point };
      return out;
    });
    const crossRoute = across.route, crossPoses = across.poses;
    // The climb below starts from the room's stand spot, as it always did (the tap now stops in the doorway).
    await page.evaluate((st0) => { const w = window.__walkStore.getState(), l = window.__walk.nav().levels.find((x) => x.level === 0); w.setRoute(null); w.setPose({ x: st0.x, y: st0.y, level: 0, stair: null, feetY: l.baseY, yaw: w.pose.yaw, pitch: w.pose.pitch }); window.__walk.sim(0.3); }, across.stand);
    const crossEnd = crossRoute ? crossRoute.points[crossRoute.points.length - 1] : null;
    const roomsSeen = await page.evaluate((ps) => {
      const l = window.__walk.nav().levels.find((x) => x.level === 0), seen = new Set();
      const inside = (q, p) => { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i].y > p.y) !== (q[j].y > p.y) && p.x < ((q[j].x - q[i].x) * (p.y - q[i].y)) / (q[j].y - q[i].y) + q[i].x) c = !c; return c; };
      for (const p of ps) for (const r of l.rooms) if (inside(r.poly, p)) seen.add(r.id);
      return seen.size;
    }, crossPoses);
    const cf = feel(crossPoses), cl = crossPoses[crossPoses.length - 1];
    ok(!!crossRoute && roomsSeen >= 2 && Math.hypot(cl.x - crossEnd.x, cl.y - crossEnd.y) < 0.3, `route across ${roomsSeen} rooms to ${across.name} arrives (${crossEnd ? Math.hypot(cl.x - crossEnd.x, cl.y - crossEnd.y).toFixed(2) : '?'} m off)`);
    ok(feelOk(cf), `smooth across rooms: ${fmt(cf)}`);
    const climbRun = await page.evaluate((id) => { window.__walkStore.getState().requestGoal({ kind: 'room', level: 1, roomId: id }); return { route: window.__walkStore.getState().route, poses: window.__walk.sim(40) }; }, up.id);
    const climbRoute = climbRun.route, climb = climbRun.poses;
    const climbEnd = climbRoute ? climbRoute.points[climbRoute.points.length - 1] : null, cle = climb[climb.length - 1];
    const sf = feel(climb);
    ok(!!climbEnd && Math.hypot(cle.x - climbEnd.x, cle.y - climbEnd.y) < 0.3, `upstairs route arrives (${climbEnd ? Math.hypot(cle.x - climbEnd.x, cle.y - climbEnd.y).toFixed(2) : '?'} m off)`);
    ok(feelOk(sf), `smooth up the stairs: ${fmt(sf)}`);
    const last = climb[climb.length - 1];
    let maxStep = 0; for (let i = 1; i < climb.length; i++) maxStep = Math.max(maxStep, Math.abs(climb[i].feetY - climb[i - 1].feetY));
    needs('B', last.level === 1 && maxStep <= 0.3, `stairs: reaches level ${last.level} with biggest feet step ${maxStep.toFixed(3)} m`);
  }

  // Guided tour: plays, advances, a key pauses it. (Back on the ground floor first.)
  await page.evaluate(() => { const nav = window.__walk.nav(); const l = nav.levels.find((x) => x.level === 0); const r = l.rooms[0]; const w = window.__walkStore.getState(); const c = r.poly.reduce((a, p) => ({ x: a.x + p.x / r.poly.length, y: a.y + p.y / r.poly.length }), { x: 0, y: 0 }); w.setPose({ x: c.x, y: c.y, level: 0, stair: null, feetY: l.baseY, yaw: 0, pitch: 0 }); w.setRoute(null); });
  await page.evaluate(() => window.__walkStore.getState().playTour());
  // Run up to 3 minutes of tour in 5 s slices, noting how far it got and which doors it opened.
  const tourRun = await page.evaluate(() => {
    let maxIndex = 0, stops = 0, ended = false, phase = 'walking';
    const all = [], looks = [];
    for (let i = 0; i < 36 && !ended; i++) {
      for (let f = 0; f < 150; f++) {
        all.push(...window.__walk.sim(1 / 30));
        const t0 = window.__walkStore.getState().tour;
        if (t0.status === 'playing' && t0.phase === 'looking' && phase !== 'looking') {
          const w0 = window.__walkStore.getState(); const stop = t0.stops[t0.index];
          looks.push({ index: t0.index, roomId: stop.roomId, name: stop.name, level: stop.level, pose: { ...w0.pose }, sweep: window.__walk.look() });
        }
        phase = t0.phase;
      }
      const t = window.__walkStore.getState().tour;
      if (t.stops.length) stops = t.stops.length;
      maxIndex = Math.max(maxIndex, t.index);
      ended = t.status === 'off' && stops > 0;
    }
    const w = window.__walkStore.getState(), n = window.__walk.nav();
    return { all, looks, nav: { levels: n.levels.map((l) => ({ level: l.level, rooms: l.rooms.map((r) => ({ id: r.id, name: r.name, poly: r.poly })) })), doors: n.doors.map((d) => ({ level: d.level, kind: d.kind, centre: d.centre, passage: d.passage })), plot: n.plot }, maxIndex, stops, ended, hint: w.hint?.text, opened: n.doors.some((d) => w.doors[d.key] === true && !d.initial) };
  });
  const tf = feel(tourRun.all);
  ok(tf.yawStep <= 0.08, `smooth tour (${tourRun.all.length} frames): ${fmt(tf)}`);
  console.log('INFO tour rate/speed:', fmt(tf));
  ok(tourRun.stops >= 3 && tourRun.maxIndex >= 3, `tour advanced (reached stop ${tourRun.maxIndex} of ${tourRun.stops})`);
  ok(tourRun.ended && /tour/i.test(tourRun.hint || ''), `tour ends and says "${tourRun.hint}"`);
  needs('B', tourRun.opened, 'tour opened a shut door on the way');
  ok(tf.rateChange <= 0.03, `tour yaw-rate change ${tf.rateChange.toFixed(3)} <= 0.03`);
  {
    // Each look-round starts in the doorway: inside the stop's room (outside, for the garden), within 1.2 m of an opening on its boundary.
    const pip = (pt, q) => { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i].y > pt.y) !== (q[j].y > pt.y) && pt.x < ((q[j].x - q[i].x) * (pt.y - q[i].y)) / (q[j].y - q[i].y) + q[i].x) c = !c; return c; };
    const nv = tourRun.nav;
    ok(tourRun.looks.length === tourRun.stops, `every stop reached its look-round (${tourRun.looks.length} of ${tourRun.stops})`);
    for (const lk of tourRun.looks) {
      const L = nv.levels.find((l) => l.level === lk.level);
      const rm = lk.roomId === null ? null : L.rooms.find((r) => r.id === lk.roomId);
      const inRoom = rm ? pip(lk.pose, rm.poly) : !nv.levels[0].rooms.some((r) => pip(lk.pose, r.poly)) && nv.plot && pip(lk.pose, nv.plot);
      const polyEdgeDist = (pt, q) => { let b = Infinity; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const dx = q[i].x - q[j].x, dy = q[i].y - q[j].y; const u = Math.max(0, Math.min(1, ((pt.x - q[j].x) * dx + (pt.y - q[j].y) * dy) / (dx * dx + dy * dy || 1))); b = Math.min(b, Math.hypot(pt.x - (q[j].x + dx * u), pt.y - (q[j].y + dy * u))); } return b; };
      const edgeSets = rm ? [rm.poly] : nv.levels[0].rooms.map((r) => r.poly);
      let best = Infinity;
      for (const d of nv.doors) { if (d.level !== lk.level) continue; const onB = Math.min(...edgeSets.map((q) => polyEdgeDist(d.centre, q))) < 0.5; if (onB && d.passage !== 'shut') best = Math.min(best, Math.hypot(d.centre.x - lk.pose.x, d.centre.y - lk.pose.y)); }
      lk.dist = best;
      ok(inRoom && best <= 1.2, `${lk.name}: look-round starts ${inRoom ? (rm ? 'inside' : 'outside') : 'NOT in'} the region, ${best.toFixed(2)} m from its opening, sweep ${lk.sweep ? (lk.sweep.left * 180 / Math.PI).toFixed(0) + '/' + (lk.sweep.right * 180 / Math.PI).toFixed(0) : 'n/a'} deg`);
    }
    console.log('TOUR TABLE:\n' + tourRun.looks.map((l) => `${l.name}\t${l.dist.toFixed(2)} m\t${l.sweep ? (l.sweep.left * 180 / Math.PI).toFixed(0) : '-'} deg`).join('\n'));
  }
  await page.evaluate(() => { const w = window.__walkStore.getState(); w.stopTour(); w.playTour(); });
  await page.evaluate(() => window.__walk.sim(3));
  s = await st(page);
  ok(s.w.tour.status === 'playing', 'tour plays again');
  await page.keyboard.press('ArrowRight');
  s = await st(page);
  ok(s.w.tour.status === 'paused', 'any key pauses the tour');
  const idxPaused = s.w.tour.index;
  const pPaused = s.w.pose;
  await page.evaluate(() => window.__walk.sim(2));
  s = await st(page);
  ok(s.w.tour.index === idxPaused && Math.hypot(s.w.pose.x - pPaused.x, s.w.pose.y - pPaused.y) < 0.01, 'paused tour does not move');
  await page.evaluate(() => window.__walkStore.getState().playTour());
  await page.evaluate(() => window.__walk.sim(1));
  s = await st(page);
  ok(s.w.tour.status === 'playing' && s.w.tour.stops.length > 0, 'tour resumes');
  await page.evaluate(() => window.__walkStore.getState().stopTour());

  // ---- No frames when idle; the glance-and-hold look-round; interruption; tour length ----
  {
    await page.evaluate(() => { const w = window.__walkStore.getState(); w.stopTour(); w.setRoute(null); });
    await page.evaluate(() => window.__walk.sim(3));
    const c0 = await page.evaluate(() => window.__walk.invalidates);
    await page.evaluate(() => window.__walk.sim(2));
    const c1 = await page.evaluate(() => window.__walk.invalidates);
    const idle = await page.evaluate(() => window.__walk.state());
    ok(c1 === c0 && idle.busy.length === 0, `idle walker asks for no frames (invalidates ${c0} -> ${c1}, busy [${idle.busy}])`);

    const V = walkLensJs((await canvasSize(page)).w, (await canvasSize(page)).h).v;
    const run = await runTour(page);
    const facts = lookFacts(run.rows);
    ok(facts.length === run.stops, `every stop has a look-round (${facts.length} of ${run.stops})`);
    for (const f of facts) {
      ok(f.peak <= 75 + 3, `stop ${f.i}: look-round turns at most ${f.peak.toFixed(1)} deg/s (cap 75 + 3)`);
      ok(f.holds >= 2, `stop ${f.i}: ${f.holds} holds of 0.5 s or more`);
      ok(f.jump < 1, `stop ${f.i}: the look starts where the walk ended (${f.jump.toFixed(2)} deg)`);
      ok(Math.abs(((f.endPitch - (restPitchJs(V) + (4 * Math.PI) / 180)) * 180) / Math.PI) < 0.5, `stop ${f.i}: pitch settles at the rest pitch + 4 deg (${((f.endPitch * 180) / Math.PI).toFixed(2)} deg)`);
      ok(f.lookBusy, `stop ${f.i}: busy includes "look" for the whole look-round`);
    }
    await page.evaluate(() => window.__walk.sim(3));
    const c2 = await page.evaluate(() => window.__walk.invalidates);
    await page.evaluate(() => window.__walk.sim(2));
    const idle2 = await page.evaluate(() => ({ n: window.__walk.invalidates, s: window.__walk.state() }));
    ok(idle2.n === c2 && idle2.s.busy.length === 0, `idle again after the tour (busy [${idle2.s.busy}])`);
    // Tour length against the sweep look-round it replaced.
    const newS = run.frames / 30;
    console.log(`INFO tour length: old ${TOUR_BASE_S.toFixed(2)} s, new ${newS.toFixed(2)} s (${((newS / TOUR_BASE_S - 1) * 100).toFixed(1)}%)`);
    ok(run.ended && Math.abs(newS - TOUR_BASE_S) <= 0.1 * TOUR_BASE_S, `tour length within 10% of the old (${newS.toFixed(1)} s vs ${TOUR_BASE_S.toFixed(1)} s)`);

    // Interruption: pause in the middle of the first look, turn 20 deg, play: the look carries on from there, no jump.
    await page.evaluate(() => { const w = window.__walkStore.getState(); w.stopTour(); });
    const cut = await page.evaluate(() => {
      const nav = window.__walk.nav(), w = window.__walkStore.getState();
      const l = nav.levels.find((x) => x.level === 0), r = l.rooms[0];
      const c = r.poly.reduce((a, p) => ({ x: a.x + p.x / r.poly.length, y: a.y + p.y / r.poly.length }), { x: 0, y: 0 });
      w.setRoute(null); w.setPose({ x: c.x, y: c.y, level: 0, stair: null, feetY: l.baseY, yaw: 0, pitch: 0 }); w.playTour();
      let got = false;
      for (let i = 0; i < 3000 && !got; i++) { window.__walk.sim(1 / 30); const s = window.__walk.state(); got = !!s.look && s.look.t > 2; }
      if (!got) return null;
      window.__walkStore.getState().pauseTour();
      window.__walk.sim(1 / 30);
      const p = window.__walkStore.getState().pose;
      window.__walkStore.getState().setPose({ ...p, yaw: p.yaw + (20 * Math.PI) / 180 });
      const turned = window.__walkStore.getState().pose.yaw;
      window.__walkStore.getState().playTour();
      window.__walk.sim(1 / 30);
      const s = window.__walk.state();
      return { turned, yaw: s.yaw, phase: s.tour.phase, look: !!s.look };
    });
    ok(!!cut && Math.abs(degWrap(cut.yaw - cut.turned)) < 1 && cut.phase === 'looking' && cut.look, `interrupted look resumes in place (${cut ? degWrap(cut.yaw - cut.turned).toFixed(2) : '?'} deg jump, ${cut && cut.phase})`);
    await page.evaluate(() => { const w = window.__walkStore.getState(); w.stopTour(); w.setRoute(null); });
  }

  // Idle screenshots: the kitchen at REST_PITCH with the new lens, then at the old 65 degree lens with pitch 0.
  {
    await page.evaluate(() => { const w = window.__walkStore.getState(); w.stopTour(); w.setRoute(null); });
    const k = await page.evaluate(() => {
      const l = window.__walk.nav().levels.find((x) => x.level === 0);
      const r = l.rooms.find((q) => /kitchen/i.test(q.name)) || [...l.rooms].sort((a, b) => b.area - a.area)[0];
      const c = r.poly.reduce((a, q) => ({ x: a.x + q.x / r.poly.length, y: a.y + q.y / r.poly.length }), { x: 0, y: 0 });
      // Face along the longest clear run inside the room.
      const inside = (p) => { let q = r.poly, c2 = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i].y > p.y) !== (q[j].y > p.y) && p.x < ((q[j].x - q[i].x) * (p.y - q[i].y)) / (q[j].y - q[i].y) + q[i].x) c2 = !c2; return c2; };
      let best = { yaw: 0, t: -1 };
      for (let a = 0; a < 32; a++) { const yaw = (a * Math.PI) / 16; let t = 0; while (t < 6 && inside({ x: c.x - Math.sin(yaw) * t, y: c.y - Math.cos(yaw) * t })) t += 0.1; if (t > best.t) best = { yaw, t }; }
      return { name: r.name, c, yaw: best.yaw, baseY: l.baseY };
    });
    const setView = (pitch) => page.evaluate(([k, pitch]) => { window.__walkStore.getState().setPose({ x: k.c.x, y: k.c.y, level: 0, stair: null, feetY: k.baseY, yaw: k.yaw, pitch }); window.__walk.sim(0.3); }, [k, pitch]);
    await setView(REST_PITCH);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/kitchen-new-lens.png` });
    const newFov = await page.evaluate(() => { const c = window.__houseCamera.camera; const f = c.fov; c.fov = 65; c.updateProjectionMatrix(); return f; });
    await setView(0);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/kitchen-old-lens.png` });
    await page.evaluate((f) => { const c = window.__houseCamera.camera; c.fov = f; c.updateProjectionMatrix(); }, newFov);
    console.log(`INFO screenshots in the ${k.name}: kitchen-new-lens.png (fov ${newFov.toFixed(1)}, pitch -8 deg), kitchen-old-lens.png (fov 65, pitch 0)`);
  }

  // Doorway screenshots: the start of the look-round in the kitchen and in the living room (rear).
  {
    const dir = process.env.SHOTS_DOOR || SHOTS;
    fs.mkdirSync(dir, { recursive: true });
    for (const [want, file] of [['Kitchen', 'kitchen-doorway.png'], ['Living Room (rear)', 'living-rear-doorway.png']]) {
      await page.evaluate(() => { const nav = window.__walk.nav(); const l = nav.levels.find((x) => x.level === 0); const r = l.rooms.find((q) => q.name === 'Hallway (front)'); const w = window.__walkStore.getState(); w.stopTour(); const c = r.poly.reduce((a, p) => ({ x: a.x + p.x / r.poly.length, y: a.y + p.y / r.poly.length }), { x: 0, y: 0 }); w.setPose({ x: c.x, y: c.y, level: 0, stair: null, feetY: l.baseY, yaw: 0, pitch: 0 }); w.setRoute(null); w.playTour(); });
      const found = await page.evaluate((want) => { for (let f = 0; f < 6000; f++) { window.__walk.sim(1 / 30); const t = window.__walkStore.getState().tour; if (t.status === 'playing' && t.phase === 'looking' && t.stops[t.index].name === want) return true; } return false; }, want);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${dir}/${file}` });
      console.log(`INFO ${want}: ${found ? 'screenshot' : 'NOT REACHED'} ${dir}/${file}`);
      ok(found, `${want}: reached for the screenshot`);
      await page.evaluate(() => window.__walkStore.getState().stopTour());
    }
  }

  // Mini-map room goals stop just inside the doorway, facing into the room.
  {
    const rows = [];
    for (const want of ['Kitchen', 'Living Room (rear)', 'Bedroom 2']) {
      const r = await page.evaluate((want) => {
        const nav = window.__walk.nav(); const w = window.__walkStore.getState();
        const lvl = want.startsWith('Bedroom') ? 1 : 0;
        const home = nav.levels.find((x) => x.level === 0).rooms.find((q) => q.name === 'Hallway (front)');
        const l0 = nav.levels.find((x) => x.level === 0);
        const c = home.poly.reduce((a, p) => ({ x: a.x + p.x / home.poly.length, y: a.y + p.y / home.poly.length }), { x: 0, y: 0 });
        w.setRoute(null); w.setPose({ x: c.x, y: c.y, level: 0, stair: null, feetY: l0.baseY, yaw: 0, pitch: 0 });
        for (const d of nav.doors) w.setDoor(d.key, true);
        const room = nav.levels.find((x) => x.level === lvl).rooms.find((q) => q.name === want);
        window.__walk.sim(0.2);
        window.__walkStore.getState().requestGoal({ kind: 'room', level: lvl, roomId: room.id });
        for (let f = 0; f < 3000; f++) { window.__walk.sim(1 / 30); const s2 = window.__walkStore.getState(); if (!s2.route && f > 5) break; }
        const p = window.__walkStore.getState().pose;
        return { poly: room.poly, pose: p, doors: nav.doors.filter((d) => d.level === lvl && d.passage !== 'shut').map((d) => d.centre) };
      }, want);
      const inside = (() => { let c = false; const q = r.poly, pt = r.pose; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i].y > pt.y) !== (q[j].y > pt.y) && pt.x < ((q[j].x - q[i].x) * (pt.y - q[i].y)) / (q[j].y - q[i].y) + q[i].x) c = !c; return c; })();
      const dist = Math.min(...r.doors.map((d) => Math.hypot(d.x - r.pose.x, d.y - r.pose.y)));
      const cen = centroid(r.poly), fw = { x: -Math.sin(r.pose.yaw), y: -Math.cos(r.pose.yaw) };
      const facing = (cen.x - r.pose.x) * fw.x + (cen.y - r.pose.y) * fw.y > 0;
      ok(inside && dist <= 1.2 && facing, `mini-map tap on ${want}: arrives ${inside ? 'inside' : 'OUTSIDE'}, ${dist.toFixed(2)} m from an opening, ${facing ? 'facing in' : 'FACING OUT'}`);
    }
  }

  // Esc stops, restores the view settings and the orbit camera.
  await page.keyboard.press('Escape');
  s = await st(page);
  ok(!s.w.on && s.m.viewMode === 'single' && !s.m.showCeilings, 'Esc stops and restores the view settings');
  await page.waitForTimeout(1500);
  const back = await page.evaluate(() => window.__houseCamera.camera.position.toArray());
  ok(Math.hypot(...back.map((v, i) => v - orbit[i])) < 0.05, 'orbit camera back where it was');
  ok(await page.evaluate((f) => window.__houseCamera.camera.fov === f && window.__houseCamera.camera.near === 0.1 && window.__houseCamera.camera.rotation.order === 'XYZ', orbitFov), 'lens restored (fov, near, rotation order)');
  ok(await page.evaluate(() => !!window.__houseCamera.controls), 'orbit controls back');

  // Room menu in orbit: right-click a room floor.
  await page.evaluate(() => { const m = window.__houseStore.getState(); m.setUi({ showCeilings: false, showExterior: false, maxLevel: 0 }); });
  await page.waitForTimeout(800);
  const room = hall; // the biggest ground-floor room, read while __walk was alive
  const rc = centroid(room.poly);
  const rp = await toScreen(page, rc.x, room.baseY, rc.y);
  await page.mouse.click(rp.x, rp.y, { button: 'right' });
  const item = page.getByText('Walk from here', { exact: true });
  const menuShown = await item.first().waitFor({ timeout: 5000 }).then(() => true, () => false);
  ok(menuShown, 'the 3D room menu has "Walk from here"');
  if (menuShown) {
    await item.first().click();
    await page.waitForFunction(() => window.__walkStore.getState().pose, null, { timeout: 20000 });
    s = await st(page);
    ok(s.w.on && s.w.pose.level === 0 && s.m.tab === '3d', `Walk from here starts a walk on level ${s.w.pose.level}`);
    ok(s.w.where?.roomName === room.name, `... in the room you clicked (${s.w.where?.roomName})`);
    await page.keyboard.press('Escape');
  }

  // Plan menu: right-click inside a room.
  await page.evaluate(() => { const m = window.__houseStore.getState(); m.setMode('build'); m.setUi({ tab: 'plan', selectedRoomId: null }); });
  await page.waitForSelector('.plan-canvas svg');
  await page.waitForTimeout(1200);
  const planPt = await page.evaluate(() => {
    const s = window.__houseStore.getState();
    const f = s.variants[s.activeVariant].floors.find((x) => x.id === s.editFloorId) || s.variants[s.activeVariant].floors[0];
    const svg = document.querySelector('.plan-canvas svg');
    const rooms = [...f.rooms].sort((a, b) => b.polygon.length - a.polygon.length);
    for (const r of rooms) {
      const cx = r.polygon.reduce((a, p) => a + p.x, 0) / r.polygon.length, cy = r.polygon.reduce((a, p) => a + p.y, 0) / r.polygon.length;
      const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
      const m = pt.matrixTransform(svg.getScreenCTM());
      const el = document.elementFromPoint(m.x, m.y);
      if (el && el.tagName === 'polygon') return { x: m.x, y: m.y, id: r.id, level: f.level };
    }
    return null;
  });
  ok(!!planPt, 'found a room to right-click on the plan');
  if (planPt) {
    const pItem = page.getByText('Walk from here', { exact: true });
    let pShown = false;
    for (let attempt = 0; attempt < 3 && !pShown; attempt++) {
      await page.mouse.move(planPt.x, planPt.y);
      await page.mouse.click(planPt.x, planPt.y, { button: 'right' });
      pShown = await pItem.first().waitFor({ timeout: 3000 }).then(() => true, () => false);
      if (!pShown) await page.waitForTimeout(1500);
    }
    if (!pShown) console.log('INFO plan menu:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button[role=menuitem]')].map((e) => e.textContent).slice(0, 12))), JSON.stringify(planPt));
    ok(pShown, 'the plan room menu has "Walk from here"');
    if (pShown) {
      await pItem.first().click();
      await page.waitForFunction(() => window.__walkStore.getState().pose, null, { timeout: 20000 });
      s = await st(page);
      ok(s.w.on && s.m.tab === '3d' && s.w.pose.level === planPt.level, `plan "Walk from here" switches to 3D and walks (level ${s.w.pose.level})`);
      const near = await page.evaluate(() => { const w = window.__walkStore.getState(); return w.where?.roomName; });
      console.log('INFO started in room:', near);
    }
  }
  await browser.close();

  // ================= desktop, with the extension: Space peeks =================
  ({ browser, page } = await open(1));
  await page.evaluate(() => window.__walkStore.getState().requestWalk({ kind: 'front' }));
  await page.waitForFunction(() => window.__walkStore.getState().pose && window.__walk);
  await page.evaluate(() => window.__walk.sim(0.5));
  const v0 = await page.evaluate(() => window.__houseStore.getState().activeVariant);
  await page.evaluate(() => window.__walkStore.getState().playTour());
  await page.evaluate(() => window.__walk.sim(2));
  await page.keyboard.down('Space');
  await page.waitForTimeout(600);
  s = await st(page);
  ok(s.m.activeVariant !== v0 && s.w.on, `holding Space shows the other layout (${v0} -> ${s.m.activeVariant}) and keeps walking`);
  ok(s.w.tour.status === 'paused', 'a layout flip pauses the tour');
  await page.evaluate(() => window.__walk.sim(0.3));
  s = await st(page);
  needs('B', await page.evaluate(() => { const w = window.__walkStore.getState(); const nav = window.__walk.nav(); const lv = nav.levels.find((l) => l.level === w.pose.level); return !!lv && Number.isFinite(w.pose.x); }), 'pose still valid after the flip');
  await page.keyboard.up('Space');
  await page.waitForTimeout(600);
  s = await st(page);
  ok(s.m.activeVariant === v0 && s.w.on, 'releasing Space returns to the first layout');
  // Review mode stops the walk; the Plan tab stops it too.
  await page.evaluate(() => window.__houseStore.getState().setUi({ tab: 'plan' }));
  await page.waitForTimeout(500);
  s = await st(page);
  ok(!s.w.on, 'switching to the Plan tab stops the walk');
  await browser.close();

  // ================= iPad: touch taps =================
  ({ browser, page } = await open(0, { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true }));
  await page.evaluate(() => window.__walkStore.getState().requestWalk({ kind: 'front' }));
  await page.waitForFunction(() => window.__walkStore.getState().pose && window.__walk);
  s = await st(page);
  ok(/Tap the floor to walk/.test(s.w.hint?.text || '') || /Click the floor/.test(s.w.hint?.text || ''), `touch hint ("${s.w.hint?.text}")`);
  {
    ok(await page.evaluate(() => matchMedia('(pointer: coarse)').matches === true), 'iPad context has a coarse pointer');
    const cv2 = await canvasSize(page);
    const fovI = await camFov(page);
    ok(Math.abs(fovI - walkLensJs(cv2.w, cv2.h).v) < 0.05, `iPad lens ${fovI.toFixed(2)} V for ${cv2.w.toFixed(0)}x${cv2.h.toFixed(0)} (rule ${walkLensJs(cv2.w, cv2.h).v.toFixed(2)}, ${walkLensJs(cv2.w, cv2.h).h.toFixed(1)} across)`);
    const runI = await runTour(page, { maxFrames: 1500 });
    const factsI = lookFacts(runI.rows);
    ok(factsI.length > 0 && factsI.every((f) => f.peak <= 85 + 3), `iPad look-round turns at most ${Math.max(...factsI.map((f) => f.peak)).toFixed(1)} deg/s (cap 85 + 3)`);
    await page.evaluate(() => { const w = window.__walkStore.getState(); w.stopTour(); w.setRoute(null); });
  }
  const r2 = await bigRoom(page, 0);
  const lk = await standLooking(page, r2, 1.4);
  await page.touchscreen.tap(lk.p.x, lk.p.y);
  await page.waitForTimeout(300);
  s = await st(page);
  ok(!!s.w.route, 'a finger tap on the floor sets a route');
  const t0 = s.w.pose;
  const tEnd = s.w.route ? s.w.route.points[s.w.route.points.length - 1] : t0;
  await page.evaluate(() => window.__walk.sim(4));
  s = await st(page);
  ok(Math.hypot(s.w.pose.x - tEnd.x, s.w.pose.y - tEnd.y) < 0.3 && Math.hypot(tEnd.x - t0.x, tEnd.y - t0.y) > 0.3, `and the walker follows it (${Math.hypot(tEnd.x - t0.x, tEnd.y - t0.y).toFixed(2)} m route, ends ${Math.hypot(s.w.pose.x - tEnd.x, s.w.pose.y - tEnd.y).toFixed(2)} m from its end)`);
  // Drag with a finger looks round (CDP touch).
  const cdp = await page.context().newCDPSession(page);
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
  const yaw0 = s.w.pose.yaw;
  await send('touchStart', [{ x: 600, y: 400 }]);
  for (let i = 1; i <= 6; i++) await send('touchMove', [{ x: 600 + i * 25, y: 400 }]);
  await send('touchEnd', []);
  s = await st(page);
  ok(s.w.pose.yaw - yaw0 > 0.1, `finger drag turns the view (yaw +${(s.w.pose.yaw - yaw0).toFixed(2)})`);
  // A tap on a wall does nothing.
  await page.evaluate(() => window.__walkStore.getState().setRoute(null));
  await browser.close();

  console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
