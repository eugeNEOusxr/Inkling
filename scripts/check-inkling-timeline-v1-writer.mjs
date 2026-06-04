/**
 * CI guard (Milestone 1.4.8): only timelineModel.js may write `inkling-timeline-v1`.
 * Does not restrict other localStorage keys (mode, theme, federation stores, etc.).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const ALLOWED = "src/wordweaver/timelineModel.js";
const KEY_PATTERN = /localStorage\.setItem\s*\(\s*["']inkling-timeline-v1["']/;

/** @param {string} dir */
function walk(dir) {
  /** @type {string[]} */
  const hits = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".git" || ent.name === "dist") continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      hits.push(...walk(full));
      continue;
    }
    if (!/\.(js|mjs|cjs|ts|tsx)$/.test(ent.name)) continue;
    const rel = relative(ROOT, full).replace(/\\/g, "/");
    if (rel === ALLOWED) continue;
    const text = readFileSync(full, "utf8");
    if (KEY_PATTERN.test(text)) hits.push(rel);
  }
  return hits;
}

const violations = walk(join(ROOT, "src"));
if (violations.length) {
  console.error(
    "[check-inkling-timeline-v1-writer] Forbidden direct writers of inkling-timeline-v1:\n" +
      violations.map((p) => `  - ${p}`).join("\n") +
      `\n\nOnly ${ALLOWED} may write the canonical timeline event key.`
  );
  process.exit(1);
}

console.log("[check-inkling-timeline-v1-writer] OK — event key writes scoped to timelineModel.js");
