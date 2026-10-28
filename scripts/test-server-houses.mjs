// Per-house passcodes on the server (docs/onboarding-plan.md §7 check 4). Builds nothing: run `npm run build` first.
// Starts server/server.mjs on a free port with two passcodes and a temporary DATA_DIR, signs in with each, and checks
// that each code opens its own house (meta tag, /api/me), that each house's project is saved to its own file, that
// anonymous API calls are refused and that the login page carries no house tag.
// Usage: node scripts/test-server-houses.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "storey-houses-"));
const port = 10000 + Math.floor(Math.random() * 20000);
const defaultHouse = JSON.parse(fs.readFileSync(path.join(root, "src/houses/default.json"), "utf8")).id;
const A = { house: defaultHouse, code: "abcdefghij" };
const B = { house: "_template", code: "klmnopqrst" };
let failed = 0;
const ok = (cond, msg) => {
  console.log((cond ? "PASS " : "FAIL ") + msg);
  if (!cond) failed++;
};

const server = spawn(process.execPath, [path.join(root, "server/server.mjs")], {
  env: { ...process.env, PORT: String(port), PASSCODES: `${A.house}=${A.code}, ${B.house}=${B.code}`, SESSION_SECRET: "test-secret", DATA_DIR: dataDir, TRUSTED_PROXY_HOPS: "0" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));

const base = `http://127.0.0.1:${port}`;
async function waitUp() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/healthz`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`server did not start:\n${log}`);
}

async function login(code) {
  const r = await fetch(`${base}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: base },
    body: new URLSearchParams({ passcode: code, next: "/" }),
  });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  return { status: r.status, cookie };
}
const get = (p, cookie) => fetch(`${base}${p}`, { headers: cookie ? { Cookie: cookie } : {} });
const metaOf = (html) => /<meta name="storey-house" content="([^"]*)">/.exec(html)?.[1];

try {
  await waitUp();

  const anon = await get("/api/me");
  ok(anon.status === 401, "anonymous /api/me is refused");
  const loginPage = await (await get("/login")).text();
  ok(!metaOf(loginPage), "the login page carries no house tag");

  const wrong = await login("not-a-code");
  ok(wrong.status === 401 && !wrong.cookie, "a wrong passcode is refused");

  for (const who of [A, B]) {
    const s = await login(who.code);
    ok(s.status === 303 && s.cookie.startsWith("hm_session="), `${who.house}: the passcode signs in`);
    const me = await (await get("/api/me", s.cookie)).json();
    ok(me.house === who.house, `${who.house}: /api/me names the house (${me.house})`);
    const html = await (await get("/", s.cookie)).text();
    ok(metaOf(html) === who.house, `${who.house}: index.html carries its house tag (${metaOf(html)})`);
    const put = await fetch(`${base}/api/project`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: s.cookie, Origin: base },
      body: JSON.stringify({ baseRevision: 0, data: { version: 1, variants: {}, photos: [], sites: {}, marker: who.house } }),
    });
    ok(put.ok, `${who.house}: PUT /api/project is accepted (${put.status})`);
    const back = await (await get("/api/project", s.cookie)).json();
    ok(back?.data?.marker === who.house, `${who.house}: GET /api/project returns its own project`);
  }

  const files = fs.readdirSync(dataDir).sort();
  ok(files.includes("project.json"), "the default house saves to project.json");
  ok(files.includes(`project-${B.house}.json`), `the other house saves to project-${B.house}.json`);
  const a = JSON.parse(fs.readFileSync(path.join(dataDir, "project.json"), "utf8"));
  const b = JSON.parse(fs.readFileSync(path.join(dataDir, `project-${B.house}.json`), "utf8"));
  const marker = (p) => p?.data?.marker ?? p?.marker;
  ok(marker(a) === A.house && marker(b) === B.house, "each file holds its own house's project");
} catch (e) {
  console.log("FAIL " + (e?.message ?? e));
  failed++;
} finally {
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
