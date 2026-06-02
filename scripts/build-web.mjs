/**
 * Build static web assets into ./dist for Tauri packaging.
 * Rollback: remove this file and restore package.json build:web script.
 */
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

const entriesToCopy = [
  "index.html",
  "style.css",
  "style-enhancements.css",
  "style-enhancements-layers.css",
  "manifest.json",
  "service-worker.js",
  "src",
  "public"
];

async function rmrf(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function copyRecursive(from, to) {
  const stat = await fs.stat(from);
  if (stat.isDirectory()) {
    await fs.mkdir(to, { recursive: true });
    const children = await fs.readdir(from);
    for (const child of children) {
      await copyRecursive(path.join(from, child), path.join(to, child));
    }
    return;
  }
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
}

await rmrf(dist);
await fs.mkdir(dist, { recursive: true });

for (const entry of entriesToCopy) {
  const from = path.join(root, entry);
  const to = path.join(dist, entry);
  await copyRecursive(from, to);
}

// Expose icon assets at site root (e.g. /icons/*) for manifest and app registry paths.
const distIcons = path.join(dist, "icons");
await fs.mkdir(distIcons, { recursive: true });
for (const iconsDir of [path.join(root, "public", "icons"), path.join(root, "icons")]) {
  try {
    const svgFiles = await fs.readdir(iconsDir);
    for (const name of svgFiles) {
      if (!name.endsWith(".svg") && !name.endsWith(".png")) continue;
      await fs.copyFile(path.join(iconsDir, name), path.join(distIcons, name));
    }
  } catch {
    // optional icons directory
  }
}

console.log("Built static web assets to ./dist");
