#!/usr/bin/env node
/**
 * Parity script for the 2D editors (plan and site): drives the real UI in headless Chromium and asserts the
 * store before and after every gesture. It is a state-assertion script (no screenshots); it prints one line per
 * check and exits non-zero if any check fails.
 *
 * Usage:   npx vite --port 5190            (in this checkout, in another terminal)
 *          node scripts/editor-regression.mjs --port 5190 [--only plan|site] [--grep text] [--perf]
 *          npm run regress:editors -- --port 5190
 *
 *   --port N      dev server port on localhost (default 5199)
 *   --url URL     full base URL instead of --port
 *   --only X      run just the `plan` or the `site` suite
 *   --grep TEXT   run just the checks whose name contains TEXT
 *   --perf        also run the perf checks (store writes during a corner drag)
 *
 * Test rooms, openings and fixtures are found from the loaded data (listing 91770873), never hard-coded.
 * A check marked `expected: "post-core"` describes the behaviour AFTER the editors move onto src/editor/core
 * (the unifications in docs/editor-core-plan.md section 1.8); it is skipped now and the chunk that makes it
 * true removes the marker.
 *
 * Two sections follow the helpers. Chunk A1 edits only the `PLAN SUITE`, Chunk B only the `SITE SUITE`.
 */
import { createRequire } from "node:module";

const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const BASE = opt("--url", `http://localhost:${opt("--port", "5199")}`);
const ONLY = opt("--only", null);
const GREP = opt("--grep", null);
const PERF = argv.includes("--perf");

// ---------------------------------------------------------------------------------------------------------------
// Page-side helpers, installed before the app loads as window.__reg. All geometry is in the editor's model frame
// (plan: floorplan image px; site: metres) and converted with the SVG's own screen matrix, so it works before and
// after the camera moves onto a layer transform (the transform is the identity at rest).
// ---------------------------------------------------------------------------------------------------------------
function installRegistry() {
  const reg = {
    st: () => window.__houseStore.getState(),
    svg: () => document.querySelector(".plan-canvas svg, .site-canvas > svg"),
    floor() {
      const s = reg.st();
      return s.variants[s.activeVariant].floors.find((f) => f.id === s.editFloorId);
    },
    site: () => reg.st().sites[reg.st().activeVariant],
    vb() {
      const svg = reg.svg();
      const v = svg.viewBox.baseVal;
      const r = svg.getBoundingClientRect();
      return { x: v.x, y: v.y, w: v.width, h: v.height, s: v.width / r.width, left: r.left, top: r.top, cw: r.width, ch: r.height };
    },
    toClient(p) {
      const svg = reg.svg();
      const pt = svg.createSVGPoint();
      pt.x = p.x;
      pt.y = p.y;
      const c = pt.matrixTransform(svg.getScreenCTM());
      return { x: c.x, y: c.y };
    },
    fromClient(c) {
      const svg = reg.svg();
      const pt = svg.createSVGPoint();
      pt.x = c.x;
      pt.y = c.y;
      const m = pt.matrixTransform(svg.getScreenCTM().inverse());
      return { x: m.x, y: m.y };
    },
    inside(poly, p) {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i];
        const b = poly[j];
        if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    },
    segDist(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    },
    /** A point well inside a polygon: far from its edges and from the given obstacles (each {x, y, r}). */
    interior(poly, obstacles = []) {
      const xs = poly.map((p) => p.x);
      const ys = poly.map((p) => p.y);
      const step = Math.max(2, (Math.max(...xs) - Math.min(...xs)) / 60);
      let best = null;
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
        for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
          const p = { x, y };
          if (!reg.inside(poly, p)) continue;
          let d = Infinity;
          for (let i = 0; i < poly.length; i++) d = Math.min(d, reg.segDist(p, poly[i], poly[(i + 1) % poly.length]));
          for (const o of obstacles) d = Math.min(d, Math.hypot(p.x - o.x, p.y - o.y) - o.r);
          if (!best || d > best.d) best = { x, y, d };
        }
      }
      return best;
    },
    /** Fixture centres with a generous radius, as obstacles for interior(). */
    fixtureObstacles(f) {
      return (f.fixtures ?? []).map((fx) => ({ x: fx.x, y: fx.y, r: Math.max(fx.w ?? 0.8, fx.d ?? 0.8) * f.pxPerM * 0.6 }));
    },
    /** Openings on edge i of a room: same orientation, within tol of its line and between its ends (as openingsOnEdge). */
    openingsOnEdge(f, room, i, tol) {
      const a = room.polygon[i];
      const b = room.polygon[(i + 1) % room.polygon.length];
      const o = Math.abs(a.y - b.y) <= 0.5 ? "h" : Math.abs(a.x - b.x) <= 0.5 ? "v" : null;
      if (!o) return [];
      const h = o === "h";
      const lo = Math.min(h ? a.x : a.y, h ? b.x : b.y);
      const hi = Math.max(h ? a.x : a.y, h ? b.x : b.y);
      return f.openings.filter((p) => {
        if (p.orientation !== o) return false;
        const perp = Math.abs(h ? p.y - a.y : p.x - a.x);
        const along = h ? p.x : p.y;
        return perp <= tol && along >= lo - tol && along <= hi + tol;
      });
    },
    /** Outward unit normal of edge i, by the winding. */
    outward(poly, i) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      let area = 0;
      for (let k = 0; k < poly.length; k++) {
        const q = poly[(k + 1) % poly.length];
        area += poly[k].x * q.y - q.x * poly[k].y;
      }
      const sign = area >= 0 ? 1 : -1;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      return { x: ((b.y - a.y) / len) * sign, y: (-(b.x - a.x) / len) * sign };
    },
    /**
     * The plan test subjects, found from the data: the first unlocked four-corner room with an axis-aligned edge that
     * carries an opening and has a clear stretch (away from openings, corners and the midpoint) to press on.
     */
    pickPlan() {
      const f = reg.floor();
      const ppm = f.pxPerM;
      const tol = (0.25 / 2) * ppm;
      for (const room of f.rooms) {
        if (room.locked || room.polygon.length !== 4) continue;
        for (let i = 0; i < 4; i++) {
          const a = room.polygon[i];
          const b = room.polygon[(i + 1) % 4];
          const ops = reg.openingsOnEdge(f, room, i, tol);
          if (!ops.length) continue;
          const h = Math.abs(a.y - b.y) <= 0.5;
          const lo = Math.min(h ? a.x : a.y, h ? b.x : b.y);
          const hi = Math.max(h ? a.x : a.y, h ? b.x : b.y);
          const mid = (lo + hi) / 2;
          const blocked = ops.map((o) => [(h ? o.x : o.y) - (o.widthM * ppm) / 2 - 3, (h ? o.x : o.y) + (o.widthM * ppm) / 2 + 3]);
          blocked.push([mid - 16, mid + 16], [lo - 99, lo + 14], [hi - 14, hi + 99]);
          blocked.sort((p, q) => p[0] - q[0]);
          let cur = lo;
          let best = null;
          for (const [s, e] of blocked) {
            if (s - cur >= 14 && (!best || s - cur > best[1] - best[0])) best = [cur, s];
            cur = Math.max(cur, e);
          }
          if (hi - cur >= 14 && (!best || hi - cur > best[1] - best[0])) best = [cur, hi];
          if (!best) continue;
          const along = (best[0] + best[1]) / 2;
          const press = h ? { x: along, y: a.y } : { x: a.x, y: along };
          return { roomId: room.id, edge: i, press, openings: ops.map((o) => o.id) };
        }
      }
      return null;
    },
    /** A room that shares a wall with the given room and can be knocked through (as lib/mergeRooms). */
    neighbourOf(roomId) {
      const f = reg.floor();
      const me = f.rooms.find((r) => r.id === roomId);
      const close = (a, b) => Math.abs(a - b) <= 6;
      for (const r of f.rooms) {
        if (r.id === me.id || r.locked) continue;
        for (let i = 0; i < me.polygon.length; i++) {
          const a = me.polygon[i];
          const b = me.polygon[(i + 1) % me.polygon.length];
          for (let j = 0; j < r.polygon.length; j++) {
            const c = r.polygon[j];
            const d = r.polygon[(j + 1) % r.polygon.length];
            const ah = close(a.y, b.y) && close(c.y, d.y) && close(a.y, c.y);
            const av = close(a.x, b.x) && close(c.x, d.x) && close(a.x, c.x);
            if (!(ah || av)) continue;
            const lo = Math.max(Math.min(ah ? a.x : a.y, ah ? b.x : b.y), Math.min(ah ? c.x : c.y, ah ? d.x : d.y));
            const hi = Math.min(Math.max(ah ? a.x : a.y, ah ? b.x : b.y), Math.max(ah ? c.x : c.y, ah ? d.x : d.y));
            if (hi - lo > 30) return r.id;
          }
        }
      }
      return null;
    },
  };
  window.__reg = reg;
}

// ---------------------------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------------------------
const results = [];
let browser;
let ctx;
let page;
let fresh = true;

class Skip extends Error {}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);
const jeq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: changed`);

async function check(suite, name, fn, { expected } = {}) {
  const full = `${suite} ${name}`;
  if (GREP && !full.includes(GREP)) return;
  if (expected === "post-core" && !GREP) {
    // Skipped unless asked for with --grep, so the chunk that makes it true can try it.
    results.push("skip");
    console.log(`SKIP ${full}  (expected: post-core; true only after the editors use the core)`);
    return;
  }
  const t0 = Date.now();
  try {
    await reset(suite);
    const detail = await fn();
    results.push("pass");
    console.log(`PASS ${full}${detail ? "  " + detail : ""}  (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push("fail");
    console.log(`FAIL ${full}  ${e.message.split("\n")[0]}`);
  }
}

async function launch() {
  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
}

async function newContext(opts = {}) {
  if (ctx) await ctx.close();
  ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, ...opts });
  await ctx.addInitScript(() => localStorage.setItem("house-modeler-panels", JSON.stringify({ state: { coachDone: true, quiet: true }, version: 0 })));
  await ctx.addInitScript(`(${installRegistry})()`);
  page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  fresh = true;
}

/** Load the house and show the suite's editor with a clean selection and a fitted camera. */
async function reset(suite) {
  if (fresh) {
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(() => window.__houseStore, null, { timeout: 120000 });
    await page.waitForTimeout(2000);
    fresh = false;
  }
  // Reload the house, then change mode and back: the editor drops its tool, selection and drag, and refits to the new floor.
  // (Switching to the 3D tab and back would also do it, but software GL makes the 3D view very slow.)
  await page.evaluate(async (suite) => {
    await (await import("/src/lib/presetActions.ts")).loadListing("current");
    window.__houseStore.getState().setMode(suite === "plan" ? "furnish" : "build");
  }, suite);
  await page.waitForTimeout(150);
  await page.evaluate((suite) => {
    const h = window.__houseStore;
    h.getState().setMode(suite === "plan" ? "build" : "plot");
    if (suite === "plan") h.setState({ tab: "plan", editFloorId: h.getState().variants.current.floors[0].id });
    else h.getState().setUi({ tab: "plan" });
  }, suite);
  await page.waitForSelector(suite === "plan" ? ".plan-canvas svg" : ".site-canvas > svg", { timeout: 30000 });
  // Wait for the camera to settle: the same viewBox on three polls in a row.
  let last = "";
  let same = 0;
  for (let i = 0; i < 100 && same < 3; i++) {
    await page.waitForTimeout(200);
    const vb = await page.evaluate(() => window.__reg.svg()?.getAttribute("viewBox") ?? "");
    same = vb === last && !vb.startsWith("0 0 1 1") && vb !== "" ? same + 1 : 0;
    last = vb;
  }
  assert(same >= 3, "the camera never settled");
}

const reg = (fn, arg) => page.evaluate(fn, arg);
const settle = (ms = 120) => page.waitForTimeout(ms);
const st = () => page.evaluate(() => {
  const s = window.__houseStore.getState();
  return { past: s.past.length, future: s.future.length, selectedRoomId: s.selectedRoomId, variants: JSON.stringify(s.variants), sites: JSON.stringify(s.sites) };
});
const floorNow = () => reg(() => window.__reg.floor());
const siteNow = () => reg(() => window.__reg.site());
const vbNow = () => reg(() => window.__reg.vb());
const toClient = (p) => page.evaluate((p) => window.__reg.toClient(p), p);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const rm = (f, id) => f.rooms.find((r) => r.id === id);

/** Press at `from`, move to `to` in n steps, optionally release. Returns an object to release later. */
async function drag(from, to, { alt = false, shift = false, steps = 10, release = true } = {}) {
  if (alt) await page.keyboard.down("Alt");
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // A short pause per step lets React render each move, as a hand on a mouse would.
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(40);
  const up = async () => {
    await page.mouse.up();
    if (shift) await page.keyboard.up("Shift");
    if (alt) await page.keyboard.up("Alt");
    await settle();
  };
  if (release) await up();
  return { up };
}
const dragBy = (from, d, o) => drag(from, { x: from.x + d.x, y: from.y + d.y }, o);

async function tap(p, { shift = false } = {}) {
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  await settle();
}

// ---------------------------------------------------------------------------------------------------------------
// ===== PLAN SUITE  (Chunk A1 edits only this section) ==========================================================
// ---------------------------------------------------------------------------------------------------------------
async function planSubjects() {
  const p = await reg(() => window.__reg.pickPlan());
  assert(p, "no four-corner room with a clear stretch on an edge that carries an opening");
  return p;
}
/** The interior point of a room, as client px. */
async function roomInterior(roomId) {
  return page.evaluate((roomId) => {
    const f = window.__reg.floor();
    const room = f.rooms.find((r) => r.id === roomId);
    return window.__reg.toClient(window.__reg.interior(room.polygon, window.__reg.fixtureObstacles(f)));
  }, roomId);
}
async function selectRoom(roomId) {
  await tap(await roomInterior(roomId));
  try {
    await page.waitForFunction((id) => window.__houseStore.getState().selectedRoomId === id, roomId, { timeout: 3000 });
  } catch {
    throw new Error("tapping the room interior did not select it");
  }
}
/** A point on the plain canvas near its top-left: not under a floating panel, and outside every room and wall by a margin. */
async function backgroundPoint() {
  const p = await reg(() => {
    const v = window.__reg.vb();
    const f = window.__reg.floor();
    const svg = window.__reg.svg();
    for (let dy = 20; dy < v.ch / 2; dy += 10) {
      for (let dx = 20; dx < v.cw / 2; dx += 10) {
        const c = { x: v.left + dx, y: v.top + dy };
        const el = document.elementFromPoint(c.x, c.y);
        if (!el || el.closest("svg") !== svg || el.closest("[data-fixture-id], .plan-hit, g.plan-handle")) continue;
        const m = window.__reg.fromClient(c);
        const clear = f.rooms.every((r) => !window.__reg.inside(r.polygon, m) && r.polygon.every((q, i) => window.__reg.segDist(m, q, r.polygon[(i + 1) % r.polygon.length]) > 30));
        if (clear) return c;
      }
    }
    return null;
  });
  assert(p, "no plain background point found on the canvas");
  return p;
}
async function cornerClient(roomId, i) {
  return page.evaluate(([roomId, i]) => window.__reg.toClient(window.__reg.floor().rooms.find((r) => r.id === roomId).polygon[i]), [roomId, i]);
}
const polyOf = async (roomId) => rm(await floorNow(), roomId).polygon;
const anchorState = (a, b, tol, msg) => near(a, b, tol, msg);

async function planSuite() {
  await newContext();

  await check("plan", "01 fit", async () => {
    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(400);
    await page.keyboard.press("f");
    await page.waitForTimeout(400);
    const r = await reg(() => {
      const v = window.__reg.vb();
      const f = window.__reg.floor();
      const card = document.querySelector(".inspector-card")?.getBoundingClientRect();
      const pts = f.rooms.flatMap((room) => room.polygon);
      const inVb = pts.every((p) => p.x >= v.x - 0.5 && p.x <= v.x + v.w + 0.5 && p.y >= v.y - 0.5 && p.y <= v.y + v.h + 0.5);
      const right = Math.max(...pts.map((p) => window.__reg.toClient(p).x));
      return { inVb, right, cardLeft: card ? card.left : null };
    });
    assert(r.inVb, "a room vertex is outside the viewBox after Fit");
    assert(r.cardLeft !== null, "no .inspector-card to measure against");
    assert(r.right < r.cardLeft, `right-most vertex ${r.right.toFixed(0)} is not left of the card ${r.cardLeft.toFixed(0)}`);
    return `right ${r.right.toFixed(0)} < card ${r.cardLeft.toFixed(0)}`;
  });

  await check("plan", "02 pan", async () => {
    const bg = await backgroundPoint();
    const before = await vbNow();
    const s0 = await st();
    await dragBy(bg, { x: 90, y: 40 });
    const after = await vbNow();
    const s1 = await st();
    near(after.x - before.x, -90 * before.s, before.s, "viewBox x");
    near(after.y - before.y, -40 * before.s, before.s, "viewBox y");
    near(after.w, before.w, 1e-6, "viewBox width");
    assert(s1.variants === s0.variants, "pan changed the model");
    assert(s1.past === s0.past, "pan made an undo step");
    return `dx ${(after.x - before.x).toFixed(1)}`;
  });

  await check("plan", "03 wheel zoom", async () => {
    const f = await floorNow();
    const room = f.rooms[0];
    const c = await toClient(room.polygon.reduce((a, p) => ({ x: a.x + p.x / room.polygon.length, y: a.y + p.y / room.polygon.length }), { x: 0, y: 0 }));
    const before = await vbNow();
    const m0 = await reg((c) => window.__reg.fromClient(c), c);
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(500);
    const after = await vbNow();
    assert(after.w < before.w, "viewBox did not shrink");
    const c1 = await toClient(m0);
    near(c1.x, c.x, 1, "model point under the cursor drifted in x");
    near(c1.y, c.y, 1, "model point under the cursor drifted in y");
    return `width ${before.w.toFixed(0)} -> ${after.w.toFixed(0)}`;
  });

  await check("plan", "04 select and hint", async () => {
    // The hint shows once per page load, for the first room selected: nothing before this check selects a room.
    const { roomId } = await planSubjects();
    await tap(await roomInterior(roomId));
    assert((await st()).selectedRoomId === roomId, "room not selected");
    await page.waitForFunction(() => document.querySelector(".plan-status")?.textContent?.includes("Right-click a room for more"), null, { timeout: 4000 });
  });

  await check("plan", "05 corner drag", async () => {
    const { roomId } = await planSubjects();
    await selectRoom(roomId);
    const poly0 = await polyOf(roomId);
    const s0 = await st();
    const v = await vbNow();
    await dragBy(await cornerClient(roomId, 0), { x: 30, y: 20 }, { alt: true });
    const poly1 = await polyOf(roomId);
    near(poly1[0].x - poly0[0].x, 30 * v.s, v.s, "dx");
    near(poly1[0].y - poly0[0].y, 20 * v.s, v.s, "dy");
    assert((await st()).past === s0.past + 1, "not exactly one undo step");
    await reg(() => window.__houseStore.getState().undo());
    jeq(await polyOf(roomId), poly0, "undo did not restore the polygon");
    await reg(() => window.__houseStore.getState().redo());
    jeq(await polyOf(roomId), poly1, "redo did not reapply");
  });

  await check("plan", "06 snap to another room's corner", async () => {
    const { roomId } = await planSubjects();
    await selectRoom(roomId);
    const target = await reg((roomId) => {
      const f = window.__reg.floor();
      const me = f.rooms.find((r) => r.id === roomId);
      const mine = me.polygon;
      const others = f.rooms.filter((r) => r.id !== roomId).flatMap((r) => r.polygon);
      const wallEnds = (f.walls ?? []).flatMap((w) => [w.a, w.b]);
      const all = [...others, ...wallEnds];
      // A corner of another room that is far from all of this room's own corners and from every other target.
      const ok = others.filter((c) => mine.every((m) => Math.hypot(m.x - c.x, m.y - c.y) > 60) && all.every((o) => (o.x === c.x && o.y === c.y) || Math.hypot(o.x - c.x, o.y - c.y) > 40));
      return ok[0] ?? null;
    }, roomId);
    assert(target, "no isolated corner of another room to snap to");
    const tc = await toClient(target);
    const v = await vbNow();
    await drag(await cornerClient(roomId, 0), { x: tc.x + 3, y: tc.y + 3 });
    const p = (await polyOf(roomId))[0];
    assert(p.x === target.x && p.y === target.y, `vertex ${p.x},${p.y} is not the corner ${target.x},${target.y} (s=${v.s.toFixed(2)})`);
  });

  await check("plan", "07 Esc cancels a corner drag", async () => {
    const { roomId } = await planSubjects();
    await selectRoom(roomId);
    const poly0 = await polyOf(roomId);
    const s0 = await st();
    const d = await dragBy(await cornerClient(roomId, 0), { x: 40, y: 0 }, { alt: true, release: false });
    assert(JSON.stringify(await polyOf(roomId)) !== JSON.stringify(poly0), "the drag did not move the corner before Esc");
    await page.keyboard.press("Escape");
    await d.up();
    jeq(await polyOf(roomId), poly0, "polygon not restored");
    const s1 = await st();
    assert(s1.past === s0.past, `past ${s0.past} -> ${s1.past}`);
    assert(s1.selectedRoomId === roomId, "room deselected");
  });

  await check("plan", "08 edge slide", async () => {
    const sub = await planSubjects();
    await selectRoom(sub.roomId);
    const f0 = await floorNow();
    const poly0 = rm(f0, sub.roomId).polygon;
    const n = await reg(([poly, i]) => window.__reg.outward(poly, i), [poly0, sub.edge]);
    const ops0 = f0.openings.filter((o) => sub.openings.includes(o.id));
    const s0 = await st();
    const v = await vbNow();
    const from = await toClient(sub.press);
    const d = await dragBy(from, { x: n.x * 40, y: n.y * 40 }, { alt: true, release: false });
    const status = await reg(() => document.querySelector(".plan-status")?.textContent ?? "");
    assert(status.includes("Drag to move the wall · Esc cancels"), `status was "${status}"`);
    await d.up();
    const f1 = await floorNow();
    const poly1 = rm(f1, sub.roomId).polygon;
    const j = (sub.edge + 1) % 4;
    const shift = { x: n.x * 40 * v.s, y: n.y * 40 * v.s };
    for (let k = 0; k < 4; k++) {
      const moved = k === sub.edge || k === j;
      near(poly1[k].x - poly0[k].x, moved ? shift.x : 0, v.s * 0.6, `corner ${k} dx`);
      near(poly1[k].y - poly0[k].y, moved ? shift.y : 0, v.s * 0.6, `corner ${k} dy`);
    }
    for (const o0 of ops0) {
      const o1 = f1.openings.find((o) => o.id === o0.id);
      near(o1.x - o0.x, shift.x, v.s * 0.6, `opening ${o0.kind} dx`);
      near(o1.y - o0.y, shift.y, v.s * 0.6, `opening ${o0.kind} dy`);
    }
    assert((await st()).past === s0.past + 1, "not exactly one undo step");
    return `${ops0.length} opening(s) moved with the wall`;
  });

  await check("plan", "09 midpoint insert (tap)", async () => {
    const { roomId } = await planSubjects();
    await selectRoom(roomId);
    const poly0 = await polyOf(roomId);
    const s0 = await st();
    const mid = lerp(poly0[1], poly0[2], 0.5);
    await tap(await toClient(mid));
    const poly1 = await polyOf(roomId);
    assert(poly1.length === poly0.length + 1, `corners ${poly0.length} -> ${poly1.length}`);
    near(poly1[2].x, mid.x, 0.5, "new corner x");
    near(poly1[2].y, mid.y, 0.5, "new corner y");
    assert((await st()).past === s0.past + 1, "not exactly one undo step");
    await reg(() => window.__houseStore.getState().undo());
    jeq(await polyOf(roomId), poly0, "undo did not remove the corner");
  });

  await check(
    "plan",
    "09b midpoint press and drag",
    async () => {
      const { roomId } = await planSubjects();
      await selectRoom(roomId);
      const poly0 = await polyOf(roomId);
      const v = await vbNow();
      const mid = lerp(poly0[1], poly0[2], 0.5);
      const from = await toClient(mid);
      const d = await dragBy(from, { x: 20, y: 0 }, { alt: true, release: false });
      const p = (await polyOf(roomId))[2];
      near(p.x, mid.x + 20 * v.s, v.s, "new corner x while dragging");
      await page.keyboard.press("Escape");
      await d.up();
      jeq(await polyOf(roomId), poly0, "Esc did not remove the new corner");
    },
    { expected: "post-core" },
  );

  await check("plan", "10 double-press removes a corner", async () => {
    const { roomId } = await planSubjects();
    await selectRoom(roomId);
    const poly0 = await polyOf(roomId);
    const mid = lerp(poly0[1], poly0[2], 0.5);
    await tap(await toClient(mid));
    assert((await polyOf(roomId)).length === poly0.length + 1, "setup: midpoint insert failed");
    await page.mouse.dblclick(...Object.values(await cornerClient(roomId, 2)));
    await settle(200);
    assert((await polyOf(roomId)).length === poly0.length, `corners ${(await polyOf(roomId)).length}, expected ${poly0.length}`);
    // On a triangle nothing is removed.
    await reg(([roomId]) => {
      const s = window.__houseStore.getState();
      const f = window.__reg.floor();
      s.updateRoom(s.activeVariant, f.id, roomId, { polygon: f.rooms.find((r) => r.id === roomId).polygon.slice(0, 3) });
    }, [roomId]);
    await settle(200);
    await page.mouse.dblclick(...Object.values(await cornerClient(roomId, 0)));
    await settle(200);
    assert((await polyOf(roomId)).length === 3, "a triangle lost a corner");
  });

  await check("plan", "11 type an edge length", async () => {
    const { roomId } = await planSubjects();
    await selectRoom(roomId);
    const pick = await reg((roomId) => {
      const f = window.__reg.floor();
      const poly = f.rooms.find((r) => r.id === roomId).polygon;
      const labels = [...document.querySelectorAll(".plan-edge-label")];
      if (!labels.length) return null;
      const lb = labels[0].getBoundingClientRect();
      const c = { x: lb.x + lb.width / 2, y: lb.y + lb.height / 2 };
      let best = null;
      for (let i = 0; i < poly.length; i++) {
        const m = window.__reg.toClient({ x: (poly[i].x + poly[(i + 1) % poly.length].x) / 2, y: (poly[i].y + poly[(i + 1) % poly.length].y) / 2 });
        const d = Math.hypot(m.x - c.x, m.y - c.y);
        if (!best || d < best.d) best = { i, d };
      }
      return { edge: best.i, c };
    }, roomId);
    assert(pick, "no edge length chip is shown");
    await tap(pick.c);
    await page.waitForSelector(".edge-input input", { timeout: 3000 });
    const focused = await reg(() => document.activeElement?.closest(".edge-input") !== null);
    assert(focused, "the edge-length field is not focused");
    await page.keyboard.press("Control+a");
    await page.keyboard.type("3");
    await page.keyboard.press("Enter");
    await settle(200);
    const f = await floorNow();
    const poly = rm(f, roomId).polygon;
    const a = poly[pick.edge];
    const b = poly[(pick.edge + 1) % poly.length];
    near(Math.hypot(b.x - a.x, b.y - a.y) / f.pxPerM, 3, 0.005, `edge ${pick.edge} length (m)`);
  });

  await check("plan", "12 keyboard nudge", async () => {
    const { roomId } = await planSubjects();
    await selectRoom(roomId);
    const ppm = (await floorNow()).pxPerM;
    await tap(await cornerClient(roomId, 0));
    const x0 = (await polyOf(roomId))[0].x;
    await page.keyboard.press("ArrowRight");
    await settle();
    near((await polyOf(roomId))[0].x - x0, 0.01 * ppm, 1e-6, "ArrowRight step");
    await page.keyboard.press("Shift+ArrowRight");
    await settle();
    near((await polyOf(roomId))[0].x - x0, 0.11 * ppm, 1e-6, "Shift+ArrowRight step");
    // With focus in an inspector field the arrows belong to the field.
    const before = await polyOf(roomId);
    const input = page.locator(".inspector-card input").first();
    await input.focus();
    await page.keyboard.press("ArrowRight");
    await settle();
    jeq(await polyOf(roomId), before, "ArrowRight in an inspector input moved the corner");
  });

  await check("plan", "13 knock-through dialog", async () => {
    const { roomId } = await planSubjects();
    const nb = await reg((id) => window.__reg.neighbourOf(id), roomId);
    assert(nb, "no neighbouring room to knock through into");
    await selectRoom(roomId);
    const s0 = await st();
    await tap(await roomInterior(nb), { shift: true });
    await page.waitForSelector('[role="dialog"]', { timeout: 3000 });
    await page.keyboard.press("Escape");
    await settle(200);
    if (await page.locator('[role="dialog"]').count()) await page.locator('[role="dialog"] button', { hasText: /cancel/i }).first().click();
    await settle(200);
    assert((await page.locator('[role="dialog"]').count()) === 0, "the dialog did not close");
    assert((await st()).variants === s0.variants, "cancelling changed the model");
  });

  await check("plan", "14 opening drag", async () => {
    const info = await reg(() => {
      const f = window.__reg.floor();
      return f.openings.map((o, i) => ({ i, id: o.id, o: o.orientation, x: o.x, y: o.y }));
    });
    let moved = null;
    for (const cand of info) {
      const ox = await reg((i) => {
        const el = document.querySelectorAll(".plan-opening")[i];
        const b = el.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      }, cand.i);
      const top = await reg((c) => document.elementFromPoint(c.x, c.y)?.classList.contains("plan-opening"), ox);
      if (!top) continue;
      const s0 = await st();
      const v = await vbNow();
      for (const sign of [1, -1]) {
        await dragBy(ox, cand.o === "h" ? { x: 30 * sign, y: 0 } : { x: 0, y: 30 * sign });
        const o1 = (await floorNow()).openings.find((o) => o.id === cand.id);
        const along = cand.o === "h" ? o1.x - cand.x : o1.y - cand.y;
        const perp = cand.o === "h" ? o1.y - cand.y : o1.x - cand.x;
        if (Math.abs(along) > 0.5) {
          near(perp, 0, 1, "perpendicular drift (image px)");
          assert((await st()).past === s0.past + 1, "not exactly one undo step");
          moved = `${cand.o} opening moved ${along.toFixed(1)} px (s=${v.s.toFixed(2)})`;
          break;
        }
        const ox2 = await toClient({ x: cand.x, y: cand.y });
        ox.x = ox2.x;
        ox.y = ox2.y;
      }
      if (moved) break;
    }
    assert(moved, "no opening could be dragged along its wall");
    return moved;
  });

  await check("plan", "15 stairs drag", async () => {
    const f = await floorNow();
    if (!f.stairs) throw new Skip("this floor has no stairs");
    const s0 = await st();
    const c = await toClient(f.stairs);
    await dragBy(c, { x: 20, y: 0 });
    const f1 = await floorNow();
    assert(f1.stairs.x !== f.stairs.x, "stairs.x did not change");
    assert((await st()).past === s0.past + 1, "not exactly one undo step");
  });

  await check("plan", "16 context menu", async () => {
    const { roomId } = await planSubjects();
    const c = await roomInterior(roomId);
    await page.mouse.click(c.x, c.y, { button: "right" });
    await page.waitForSelector(".ctx-menu", { timeout: 3000 });
    let text = await page.locator(".ctx-menu").innerText();
    assert(text.includes("Rename…") && text.includes("Delete room"), `room menu was: ${text.replace(/\n/g, " | ")}`);
    await page.keyboard.press("Escape");
    await settle(200);
    assert((await page.locator(".ctx-menu").count()) === 0, "Escape did not close the menu");
    const bg = await backgroundPoint();
    await page.mouse.click(bg.x, bg.y, { button: "right" });
    await page.waitForSelector(".ctx-menu", { timeout: 3000 });
    text = await page.locator(".ctx-menu").innerText();
    assert(text.includes("Fit the rooms"), `background menu was: ${text.replace(/\n/g, " | ")}`);
  });

  await check("plan", "17 image three-state", async () => {
    const state = () => reg(() => {
      const p = window.__houseStore.getState().planImage;
      return !p.show ? "off" : p.opacity >= 0.5 ? "trace" : "faint";
    });
    const seq = [await state()];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("i");
      await settle(200);
      seq.push(await state());
    }
    assert(new Set(seq.slice(0, 3)).size === 3, `states ${seq.join(" > ")} are not off, faint and trace`);
    assert(seq[3] === seq[0], `the cycle did not return: ${seq.join(" > ")}`);
    return seq.join(" > ");
  });

  await check("plan", "18 quiet handles", async () => {
    const { roomId } = await planSubjects();
    await selectRoom(roomId);
    const bg = await backgroundPoint();
    await page.mouse.move(bg.x, bg.y);
    await settle(200);
    const r = await reg((roomId) => {
      const f = window.__reg.floor();
      const poly = f.rooms.find((r) => r.id === roomId).polygon;
      const wallEnds = (f.walls ?? []).flatMap((w) => [w.a, w.b]);
      const handles = [...document.querySelectorAll("g.plan-handle:not(.add)")].filter((g) => g.querySelectorAll(":scope > circle").length === 2);
      const rooms = handles.filter((g) => {
        const c = g.querySelector("circle");
        const p = { x: +c.getAttribute("cx"), y: +c.getAttribute("cy") };
        return !wallEnds.some((w) => Math.abs(w.x - p.x) < 0.01 && Math.abs(w.y - p.y) < 0.01);
      });
      return { handles: rooms.length, corners: poly.length };
    }, roomId);
    assert(r.handles === r.corners, `${r.handles} corner handles for ${r.corners} corners`);
  });

  await check("plan", "19 Furnish marquee", async () => {
    await reg(() => window.__houseStore.getState().setMode("furnish"));
    await settle(300);
    const sub = await reg(() => {
      const f = window.__reg.floor();
      const fx = f.fixtures.find((x) => !x.locked && document.querySelector(`[data-fixture-id="${x.id}"]`));
      const el = document.querySelector(`[data-fixture-id="${fx.id}"]`);
      const b = el.getBoundingClientRect();
      const pad = 5;
      const rect = { x0: b.left - pad, y0: b.top - pad, x1: b.right + pad, y1: b.bottom + pad };
      // Start the band on a corner of the rectangle that is on the background (no fixture under it).
      const starts = [[rect.x0, rect.y0, rect.x1, rect.y1], [rect.x1, rect.y1, rect.x0, rect.y0], [rect.x1, rect.y0, rect.x0, rect.y1], [rect.x0, rect.y1, rect.x1, rect.y0]];
      const start = starts.find(([x, y]) => !document.elementFromPoint(x, y)?.closest("[data-fixture-id]"));
      return { id: fx.id, start };
    });
    assert(sub.start, "every corner of the first fixture's box lies on another fixture");
    const [x0, y0, x1, y1] = sub.start;
    const expected = await reg(async ([x0, y0, x1, y1]) => {
      const { fixturesInRect, expandToGroups } = await import("/src/lib/fixtureGroups.ts");
      const { byId } = await import("/src/lib/catalogue.ts");
      const f = window.__reg.floor();
      const a = window.__reg.fromClient({ x: x0, y: y0 });
      const b = window.__reg.fromClient({ x: x1, y: y1 });
      return expandToGroups(fixturesInRect(f.fixtures.filter((fx) => byId(fx.type)), { x0: a.x, y0: a.y, x1: b.x, y1: b.y }), f.fixtures);
    }, sub.start);
    assert(expected.includes(sub.id), "the marquee would not even contain the first fixture");
    const before = (await floorNow()).fixtures.map((f) => f.id);
    await drag({ x: x0, y: y0 }, { x: x1, y: y1 }, { shift: true });
    await page.keyboard.press("Delete");
    await settle(200);
    const after = (await floorNow()).fixtures.map((f) => f.id);
    const removed = before.filter((id) => !after.includes(id)).sort();
    jeq(removed, [...expected].sort(), "removed fixtures differ from the marquee's");
    await reg(() => window.__houseStore.getState().undo());
    assert((await floorNow()).fixtures.length === before.length, "undo did not restore the fixtures");
    return `${expected.length} fixture(s)`;
  });

  const furnishFixture = async () => {
    await reg(() => window.__houseStore.getState().setMode("furnish"));
    await settle(300);
    const sub = await reg(() => {
      const f = window.__reg.floor();
      for (const fx of f.fixtures) {
        if (fx.locked) continue;
        const c = window.__reg.toClient({ x: fx.x, y: fx.y });
        if (document.elementFromPoint(c.x, c.y)?.closest("[data-fixture-id]")?.dataset.fixtureId === fx.id) return { id: fx.id, c, x: fx.x, y: fx.y, rot: fx.rot };
      }
      return null;
    });
    assert(sub, "no unlocked fixture is hittable at its centre");
    return sub;
  };

  await check("plan", "20 fixture move", async () => {
    const fx = await furnishFixture();
    const s0 = await st();
    const v = await vbNow();
    await dragBy(fx.c, { x: 40, y: 0 }, { alt: true });
    const f1 = (await floorNow()).fixtures.find((f) => f.id === fx.id);
    near(f1.x - fx.x, 40 * v.s, v.s, "dx");
    near(f1.y - fx.y, 0, v.s, "dy");
    assert((await st()).past === s0.past + 1, "not exactly one undo step");
  });

  await check("plan", "21 fixture rotate", async () => {
    const fx = await furnishFixture();
    await tap(fx.c);
    await page.keyboard.press("r");
    await settle(200);
    const rot = async () => (await floorNow()).fixtures.find((f) => f.id === fx.id).rot;
    const norm = (d) => ((d % 360) + 360) % 360;
    near(norm((await rot()) - fx.rot), 90, 1e-6, "R turn");
    const mid = await rot();
    await page.mouse.dblclick(fx.c.x, fx.c.y);
    await settle(250);
    near(norm((await rot()) - mid), 90, 1e-6, "double-click turn");
  });

  await check("plan", "22 pinch zoom (touch)", async () => {
    await newContext({ hasTouch: true });
    await reset("plan");
    const cdp = await ctx.newCDPSession(page);
    const v = await vbNow();
    const cx = v.left + 300;
    const cy = v.top + 300;
    const touch = async (type, a, b) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [a, b].filter(Boolean).map((p, id) => ({ x: p.x, y: p.y, id })) });
    await touch("touchStart", { x: cx - 50, y: cy }, { x: cx + 50, y: cy });
    for (let i = 1; i <= 10; i++) await touch("touchMove", { x: cx - 50 - i * 5, y: cy }, { x: cx + 50 + i * 5, y: cy });
    await touch("touchEnd");
    await settle(400);
    const after = await vbNow();
    const ratio = after.w / v.w;
    assert(ratio > 0.45 && ratio < 0.55, `viewBox width ratio ${ratio.toFixed(2)}, expected about 0.5`);
    await newContext();
    return `ratio ${ratio.toFixed(2)}`;
  });

  await check(
    "plan",
    "22b a second finger cancels a corner drag",
    async () => {
      const { roomId } = await planSubjects();
      await selectRoom(roomId);
      const poly0 = await polyOf(roomId);
      const s0 = await st();
      const d = await dragBy(await cornerClient(roomId, 0), { x: 40, y: 0 }, { alt: true, release: false });
      // A second pointer is simulated through a synthetic pointerdown with another id on the svg.
      await reg(() => {
        const svg = window.__reg.svg();
        svg.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 7, pointerType: "touch", isPrimary: false, bubbles: true, clientX: 300, clientY: 300 }));
      });
      await d.up();
      jeq(await polyOf(roomId), poly0, "the half-done drag was kept");
      assert((await st()).past === s0.past, "an undo step was left behind");
    },
    { expected: "post-core" },
  );

  await check(
    "plan",
    "23 window blur cancels a drag",
    async () => {
      const { roomId } = await planSubjects();
      await selectRoom(roomId);
      const poly0 = await polyOf(roomId);
      const d = await dragBy(await cornerClient(roomId, 0), { x: 40, y: 0 }, { alt: true, release: false });
      await reg(() => window.dispatchEvent(new Event("blur")));
      await d.up();
      jeq(await polyOf(roomId), poly0, "blur did not cancel the drag");
    },
    { expected: "post-core" },
  );

  if (PERF) {
    await check("plan", "perf 40-move corner drag writes the store at most 41 times", async () => {
      const { roomId } = await planSubjects();
      await selectRoom(roomId);
      await reg(() => {
        window.__writes = 0;
        window.__unsub = window.__houseStore.subscribe(() => window.__writes++);
      });
      const c = await cornerClient(roomId, 0);
      await dragBy(c, { x: 60, y: 30 }, { alt: true, steps: 40 });
      const n = await reg(() => {
        window.__unsub();
        return window.__writes;
      });
      assert(n <= 41, `${n} store writes`);
      return `${n} writes`;
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// ===== SITE SUITE  (Chunk B edits only this section) ===========================================================
// ---------------------------------------------------------------------------------------------------------------
async function siteSuite() {
  await newContext();
  // (filled in below)
}

// ---------------------------------------------------------------------------------------------------------------
await launch();
try {
  if (!ONLY || ONLY === "plan") await planSuite();
  if (!ONLY || ONLY === "site") await siteSuite();
} finally {
  await browser.close();
}
const count = (k) => results.filter((r) => r === k).length;
console.log(`\n${count("pass")} passed, ${count("fail")} failed, ${count("skip")} skipped`);
process.exit(count("fail") ? 1 : 0);
