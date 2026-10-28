// Passcode-protected static server for the built app (dist/). Node built-ins only.
//
//   npm run build && PASSCODE=... npm start
//
// Environment: PASSCODES ("<house>=<code>,<house>=<code>", one passcode per house; the passcode picks the house) or
// PASSCODE (one passcode, for the house in DEFAULT_HOUSE, default the owner's; 4+ characters), SESSION_SECRET (optional but
// recommended), TRUSTED_PROXY_HOPS (proxies in front whose x-forwarded-for entries are
// trusted; default 1 for Render, 0 when reached directly), PORT (default 10000), DATA_DIR (where the shared project is saved;
// without it the saved project is lost on restart and the app is told so).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  COOKIE_NAME,
  MIN_PASSCODE_LENGTH,
  RateLimiter,
  clientIp,
  createSessionToken,
  deriveKey,
  parseCookies,
  houseForPasscode,
  injectHouseMeta,
  parsePasscodes,
  resolveSafePath,
  safeRedirectTarget,
  sessionCookie,
  verifySessionToken,
} from "./auth.mjs";
import { renderLoginPage } from "./page.mjs";
import { MAX_PROJECT_BODY_BYTES, createProjectStores, originMatchesHost, parsePutBody } from "./project.mjs";
import { DEFAULT_HOUSE_ID } from "./houses.mjs";

let PASSCODES;
try {
  PASSCODES = parsePasscodes(process.env, DEFAULT_HOUSE_ID);
} catch (err) {
  console.error(`Refusing to start: ${err.message}.`);
  process.exit(1);
}
if (!PASSCODES.size) {
  console.error("Refusing to start: set PASSCODES (<house>=<passcode>,…) or PASSCODE.");
  process.exit(1);
}
for (const [house, code] of PASSCODES) {
  if (code.length < MIN_PASSCODE_LENGTH) {
    console.error(`Refusing to start: the passcode for ${house} must be at least ${MIN_PASSCODE_LENGTH} characters.`);
    process.exit(1);
  }
}

let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  SESSION_SECRET = randomBytes(32).toString("hex");
  console.warn("SESSION_SECRET is not set: generated a random one, so everyone is logged out whenever the server restarts.");
}
for (const [house, code] of PASSCODES) {
  if (code.length < 10) console.warn(`The passcode for ${house} is shorter than 10 characters: consider a longer one, as the sign-in is open to the internet.`);
}
// Number of proxies in front of this server whose x-forwarded-for entries are trusted.
// Render adds one, so the default is 1; use 0 when the server is reached directly.
const hopsEnv = Number(process.env.TRUSTED_PROXY_HOPS);
const TRUSTED_PROXY_HOPS = process.env.TRUSTED_PROXY_HOPS !== undefined && Number.isInteger(hopsEnv) && hopsEnv >= 0 ? hopsEnv : 1;
/** One signing key per house, so changing one passcode signs out only that house. */
const KEYS = new Map([...PASSCODES].map(([house, code]) => [house, deriveKey(SESSION_SECRET, code, house)]));

const PORT = Number(process.env.PORT) || 10000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
if (!fs.existsSync(path.join(ROOT, "index.html"))) {
  console.warn(`Warning: ${path.join(ROOT, "index.html")} not found. Run "npm run build" first.`);
}

// DATA_DIR should be a persistent disk. Without it the copy lives next to the app and is
// wiped on every deploy, so the app is told "persistent: false" and says so in Settings.
const PERSISTENT = Boolean(process.env.DATA_DIR);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data"));
if (!PERSISTENT) {
  console.warn(
    "WARNING: DATA_DIR is not set, so the shared project is NOT permanent: it is lost on every deploy or restart. Attach a persistent disk and set DATA_DIR to its mount path.",
  );
}
const projects = createProjectStores(DATA_DIR, PASSCODES.keys(), DEFAULT_HOUSE_ID);
console.log(`Houses: ${[...PASSCODES.keys()].join(", ")}`);

const MAX_BODY_BYTES = 4096;
const perIp = new RateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
// Backstop (60 failures per hour in all) in case addresses are spoofed or rotated.
const overall = new RateLimiter({ limit: 60, windowMs: 60 * 60 * 1000 });

const PUBLIC_PATHS = new Set([
  "/healthz",
  "/favicon.ico",
  "/favicon-32.png",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/manifest.webmanifest",
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".hdr": "application/octet-stream",
  ".bin": "application/octet-stream",
  ".pdf": "application/pdf",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".map", ".txt", ".svg", ".gltf", ".wasm"]);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow",
  // The app only needs WebGL, file pickers and downloads: switch off everything else.
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()",
};

function isSecure(req) {
  const proto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim().toLowerCase();
  return proto === "https" || Boolean(req.socket.encrypted);
}

function send(res, status, body, headers = {}) {
  const buf = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...(buf ? { "Content-Length": buf.length } : { "Content-Length": 0 }),
    ...headers,
  });
  res.end(res.req.method === "HEAD" ? undefined : buf);
}

function sendHtml(res, status, html, headers = {}) {
  send(res, status, html, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers });
}

/** The house the request's session opens, or null when it is not signed in. */
function sessionHouse(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  return token === undefined ? null : verifySessionToken(token, (house) => KEYS.get(house));
}

function wantsHtml(req) {
  return String(req.headers.accept ?? "").includes("text/html");
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Body too large"), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const readForm = async (req) => new URLSearchParams(await readBody(req, MAX_BODY_BYTES));

function sendJson(res, status, body, headers = {}) {
  send(res, status, typeof body === "string" ? body : JSON.stringify(body), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
}

// /api/project: GET (?since=<revision> leaves the data out when nothing changed) and PUT.
async function handleProject(req, res, url, house) {
  const project = projects.get(house);
  const method = req.method ?? "GET";
  if (method === "GET" || method === "HEAD") {
    const meta = project.meta();
    if (!meta) return sendJson(res, 404, { error: "nothing saved yet", persistent: PERSISTENT });
    if (url.searchParams.get("since") === String(meta.revision)) return sendJson(res, 200, { ...meta, persistent: PERSISTENT });
    // The stored file is `{ revision, savedAt, data }`; add the flag without parsing the (large) data.
    const raw = project.readRaw();
    return sendJson(res, 200, `${raw.slice(0, -1)},"persistent":${PERSISTENT}}`);
  }
  if (method !== "PUT") return sendJson(res, 405, { error: "method not allowed" }, { Allow: "GET, HEAD, PUT" });
  if (!originMatchesHost(req.headers.origin, req.headers.host)) return sendJson(res, 403, { error: "bad origin" });
  let text;
  try {
    if (Number(req.headers["content-length"]) > MAX_PROJECT_BODY_BYTES) throw Object.assign(new Error("Body too large"), { status: 413 });
    text = await readBody(req, MAX_PROJECT_BODY_BYTES);
  } catch (err) {
    res.on("finish", () => req.destroy());
    return sendJson(res, err.status ?? 400, { error: "too large" }, { Connection: "close" });
  }
  const body = parsePutBody(text);
  if (!body) return sendJson(res, 400, { error: "not a project" });
  let result;
  try {
    result = project.save(body.baseRevision, body.data);
  } catch (err) {
    console.error("Saving the project failed:", err?.message ?? err);
    return sendJson(res, 500, { error: "could not save" });
  }
  const { ok, ...meta } = result;
  sendJson(res, ok ? 200 : 409, { ...meta, persistent: PERSISTENT });
}

async function handleLogin(req, res) {
  const ip = clientIp(req.headers, req.socket.remoteAddress, TRUSTED_PROXY_HOPS);
  let form;
  try {
    form = await readForm(req);
  } catch (err) {
    // Answer, then drop the connection so the rest of an oversized body is not read.
    res.on("finish", () => req.destroy());
    send(res, err.status ?? 400, "", { "Cache-Control": "no-store", Connection: "close" });
    return;
  }
  const next = safeRedirectTarget(form.get("next") ?? "/");

  if (perIp.isLimited(ip) || overall.isLimited("*")) {
    const wait = Math.max(perIp.retryAfterSeconds(ip), overall.isLimited("*") ? overall.retryAfterSeconds("*") : 0);
    sendHtml(
      res,
      429,
      renderLoginPage({ error: "Too many wrong passcodes. Please wait a few minutes and try again.", next }),
      { "Retry-After": String(wait || 60) },
    );
    return;
  }

  const house = houseForPasscode(form.get("passcode") ?? "", PASSCODES);
  if (!house) {
    perIp.recordFailure(ip);
    overall.recordFailure("*");
    console.warn(`Failed login from ${ip} at ${new Date().toISOString()}`);
    sendHtml(res, 401, renderLoginPage({ error: "That passcode is not right. Please try again.", next }));
    return;
  }

  perIp.reset(ip);
  send(res, 303, "", {
    Location: next,
    "Cache-Control": "no-store",
    "Set-Cookie": sessionCookie(createSessionToken(house, KEYS.get(house)), { secure: isSecure(req) }),
  });
}

function handleLogout(req, res) {
  send(res, 303, "", {
    Location: "/",
    "Cache-Control": "no-store",
    "Set-Cookie": sessionCookie(null, { secure: isSecure(req) }),
  });
}

// Compressed bytes are cached per file and invalidated when the file changes.
const gzipCache = new Map();

function acceptsGzip(req) {
  return /\bgzip\b/i.test(String(req.headers["accept-encoding"] ?? ""));
}

function statFile(file) {
  try {
    const st = fs.statSync(file);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

function serveFile(req, res, file, st) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  const isHtml = ext === ".html";
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const hashedAsset = rel.startsWith("assets/");
  const headers = {
    "Content-Type": type,
    "Cache-Control": hashedAsset ? "public, max-age=31536000, immutable" : isHtml ? "no-cache" : "public, max-age=3600",
  };
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  headers.ETag = etag;
  headers["Last-Modified"] = st.mtime.toUTCString();

  const compressible = COMPRESSIBLE.has(ext);
  if (compressible) headers.Vary = "Accept-Encoding";

  const inm = req.headers["if-none-match"];
  if (typeof inm === "string" && inm.split(",").some((t) => t.trim().replace(/^W\//, "") === etag)) {
    res.writeHead(304, { ...SECURITY_HEADERS, ...headers });
    res.end();
    return;
  }

  if (compressible && acceptsGzip(req) && st.size > 256) {
    let entry = gzipCache.get(file);
    if (!entry || entry.etag !== etag) {
      entry = { etag, bytes: zlib.gzipSync(fs.readFileSync(file), { level: 9 }) };
      gzipCache.set(file, entry);
    }
    send(res, 200, entry.bytes, { ...headers, "Content-Encoding": "gzip" });
    return;
  }

  res.writeHead(200, { ...SECURITY_HEADERS, ...headers, "Content-Length": st.size });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = fs.createReadStream(file);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

/** The app's page with the session's house pinned in a meta tag, so the app opens that house and hides switching. */
function serveIndex(req, res, file, house) {
  const html = injectHouseMeta(fs.readFileSync(file, "utf8"), house);
  const headers = { "Content-Type": MIME[".html"], "Cache-Control": "no-cache", Vary: "Accept-Encoding, Cookie" };
  if (acceptsGzip(req)) send(res, 200, zlib.gzipSync(html), { ...headers, "Content-Encoding": "gzip" });
  else send(res, 200, html, headers);
}

function serveStatic(req, res, pathname, house) {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // resolveSafePath refuses a bad escape below
  }
  if (/^\/api(\/|$)/i.test(decoded)) return sendJson(res, 404, { error: "not found" });
  const target = resolveSafePath(ROOT, pathname);
  if (!target) {
    send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return;
  }
  let file = target;
  let st = statFile(file);
  if (!st && fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    // No directory listings: a directory serves its index.html, if any.
    file = path.join(file, "index.html");
    st = statFile(file);
  }
  if (!st) {
    const looksLikeRoute = path.extname(pathname) === "";
    if (looksLikeRoute) {
      file = path.join(ROOT, "index.html");
      st = statFile(file);
    }
  }
  if (!st) {
    send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    return;
  }
  if (house && path.extname(file).toLowerCase() === ".html") return serveIndex(req, res, file, house);
  serveFile(req, res, file, st);
}

const server = http.createServer((req, res) => {
  res.req = req;
  try {
    const rawUrl = req.url ?? "/";
    const qIndex = rawUrl.search(/[?#]/);
    const pathname = qIndex < 0 ? rawUrl : rawUrl.slice(0, qIndex);
    const method = req.method ?? "GET";

    if (pathname === "/healthz" && (method === "GET" || method === "HEAD")) {
      send(res, 200, "ok", { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      return;
    }
    if (pathname === "/login" && method === "POST") {
      handleLogin(req, res).catch(() => send(res, 500, "", { "Cache-Control": "no-store" }));
      return;
    }
    if (pathname === "/logout" && (method === "GET" || method === "HEAD")) {
      handleLogout(req, res);
      return;
    }

    // The API never falls through to the static files or index.html.
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      const house = sessionHouse(req);
      if (!house) return sendJson(res, 401, { error: "sign in required" });
      // Which house this session's passcode opened.
      if (pathname === "/api/me" && (method === "GET" || method === "HEAD")) return sendJson(res, 200, { house });
      if (pathname !== "/api/project") return sendJson(res, 404, { error: "not found" });
      handleProject(req, res, new URL(rawUrl, "http://x"), house).catch((err) => {
        console.error("Project request failed:", err?.message ?? err);
        if (!res.headersSent) sendJson(res, 500, { error: "server error" });
        else res.destroy();
      });
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      send(res, 405, "", { Allow: "GET, HEAD, POST", "Cache-Control": "no-store" });
      return;
    }

    const house = sessionHouse(req);
    const authed = house !== null;

    if (!authed && !PUBLIC_PATHS.has(pathname)) {
      if (pathname === "/login" || wantsHtml(req)) {
        const next = pathname === "/login" ? "/" : safeRedirectTarget(rawUrl);
        sendHtml(res, pathname === "/login" ? 200 : 401, renderLoginPage({ next }));
      } else {
        send(res, 401, "", { "Cache-Control": "no-store" });
      }
      return;
    }

    if (authed && pathname === "/login") {
      send(res, 303, "", { Location: "/", "Cache-Control": "no-store" });
      return;
    }

    serveStatic(req, res, pathname, house);
  } catch (err) {
    console.error("Request failed:", err?.message ?? err);
    if (!res.headersSent) send(res, 500, "", { "Cache-Control": "no-store" });
    else res.destroy();
  }
});

server.requestTimeout = 180_000; // room for a slow upload of a project with a large floorplan image
server.headersTimeout = 20_000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Storey listening on port ${PORT}, serving ${ROOT}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
