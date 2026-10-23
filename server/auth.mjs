// Pure helpers for the passcode server: no I/O, no globals, easy to test.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";

export const COOKIE_NAME = "hm_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
export const MIN_PASSCODE_LENGTH = 4;

/** SHA-256 digests are always 32 bytes, so timingSafeEqual never sees unequal lengths. */
function digest(value) {
  return createHash("sha256").update(String(value)).digest();
}

/** Constant-time passcode comparison (works for inputs of any length). */
export function passcodeMatches(input, passcode) {
  if (typeof input !== "string" || typeof passcode !== "string") return false;
  return timingSafeEqual(digest(input), digest(passcode));
}

/**
 * Signing key derived from both secrets, so changing either the passcode or the
 * session secret invalidates every existing session.
 */
export function deriveKey(secret, passcode) {
  return createHmac("sha256", String(secret)).update("house-modeler/session/v1\0").update(String(passcode)).digest();
}

function sign(key, expiry) {
  return createHmac("sha256", key).update(String(expiry)).digest("hex");
}

/** Cookie value: "<expiry as unix seconds>.<hex hmac>". */
export function createSessionToken(key, nowMs = Date.now(), ttlSeconds = SESSION_SECONDS) {
  const expiry = Math.floor(nowMs / 1000) + ttlSeconds;
  return `${expiry}.${sign(key, expiry)}`;
}

/** True only for a well-formed, correctly signed, unexpired token. */
export function verifySessionToken(token, key, nowMs = Date.now()) {
  if (typeof token !== "string" || token.length > 200) return false;
  const match = /^(\d{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!match) return false;
  const expiry = Number(match[1]);
  const given = Buffer.from(match[2], "hex");
  const expected = Buffer.from(sign(key, expiry), "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  return expiry > Math.floor(nowMs / 1000);
}

/** Parse a Cookie header into a plain object (later duplicates are ignored). */
export function parseCookies(header) {
  const out = Object.create(null);
  if (typeof header !== "string") return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!name || name in out) continue;
    let value = part.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    out[name] = value;
  }
  return out;
}

/** Set-Cookie header for a new session, or an expired one when token is null. */
export function sessionCookie(token, { secure = false, maxAge = SESSION_SECONDS } = {}) {
  const parts = [`${COOKIE_NAME}=${token ?? ""}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  parts.push(token ? `Max-Age=${maxAge}` : "Max-Age=0");
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/**
 * Map a request path to an absolute file inside `root`, or null if it is unsafe.
 * Rejects bad escapes, null bytes, backslashes, and any ".." segment outright
 * (rather than normalising it away).
 */
export function resolveSafePath(root, urlPath) {
  if (typeof urlPath !== "string") return null;
  let pathname = urlPath;
  const cut = pathname.search(/[?#]/);
  if (cut >= 0) pathname = pathname.slice(0, cut);
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\") || !decoded.startsWith("/")) return null;
  const segments = decoded.split("/");
  if (segments.some((s) => s === "..")) return null;
  const normalised = path.posix.normalize(decoded);
  const absRoot = path.resolve(root);
  const target = path.join(absRoot, ...normalised.split("/").filter(Boolean));
  if (target !== absRoot && !target.startsWith(absRoot + path.sep)) return null;
  return target;
}

/**
 * Only a same-site relative path is a valid post-login destination. Anything
 * else (absolute URLs, protocol-relative "//host", backslashes, control
 * characters, the login endpoints themselves) becomes "/".
 */
export function safeRedirectTarget(next) {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return "/";
  const pathOnly = next.split(/[?#]/)[0];
  if (pathOnly === "/login" || pathOnly === "/logout") return "/";
  try {
    const url = new URL(next, "http://placeholder.invalid");
    if (url.origin !== "http://placeholder.invalid") return "/";
  } catch {
    return "/";
  }
  return next;
}

/** Sliding-window limiter for failed attempts, keyed by string (e.g. client IP). */
export class RateLimiter {
  constructor({ limit = 10, windowMs = 15 * 60 * 1000, maxKeys = 10000 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.hits = new Map();
  }

  _recent(key, now) {
    const kept = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (kept.length) this.hits.set(key, kept);
    else this.hits.delete(key);
    return kept;
  }

  /** True when this key has used up its failed attempts. */
  isLimited(key, now = Date.now()) {
    return this._recent(key, now).length >= this.limit;
  }

  recordFailure(key, now = Date.now()) {
    const kept = this._recent(key, now);
    kept.push(now);
    this.hits.set(key, kept);
    if (this.hits.size > this.maxKeys) this.prune(now);
  }

  reset(key) {
    this.hits.delete(key);
  }

  /** Seconds until the oldest counted failure expires (for Retry-After). */
  retryAfterSeconds(key, now = Date.now()) {
    const kept = this._recent(key, now);
    if (!kept.length) return 0;
    return Math.max(1, Math.ceil((kept[0] + this.windowMs - now) / 1000));
  }

  prune(now = Date.now()) {
    for (const key of [...this.hits.keys()]) this._recent(key, now);
    // If still too large (an attacker rotating keys), drop the oldest entries.
    while (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value);
  }
}

/**
 * Client address. With `hops` = 0 the socket's address is used and x-forwarded-for is ignored.
 * With `hops` = n > 0 (n trusted proxies in front, each appending the address it saw), the
 * n-th entry from the end of x-forwarded-for is used; earlier entries are client-supplied.
 */
export function clientIp(headers, remoteAddress, hops = 0) {
  const forwarded = headers?.["x-forwarded-for"];
  if (hops > 0 && typeof forwarded === "string") {
    const list = forwarded.split(",").map((x) => x.trim());
    const entry = list[list.length - hops];
    if (entry && entry.length <= 64) return entry;
  }
  return remoteAddress || "unknown";
}
