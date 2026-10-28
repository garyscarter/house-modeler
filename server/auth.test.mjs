import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  RateLimiter,
  SESSION_SECONDS,
  clientIp,
  createSessionToken,
  deriveKey,
  houseForPasscode,
  injectHouseMeta,
  parsePasscodes,
  parseCookies,
  passcodeMatches,
  resolveSafePath,
  safeRedirectTarget,
  sessionCookie,
  verifySessionToken,
} from "./auth.mjs";
import { renderLoginPage } from "./page.mjs";

const key = deriveKey("secret", "pass1234", "home-a");
const keyFor = (house) => (house === "home-a" ? key : undefined);
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

describe("parsePasscodes", () => {
  it("reads one passcode per house, trimming whitespace", () => {
    const m = parsePasscodes({ PASSCODES: " home-a = abcdefghij , _template=klmnopqrst ," }, "home-a");
    expect([...m]).toEqual([
      ["home-a", "abcdefghij"],
      ["_template", "klmnopqrst"],
    ]);
  });
  it("falls back to PASSCODE for DEFAULT_HOUSE, or the default house", () => {
    expect([...parsePasscodes({ PASSCODE: "pass1234" }, "home-a")]).toEqual([["home-a", "pass1234"]]);
    expect([...parsePasscodes({ PASSCODE: "pass1234", DEFAULT_HOUSE: "home-b" }, "home-a")]).toEqual([["home-b", "pass1234"]]);
    expect(parsePasscodes({}, "home-a").size).toBe(0);
  });
  it("prefers PASSCODES over PASSCODE", () => {
    expect([...parsePasscodes({ PASSCODES: "home-b=abcdefghij", PASSCODE: "pass1234" }, "home-a")]).toEqual([["home-b", "abcdefghij"]]);
  });
  it("refuses malformed lists, bad ids, repeats and shared passcodes", () => {
    expect(() => parsePasscodes({ PASSCODES: "home-a" }, "x")).toThrow(/house>=<passcode/);
    expect(() => parsePasscodes({ PASSCODES: "home-a=a=b" }, "x")).toThrow();
    expect(() => parsePasscodes({ PASSCODES: "Home A=abcd" }, "x")).toThrow(/not a house id/);
    expect(() => parsePasscodes({ PASSCODES: "home-a=" }, "x")).toThrow(/no passcode/);
    expect(() => parsePasscodes({ PASSCODES: "home-a=abcd,home-a=efgh" }, "x")).toThrow(/twice/);
    expect(() => parsePasscodes({ PASSCODES: "home-a=abcd,home-b=abcd" }, "x")).toThrow(/share/);
  });
});

describe("houseForPasscode", () => {
  const map = new Map([
    ["home-a", "abcdefghij"],
    ["home-b", "klmnopqrst"],
  ]);
  it("names the house whose passcode it is", () => {
    expect(houseForPasscode("abcdefghij", map)).toBe("home-a");
    expect(houseForPasscode("klmnopqrst", map)).toBe("home-b");
    expect(houseForPasscode("nope", map)).toBeNull();
    expect(houseForPasscode(undefined, map)).toBeNull();
  });
});

describe("session tokens", () => {
  it("round-trips, names its house and lasts 30 days", () => {
    const token = createSessionToken("home-a", key, NOW);
    expect(token).toMatch(/^home-a\.\d+\.[0-9a-f]{64}$/);
    expect(verifySessionToken(token, keyFor, NOW)).toBe("home-a");
    expect(verifySessionToken(token, keyFor, NOW + (SESSION_SECONDS - 5) * 1000)).toBe("home-a");
    expect(verifySessionToken(token, keyFor, NOW + (SESSION_SECONDS + 5) * 1000)).toBeNull();
  });

  it("rejects tampering, including a changed house", () => {
    const [house, expiry, sig] = createSessionToken("home-a", key, NOW).split(".");
    const flipped = sig.slice(0, 63) + (sig.endsWith("0") ? "1" : "0");
    expect(verifySessionToken(`${house}.${Number(expiry) + 1000}.${sig}`, keyFor, NOW)).toBeNull();
    expect(verifySessionToken(`${house}.${expiry}.${flipped}`, keyFor, NOW)).toBeNull();
    expect(verifySessionToken(`${house}.${expiry}.${sig.slice(0, 62)}`, keyFor, NOW)).toBeNull();
    // Signed for home-a, presented as home-b (even with home-a's key on offer).
    expect(verifySessionToken(`home-b.${expiry}.${sig}`, () => key, NOW)).toBeNull();
    expect(verifySessionToken(`${expiry}.${sig}`, keyFor, NOW)).toBeNull();
    expect(verifySessionToken("", keyFor, NOW)).toBeNull();
    expect(verifySessionToken("garbage", keyFor, NOW)).toBeNull();
    expect(verifySessionToken(undefined, keyFor, NOW)).toBeNull();
  });

  it("is invalidated by changing that house's passcode or the secret, and only that house's", () => {
    const token = createSessionToken("home-a", key, NOW);
    expect(verifySessionToken(token, () => deriveKey("secret", "other-pass", "home-a"), NOW)).toBeNull();
    expect(verifySessionToken(token, () => deriveKey("other-secret", "pass1234", "home-a"), NOW)).toBeNull();
    const keyB = deriveKey("secret", "klmnopqrst", "home-b");
    const both = (h) => (h === "home-a" ? key : h === "home-b" ? deriveKey("secret", "new-pass-b", "home-b") : undefined);
    expect(verifySessionToken(token, both, NOW)).toBe("home-a");
    expect(verifySessionToken(createSessionToken("home-b", keyB, NOW), both, NOW)).toBeNull();
  });

  it("does not open a house the server no longer has", () => {
    expect(verifySessionToken(createSessionToken("home-a", key, NOW), () => undefined, NOW)).toBeNull();
  });
});

describe("injectHouseMeta", () => {
  it("adds the house meta tag right after <head>", () => {
    expect(injectHouseMeta('<!doctype html><html><head lang="en"><title>x</title></head></html>', "home-a")).toBe(
      '<!doctype html><html><head lang="en"><meta name="storey-house" content="home-a"><title>x</title></head></html>',
    );
    expect(injectHouseMeta("<head></head>", "bad id\"")).toBe("<head></head>");
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
  it("ignores x-forwarded-for with 0 hops and uses the n-th from the end otherwise", () => {
    const h = { "x-forwarded-for": "6.6.6.6, 1.2.3.4, 10.0.0.1" };
    expect(clientIp(h, "127.0.0.1", 0)).toBe("127.0.0.1");
    expect(clientIp(h, "127.0.0.1")).toBe("127.0.0.1");
    expect(clientIp(h, "127.0.0.1", 1)).toBe("10.0.0.1");
    expect(clientIp(h, "127.0.0.1", 2)).toBe("1.2.3.4");
    expect(clientIp(h, "127.0.0.1", 9)).toBe("127.0.0.1");
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
