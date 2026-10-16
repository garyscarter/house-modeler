// Passcode-protected static server for the built app (dist/). Node built-ins only.
//
//   npm run build && PASSCODE=... npm start
//
// Environment: PASSCODE (required, 4+ characters), SESSION_SECRET (optional but
// recommended), PORT (default 10000).
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
  passcodeMatches,
  resolveSafePath,
  safeRedirectTarget,
  sessionCookie,
  verifySessionToken,
} from "./auth.mjs";
import { renderLoginPage } from "./page.mjs";

const PASSCODE = process.env.PASSCODE;
if (typeof PASSCODE !== "string" || PASSCODE.length < MIN_PASSCODE_LENGTH) {
  console.error(
    `Refusing to start: set the PASSCODE environment variable to a passcode of at least ${MIN_PASSCODE_LENGTH} characters.`,
  );
  process.exit(1);
}

let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  SESSION_SECRET = randomBytes(32).toString("hex");
  console.warn("SESSION_SECRET is not set: generated a random one, so everyone is logged out whenever the server restarts.");
}
const KEY = deriveKey(SESSION_SECRET, PASSCODE);

const PORT = Number(process.env.PORT) || 10000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
if (!fs.existsSync(path.join(ROOT, "index.html"))) {
  console.warn(`Warning: ${path.join(ROOT, "index.html")} not found. Run "npm run build" first.`);
}

const MAX_BODY_BYTES = 4096;
const perIp = new RateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
// Backstop in case a client spoofs x-forwarded-for to dodge the per-address limit.
const overall = new RateLimiter({ limit: 200, windowMs: 15 * 60 * 1000 });

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

function isAuthenticated(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  return token !== undefined && verifySessionToken(token, KEY);
}

function wantsHtml(req) {
  return String(req.headers.accept ?? "").includes("text/html");
}

function readForm(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Body too large"), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(new URLSearchParams(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });
}

async function handleLogin(req, res) {
  const ip = clientIp(req.headers, req.socket.remoteAddress);
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

  if (!passcodeMatches(form.get("passcode") ?? "", PASSCODE)) {
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
    "Set-Cookie": sessionCookie(createSessionToken(KEY), { secure: isSecure(req) }),
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

function serveStatic(req, res, pathname) {
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

    if (method !== "GET" && method !== "HEAD") {
      send(res, 405, "", { Allow: "GET, HEAD, POST", "Cache-Control": "no-store" });
      return;
    }

    const authed = isAuthenticated(req);

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

    serveStatic(req, res, pathname);
  } catch (err) {
    console.error("Request failed:", err?.message ?? err);
    if (!res.headersSent) send(res, 500, "", { "Cache-Control": "no-store" });
    else res.destroy();
  }
});

server.requestTimeout = 60_000;
server.headersTimeout = 20_000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`House Modeler listening on port ${PORT}, serving ${ROOT}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
