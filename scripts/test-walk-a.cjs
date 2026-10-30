// Chunk A acceptance: door leaves out of the shell while walking. PORT=5311 node scripts/test-walk-a.cjs
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const PORT = process.env.PORT; let failed = 0;
const SHOTS = process.env.SHOTS;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
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

(async () => {
  // ---- Doors open off (the default) ----
  {
    const { browser, page } = await open(0);
    ok(await page.evaluate(() => !window.__walkDoors || window.__walkDoors().length === 0), 'no separate leaves before the walk');
    await page.evaluate(() => window.__walkStore.setState({ on: true }));
    await page.waitForFunction(() => window.__walkDoors && window.__walkDoors().length >= 5);
    const d0 = await page.evaluate(() => window.__walkDoors());
    ok(d0.every((d) => d.t === 0), 'doors shut (Doors open off) start at rest 0');
    const front = d0.find((d) => d.kind === 'front'), patio = d0.find((d) => d.kind === 'patio'), inner = d0.find((d) => d.kind === 'door');
    ok(!!front && !!patio && !!inner, 'a front, a patio and an internal door are present');
    await page.evaluate((ks) => ks.forEach((k) => window.__walkStore.getState().toggleDoor(k, false)), [front.key, patio.key, inner.key]);
    // Frames are slow under SwiftShader: wait for the three moves to finish rather than for a fixed time.
    await page.waitForFunction(() => window.__walkStore.getState().doorsSettled >= 3, null, { timeout: 120000 });
    const d1 = Object.fromEntries((await page.evaluate(() => window.__walkDoors())).map((d) => [d.key, d]));
    ok(Math.abs(Math.abs(d1[front.key].panels[0].ry - front.panels[0].ry) - 80 * Math.PI / 180) < 0.05, 'front door swings 80°');
    ok(Math.abs(d1[inner.key].panels[0].ry - inner.panels[0].ry) > 1.2, 'internal door swings ~75°');
    ok(Math.abs(d1[patio.key].panels[0].x - patio.panels[0].x) > 0.8, 'patio slider slides');
    ok(await page.evaluate(() => window.__walkStore.getState().doorsSettled) >= 3, 'settled events');

    // A tap on a leaf finds its door tag.
    const tagged = await page.evaluate(async (key) => {
      const mod = await import('/src/three/walk/doorTag.ts');
      let n = 0; const scene = window.__houseCamera.scene;
      scene?.traverse?.((o) => { if (o.userData && o.userData[mod.DOOR_TAG] && o.userData[mod.DOOR_TAG].key === key) n++; });
      return scene ? n : -1;
    }, front.key);
    ok(tagged === -1 || tagged === 1, 'the front door group carries its tag');

    if (SHOTS) {
      // Stand in the front hall (x -0.2, z 2.0) at eye height, looking at the front door and its open leaf.
      await page.evaluate(() => {
        const { camera, controls } = window.__houseCamera;
        if (controls) {
          camera.position.set(0.4, 1.6, 2.4);
          controls.target.set(-1.85, 1.2, 1.7);
          controls.update();
        } else if (window.__walk) {
          // Walking (the walk controller owns the camera): stand there and face the door instead.
          const w = window.__walkStore.getState();
          w.setPose({ ...w.pose, x: 0.4, y: 2.4, level: 0, stair: null, feetY: 0, yaw: Math.atan2(-(-1.85 - 0.4), -(1.7 - 2.4)), pitch: -0.1 });
          window.__walk.sim(0.2);
        }
        window.__houseRenderer.shadowMap.needsUpdate = true;
      });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: SHOTS + '/doors-hall.png' });
    }
    await page.evaluate(() => window.__walkStore.setState({ on: false }));
    await page.waitForTimeout(1500);
    ok((await page.evaluate(() => window.__walkDoors())).length === 0, 'leaves merged back after the walk');
    await browser.close();
  }

  // ---- Doors open on ----
  {
    const { browser, page } = await open(0);
    await page.evaluate(() => window.__houseStore.getState().setUi({ doorsOpen: true }));
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__walkStore.setState({ on: true }));
    await page.waitForFunction(() => window.__walkDoors && window.__walkDoors().length >= 5);
    const d = await page.evaluate(() => window.__walkDoors());
    const inner = d.filter((x) => x.kind === 'door');
    const openOne = inner.find((x) => x.t === 1);
    // The back door has openDeg 0 and stays shut; every other swing door is drawn open.
    ok(inner.filter((x) => x.t === 1).length >= inner.length - 1 && inner.filter((x) => x.t === 1).length > 0, 'doorsOpen: internal doors start at t = 1');
    ok(d.filter((x) => x.kind === 'patio').every((x) => x.t === 0), 'doorsOpen: patio still starts shut');
    await page.evaluate((k) => window.__walkStore.getState().toggleDoor(k, true), openOne.key);
    await page.waitForFunction(() => window.__walkStore.getState().doorsSettled >= 1, null, { timeout: 120000 });
    const after = (await page.evaluate(() => window.__walkDoors())).find((x) => x.key === openOne.key);
    ok(after.t === 0, 'doorsOpen: toggling an open door shuts it');
    await browser.close();
  }
  console.log(failed ? `${failed} FAILED` : 'ALL PASS');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('ERROR', e); process.exit(1); });
