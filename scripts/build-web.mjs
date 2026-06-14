/**
 * Build static web assets into ./dist.
 *
 * Produces a fully static, host-anywhere bundle:
 *  - every root-level .html and .css the app references (not a hand-maintained subset)
 *  - the src/ and public/ trees
 *  - public/* flattened to the site root, so absolute paths (/assets, /fonts, /icons,
 *    /vendor) resolve on static hosts (GitHub Pages) that lack the dev server's /public rewrite
 *  - a .nojekyll marker so GitHub Pages serves every path verbatim
 *
 * Used by both Tauri packaging and the GitHub Pages deploy.
 * Rollback: remove this file and restore the package.json build:web script.
 */
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

// Non-page web files that have no .html/.css extension but must ship.
const explicitRootFiles = ["manifest.json", "service-worker.js", "inkling-config.js"];

// Top-level directories served by the app (skipped silently if absent).
// NOTE: the root data/ dir is the backend's USER-ACCOUNT store (emails, password
// hashes, IPs) — it must never ship to a static/public host. The only client-facing
// data file (word-neighborhood.json) is sourced from public/data/ via the flatten below.
// `.github` carries the keep-warm Actions cron that ships to the Pages repo so it
// runs on `main` and keeps the free-tier backend awake (instant login).
const dirsToCopy = ["src", "public", "assets", "icons", "fonts", "vendor", ".github"];

async function rmrf(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function copyRecursive(from, to) {
  let stat;
  try {
    stat = await fs.stat(from);
  } catch {
    return; // source missing — skip
  }
  if (stat.isDirectory()) {
    await fs.mkdir(to, { recursive: true });
    for (const child of await fs.readdir(from)) {
      await copyRecursive(path.join(from, child), path.join(to, child));
    }
    return;
  }
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

await rmrf(dist);
await fs.mkdir(dist, { recursive: true });

// 1) Every root-level page + stylesheet the app references, plus the explicit non-page files.
const rootEntries = await fs.readdir(root, { withFileTypes: true });
const rootFiles = new Set(
  rootEntries
    .filter((e) => e.isFile() && /\.(html|css)$/i.test(e.name))
    .map((e) => e.name)
);
for (const name of explicitRootFiles) rootFiles.add(name);
for (const name of rootFiles) {
  await copyRecursive(path.join(root, name), path.join(dist, name));
}

// 2) Top-level web directories.
for (const dir of dirsToCopy) {
  await copyRecursive(path.join(root, dir), path.join(dist, dir));
}

// 3) Flatten public/* to the site root for static hosting (no /public rewrite there).
const publicDir = path.join(root, "public");
try {
  for (const child of await fs.readdir(publicDir)) {
    await copyRecursive(path.join(publicDir, child), path.join(dist, child));
  }
} catch {
  // no public/ dir — fine
}

// 4) Stamp a UNIQUE service-worker cache version per build. The SW is cache-first
//    with skipWaiting + clients.claim, so a changed file auto-updates clients —
//    but only if the bytes change. Without this, CACHE_VERSION stays static and
//    users keep the old cached app after every deploy.
const swPath = path.join(dist, "service-worker.js");
try {
  let sw = await fs.readFile(swPath, "utf8");
  const stamp = `eugeneousxr-${Date.now()}`;
  const next = sw.replace(/const CACHE_VERSION = "[^"]*";/, `const CACHE_VERSION = "${stamp}";`);
  if (next !== sw) {
    await fs.writeFile(swPath, next, "utf8");
    console.log(`Stamped service-worker CACHE_VERSION = ${stamp}`);
  } else {
    console.warn("⚠ service-worker.js CACHE_VERSION not found — cache may not bust");
  }
} catch {
  /* no service-worker.js — fine */
}

// 5) GitHub Pages: serve every path verbatim (don't run Jekyll over the bundle).
await fs.writeFile(path.join(dist, ".nojekyll"), "");

console.log("Built static web assets to ./dist");
