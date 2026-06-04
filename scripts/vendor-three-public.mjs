/**
 * Copy three.js into public/vendor/three for local dev (correct MIME, no CDN).
 */
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const threeRoot = path.join(root, "node_modules", "three");
const vendorRoot = path.join(root, "public", "vendor", "three");

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

try {
  await fs.access(path.join(threeRoot, "build", "three.module.js"));
} catch {
  console.error("[vendor-three] Run npm install first (three package missing).");
  process.exit(1);
}

await copyRecursive(path.join(threeRoot, "build"), path.join(vendorRoot, "build"));
await copyRecursive(path.join(threeRoot, "examples"), path.join(vendorRoot, "examples"));
console.log("[vendor-three] Copied to public/vendor/three");
