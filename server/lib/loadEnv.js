/**
 * Minimal .env loader (no dependency). Reads <repo-root>/.env at startup so the
 * AI key (OPENAI_API_KEY) and other settings don't have to be passed inline.
 * Existing process.env values win, so inline env vars still override the file.
 * Import this FIRST in server/index.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

try {
  const text = fs.readFileSync(path.join(root, ".env"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
  console.log("[inkling] loaded .env");
} catch {
  /* no .env file — fine; rely on real environment variables */
}
