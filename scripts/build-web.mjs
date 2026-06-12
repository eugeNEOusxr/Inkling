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
const dirsToCopy = ["src", "public", "assets", "data", "icons", "fonts", "vendor"];

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

// 4) GitHub Pages: serve every path verbatim (don't run Jekyll over the bundle).
await fs.writeFile(path.join(dist, ".nojekyll"), "");

console.log("Built static web assets to ./dist");
