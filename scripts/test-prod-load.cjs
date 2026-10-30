// The production build loads, and keeps loading on refresh. Usage, against the passcode server:
//   npm run build && PASSCODE=testpass1234 PORT=10123 DATA_DIR=/tmp/storey-data TRUSTED_PROXY_HOPS=0 npm start
//   PORT=10123 PASSCODE=testpass1234 node scripts/test-prod-load.cjs
// Guards the start-up race where saved work finished loading before the app listened for it, leaving
// "Opening your project" on screen for good (seen only in the production build).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const base = `http://localhost:${process.env.PORT || 10123}`;
let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
  page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); failed++; });
  await page.goto(base + '/');
  await page.fill('input[type=password], input[name=passcode]', process.env.PASSCODE || 'testpass1234');
  await page.keyboard.press('Enter');
  const shell = () => page.waitForSelector('.welcome-tile, .dock', { timeout: 30000 }).then(() => true, () => false);
  ok(await shell(), 'first load opens the project');
  for (let i = 1; i <= 5; i++) {
    await page.reload();
    ok(await shell(), `refresh ${i} opens the project`);
  }
  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
