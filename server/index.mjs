/**
 * Inkling dev server: static app + account / notification / feedback API.
 * Run: npm run dev
 */
import "./lib/loadEnv.js"; // must be first: populates process.env from .env
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT, DATA_DIR, PORT } from "./lib/config.js";
import { ensureDataDir } from "./lib/userStore.js";
import { handleApi } from "./routes/handleApi.js";
import { startScheduler, getVapidConfig } from "./lib/push/scheduler.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function isPathInsideRoot(filePath, rootDir) {
  const resolved = path.resolve(filePath);
  const root = path.resolve(rootDir);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

async function resolveStaticFile(pathname) {
  const rel = pathname.replace(/^\//, "");
  const candidates = [path.join(ROOT, rel), path.join(ROOT, "public", rel)];
  for (const candidate of candidates) {
    const filePath = path.normalize(candidate);
    if (!isPathInsideRoot(filePath, ROOT)) continue;
    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        const indexPath = path.join(filePath, "index.html");
        await fs.access(indexPath);
        return indexPath;
      }
      return filePath;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const data = await fs.readFile(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    // Dev server: never cache source/assets so a normal reload always loads the
    // latest JS/CSS (no stale ES modules). The static prod build is separate.
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
    Expires: "0"
  });
  res.end(data);
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/login.html";
  if (pathname === "/favicon.ico") {
    const icon =
      (await resolveStaticFile("/icons/notebookcalender.svg")) ??
      (await resolveStaticFile("/public/icons/notebookcalender.svg"));
    if (icon) return serveFile(res, icon);
  }
  const filePath = await resolveStaticFile(pathname);
  if (!filePath) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  return serveFile(res, filePath);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Inkling-Client");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    return handleApi(req, res, url);
  }
  return serveStatic(req, res, url);
});

await ensureDataDir();
server.listen(PORT, () => {
  console.log(`Inkling server http://localhost:${PORT}`);
  console.log(`  Login:    http://localhost:${PORT}/login.html`);
  console.log(`  App:      http://localhost:${PORT}/index.html`);
  console.log(`  Accounts: http://localhost:${PORT}/account-settings.html`);
  console.log(`  Email:    ${process.env.EMAIL_PROVIDER || "console"} provider`);
  if (getVapidConfig()) {
    startScheduler(Number(process.env.PUSH_SWEEP_MS) || 30000);
    console.log(`  Push:     VAPID configured — alarm scheduler running`);
  } else {
    console.log(`  Push:     VAPID keys not set (set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)`);
  }
});
