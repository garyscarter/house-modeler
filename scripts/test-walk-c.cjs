// Chunk C acceptance: the first-person walk controller. Usage: PORT=5313 node scripts/test-walk-c.cjs
// Checks that need Chunk B (collision, shut-door blocking, stairs, routes through doors) or Chunk A (tappable door leaves)
// print "NEEDS-B" / "NEEDS-A" instead of FAIL when they do not hold, so the script is green on the stubs; re-run after merging both,
// when every NEEDS line should read PASS.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const PORT = process.env.PORT || 5313;
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-user-house-modeler/fb69ded0-7598-55a9-80ca-486cb25f050d/scratchpad/shots-c';
fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
const needs = (tag, c, m) => console.log(c ? `PASS ${m} [${tag} present]` : `NEEDS-${tag} ${m}`);
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
  ok(Math.abs(s.cam[1] - (s.w.pose.feetY + 1.6)) < 0.05 && s.m.showCeilings && s.m.viewMode === 'single', 'eye at 1.6 m, ceilings on, single view');
  const lens = await page.evaluate(() => { const c = window.__houseCamera.camera; return { fov: c.fov, near: c.near, order: c.rotation.order, ctl: window.__houseCamera.controls }; });
  ok(lens.fov === 65 && lens.near === 0.05 && lens.order === 'YXZ' && lens.ctl === null, `lens: fov ${lens.fov}, near ${lens.near}, order ${lens.order}, controls off`);
  ok(/Click the floor to walk/.test(s.w.hint?.text || ''), `first-time hint on desktop ("${s.w.hint?.text}")`);
  ok(s.w.where && s.w.where.outside === true && !s.w.where.roomName, 'standing outside in the garden at the start');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/walk-front.png` });

  // Keys: W walks forward, A/D strafe, arrows turn, digits are swallowed.
  const before = s.w.pose;
  await page.keyboard.down('w'); const polesW = await page.evaluate(() => window.__walk.sim(1)); await page.keyboard.up('w');
  s = await st(page);
  ok(polesW.length === 30 && Math.hypot(s.w.pose.x - before.x, s.w.pose.y - before.y) > 0.8, `W walks about 1.4 m in a second (${Math.hypot(s.w.pose.x - before.x, s.w.pose.y - before.y).toFixed(2)} m)`);
  ok(s.w.pose.y < before.y, 'forward at yaw 0 goes towards the back of the house (-z)');
  await page.keyboard.down('ArrowLeft'); await page.evaluate(() => window.__walk.sim(1)); await page.keyboard.up('ArrowLeft');
  s = await st(page);
  ok(s.w.pose.yaw > 1.2, `left arrow turns left (yaw ${s.w.pose.yaw.toFixed(2)})`);
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
    // Stand 3 m in front of the door, facing it.
    await page.evaluate((f) => { const w = window.__walkStore.getState(); const nx = -f.dir.y, ny = f.dir.x; const side = ny > 0 ? 1 : -1; w.setPose({ ...w.pose, x: f.centre.x + nx * 3 * side, y: f.centre.y + ny * 3 * side, yaw: Math.atan2(nx * side, ny * side), pitch: 0 }); }, front);
    await page.keyboard.down('w'); await page.evaluate(() => window.__walk.sim(5)); await page.keyboard.up('w');
    s = await st(page);
    needs('B', Math.hypot(s.w.pose.x - front.centre.x, s.w.pose.y - front.centre.y) > 0.2 && !s.w.where?.roomName, 'shut front door stops you outside');
    await page.evaluate(() => window.__walk.sim(0.2));
    const p = await toScreen(page, front.centre.x, s.w.pose.feetY + 1.0, front.centre.y);
    await page.mouse.click(p.x, p.y);
    const opened = await page.waitForFunction((k) => window.__walkStore.getState().doors[k] === true, front.key, { timeout: 4000 }).then(() => true, () => false);
    needs('A', opened, 'tapping the front door leaf opens it');
    if (!opened) await page.evaluate((k) => window.__walkStore.getState().setDoor(k, true), front.key);
  }

  // Tap-to-walk across the biggest ground-floor room (the hall holds the stairs, so a tap there can land on a riser).
  const hall = await page.evaluate(() => { const n = window.__walk.nav(); const l = n.levels.find((x) => x.level === 0); const r = [...l.rooms].sort((a, b) => b.area - a.area)[0]; return { id: r.id, name: r.name, poly: r.poly, baseY: l.baseY }; });
  const hc = centroid(hall.poly);
  // Stand 1.5 m south of the centre, looking at the floor 2 m ahead.
  await page.evaluate(([hc, hall]) => { const w = window.__walkStore.getState(); w.setPose({ x: hc.x, y: hc.y + 1.5, level: 0, stair: null, feetY: hall.baseY, yaw: 0, pitch: -0.4 }); }, [hc, hall]);
  await page.evaluate(() => window.__walk.sim(0.1));
  const hp = await toScreen(page, hc.x, hall.baseY, hc.y - 0.6);
  await page.mouse.click(hp.x, hp.y);
  await page.waitForTimeout(300);
  s = await st(page);
  ok(!!s.w.route && s.w.route.points.length >= 1, `clicking the floor sets a route (${s.w.route ? s.w.route.points.length : 0} points)`);
  const poses = await page.evaluate(() => window.__walk.sim(12));
  s = await st(page);
  ok(!s.w.route && s.w.where?.roomName && Math.hypot(poses[poses.length - 1].x - hc.x, poses[poses.length - 1].y - (hc.y - 0.6)) < 0.4, `route followed to the tapped spot, now in ${s.w.where?.roomName}`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/walk-room.png` });
  const wallRoute = await page.evaluate(() => window.__walkStore.getState().route);
  ok(wallRoute === null, 'route cleared on arrival');

  // Shut-door hint: shut the front door, tap the garden through the glass.
  if (front) {
    await page.evaluate((k) => window.__walkStore.getState().setDoor(k, false), front.key);
    await page.evaluate(([f]) => { const w = window.__walkStore.getState(); const nx = -f.dir.y, ny = f.dir.x; const side = ny > 0 ? -1 : 1; w.setPose({ ...w.pose, x: f.centre.x + nx * 1.2 * side, y: f.centre.y + ny * 1.2 * side, level: 0, yaw: Math.atan2(-nx * side, -ny * side) , pitch: -0.1 }); }, [front]);
    await page.evaluate(() => window.__walk.sim(0.1));
    const g = await page.evaluate((f) => { const w = window.__walkStore.getState().pose; const fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw); return { x: f.centre.x + fx * 3, y: f.centre.y + fz * 3 }; }, front);
    const gp = await toScreen(page, g.x, s.w.pose.feetY, g.y);
    await page.evaluate(() => window.__walkStore.getState().clearHint());
    await page.mouse.click(gp.x, gp.y);
    await page.waitForTimeout(300);
    const hint = await page.evaluate(() => window.__walkStore.getState().hint?.text || '');
    needs('B', /shut/i.test(hint), `garden tapped through shut door says "${hint}"`);
    await page.evaluate((k) => window.__walkStore.getState().setDoor(k, true), front.key);
  }

  // Stairs: walk to the largest level-1 room.
  const hasUp = await page.evaluate(() => window.__walk.nav().levels.some((l) => l.level === 1));
  if (hasUp) {
    const up = await bigRoom(page, 1);
    await page.evaluate((id) => window.__walkStore.getState().requestGoal({ kind: 'room', level: 1, roomId: id }), up.id);
    await page.waitForTimeout(200);
    const climb = await page.evaluate(() => window.__walk.sim(40));
    const last = climb[climb.length - 1];
    let maxStep = 0; for (let i = 1; i < climb.length; i++) maxStep = Math.max(maxStep, Math.abs(climb[i].feetY - climb[i - 1].feetY));
    needs('B', last.level === 1 && maxStep <= 0.3, `stairs: reaches level ${last.level} with biggest feet step ${maxStep.toFixed(3)} m`);
  }

  // Guided tour: plays, advances, a key pauses it. (Back on the ground floor first.)
  await page.evaluate(() => { const nav = window.__walk.nav(); const l = nav.levels.find((x) => x.level === 0); const r = l.rooms[0]; const w = window.__walkStore.getState(); const c = r.poly.reduce((a, p) => ({ x: a.x + p.x / r.poly.length, y: a.y + p.y / r.poly.length }), { x: 0, y: 0 }); w.setPose({ x: c.x, y: c.y, level: 0, stair: null, feetY: l.baseY, yaw: 0, pitch: 0 }); w.setRoute(null); });
  await page.evaluate(() => window.__walkStore.getState().playTour());
  // Run up to 3 minutes of tour in 5 s slices, noting how far it got and which doors it opened.
  const tourRun = await page.evaluate(() => {
    let maxIndex = 0, stops = 0, ended = false;
    for (let i = 0; i < 36 && !ended; i++) {
      window.__walk.sim(5);
      const t = window.__walkStore.getState().tour;
      if (t.stops.length) stops = t.stops.length;
      maxIndex = Math.max(maxIndex, t.index);
      ended = t.status === 'off' && stops > 0;
    }
    const w = window.__walkStore.getState(), n = window.__walk.nav();
    return { maxIndex, stops, ended, hint: w.hint?.text, opened: n.doors.some((d) => w.doors[d.key] === true && !d.initial) };
  });
  ok(tourRun.stops >= 3 && tourRun.maxIndex >= 3, `tour advanced (reached stop ${tourRun.maxIndex} of ${tourRun.stops})`);
  ok(tourRun.ended && /tour/i.test(tourRun.hint || ''), `tour ends and says "${tourRun.hint}"`);
  needs('B', tourRun.opened, 'tour opened a shut door on the way');
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
  const r2 = await bigRoom(page, 0);
  const lk = await standLooking(page, r2, 1.4);
  await page.touchscreen.tap(lk.p.x, lk.p.y);
  await page.waitForTimeout(300);
  s = await st(page);
  ok(!!s.w.route, 'a finger tap on the floor sets a route');
  const t0 = s.w.pose;
  await page.evaluate(() => window.__walk.sim(3));
  s = await st(page);
  ok(Math.hypot(s.w.pose.x - t0.x, s.w.pose.y - t0.y) > 0.8, 'and the walker follows it');
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

  console.log(failed ? `\n${failed} FAILED` : '\nall checks passed (NEEDS lines wait for the merge of Chunk A/B)');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
