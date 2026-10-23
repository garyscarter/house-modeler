import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  RateLimiter,
  SESSION_SECONDS,
  clientIp,
  createSessionToken,
  deriveKey,
  parseCookies,
  passcodeMatches,
  resolveSafePath,
  safeRedirectTarget,
  sessionCookie,
  verifySessionToken,
} from "./auth.mjs";
import { renderLoginPage } from "./page.mjs";

const key = deriveKey("secret", "pass1234");
const NOW = 1_800_000_000_000;

describe("passcodeMatches", () => {
  it("accepts only the exact passcode", () => {
    expect(passcodeMatches("pass1234", "pass1234")).toBe(true);
    expect(passcodeMatches("pass123", "pass1234")).toBe(false);
    expect(passcodeMatches("pass12345", "pass1234")).toBe(false);
    expect(passcodeMatches("PASS1234", "pass1234")).toBe(false);
    expect(passcodeMatches("", "pass1234")).toBe(false);
    expect(passcodeMatches(undefined, "pass1234")).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips and lasts 30 days", () => {
    const token = createSessionToken(key, NOW);
    expect(token).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(verifySessionToken(token, key, NOW)).toBe(true);
    expect(verifySessionToken(token, key, NOW + (SESSION_SECONDS - 5) * 1000)).toBe(true);
    expect(verifySessionToken(token, key, NOW + (SESSION_SECONDS + 5) * 1000)).toBe(false);
  });

  it("rejects tampering", () => {
    const [expiry, sig] = createSessionToken(key, NOW).split(".");
    const flipped = sig.slice(0, 63) + (sig.endsWith("0") ? "1" : "0");
    expect(verifySessionToken(`${Number(expiry) + 1000}.${sig}`, key, NOW)).toBe(false);
    expect(verifySessionToken(`${expiry}.${flipped}`, key, NOW)).toBe(false);
    expect(verifySessionToken(`${expiry}.${sig.slice(0, 62)}`, key, NOW)).toBe(false);
    expect(verifySessionToken("", key, NOW)).toBe(false);
    expect(verifySessionToken("garbage", key, NOW)).toBe(false);
    expect(verifySessionToken(undefined, key, NOW)).toBe(false);
  });

  it("is invalidated by changing the passcode or the secret", () => {
    const token = createSessionToken(key, NOW);
    expect(verifySessionToken(token, deriveKey("secret", "other-pass"), NOW)).toBe(false);
    expect(verifySessionToken(token, deriveKey("other-secret", "pass1234"), NOW)).toBe(false);
  });
});

describe("cookies", () => {
  it("parses a Cookie header", () => {
    expect(parseCookies("a=1; hm_session=abc.def; b=x=y")).toMatchObject({ a: "1", hm_session: "abc.def", b: "x=y" });
    expect(Object.keys(parseCookies(undefined))).toEqual([]);
  });

  it("builds Set-Cookie headers", () => {
    const c = sessionCookie("tok", { secure: true });
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Secure");
    expect(c).toContain(`Max-Age=${SESSION_SECONDS}`);
    expect(sessionCookie("tok")).not.toContain("Secure");
    expect(sessionCookie(null)).toContain("Max-Age=0");
  });
});

describe("resolveSafePath", () => {
  const root = path.resolve("/srv/dist");
  it("maps normal paths inside the root", () => {
    expect(resolveSafePath(root, "/")).toBe(root);
    expect(resolveSafePath(root, "/assets/a.js?x=1")).toBe(path.join(root, "assets", "a.js"));
    expect(resolveSafePath(root, "/a%20b.png")).toBe(path.join(root, "a b.png"));
  });

  it("rejects traversal, null bytes, bad escapes and backslashes", () => {
    for (const bad of [
      "/../package.json",
      "/%2e%2e/package.json",
      "/assets/..%2f..%2fpackage.json",
      "/assets/%2E%2E/%2E%2E/etc/passwd",
      "/a/../../b",
      "/a%00b",
      "/%zz",
      "/a\\..\\b",
      "/a%5c..%5cb",
      "relative",
    ]) {
      expect(resolveSafePath(root, bad), bad).toBeNull();
    }
  });
});

describe("safeRedirectTarget", () => {
  it("keeps same-site relative paths", () => {
    expect(safeRedirectTarget("/")).toBe("/");
    expect(safeRedirectTarget("/some/route?x=1#h")).toBe("/some/route?x=1#h");
  });

  it("falls back to / for anything else", () => {
    for (const bad of [
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "evil",
      "",
      "/a\r\nSet-Cookie: x=1",
      "/login",
      "/logout?x",
      null,
      undefined,
      42,
    ]) {
      expect(safeRedirectTarget(bad), String(bad)).toBe("/");
    }
  });
});

describe("RateLimiter", () => {
  it("limits after N failures and recovers after the window", () => {
    const rl = new RateLimiter({ limit: 3, windowMs: 1000 });
    expect(rl.isLimited("ip", 0)).toBe(false);
    rl.recordFailure("ip", 0);
    rl.recordFailure("ip", 100);
    expect(rl.isLimited("ip", 200)).toBe(false);
    rl.recordFailure("ip", 200);
    expect(rl.isLimited("ip", 300)).toBe(true);
    expect(rl.isLimited("other", 300)).toBe(false);
    expect(rl.retryAfterSeconds("ip", 300)).toBe(1);
    expect(rl.isLimited("ip", 1050)).toBe(false);
  });

  it("can be reset and caps its memory", () => {
    const rl = new RateLimiter({ limit: 1, windowMs: 1000, maxKeys: 5 });
    rl.recordFailure("a", 0);
    expect(rl.isLimited("a", 1)).toBe(true);
    rl.reset("a");
    expect(rl.isLimited("a", 1)).toBe(false);
    for (let i = 0; i < 50; i++) rl.recordFailure(`k${i}`, 10);
    expect(rl.hits.size).toBeLessThanOrEqual(5);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for entry, else the socket", () => {
    expect(clientIp({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }, "127.0.0.1")).toBe("1.2.3.4");
    expect(clientIp({}, "127.0.0.1")).toBe("127.0.0.1");
    expect(clientIp({}, undefined)).toBe("unknown");
  });
});

describe("renderLoginPage", () => {
  it("has the form, escapes input and makes no external requests", () => {
    const html = renderLoginPage({ error: "Wrong <b>", next: '/x"><script>' });
    expect(html).toContain('autocomplete="current-password"');
    expect(html).toContain("<title>Storey</title>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).not.toMatch(/https?:\/\//);
    expect(renderLoginPage()).not.toContain('role="alert"');
  });
});
