/**
 * Regression guard: the WordWeaver/Writer timeline time-slot list (DayScroller in
 * inlineNotes/vertical mode) MUST stay vertically scrollable. This has been removed
 * repeatedly via fragile CSS overrides (a 4-file cascade), so the scroll is enforced
 * in JS (DayScroller._enableTouchScroll) with inline !important. This check fails if
 * that enforcement is deleted — so the scroll can't silently regress again.
 *
 * If this fails: re-add the `track.style.setProperty("overflow-y", "auto", "important")`
 * + `max-height` enforcement in src/calendar/ui/DayScroller.js. Do NOT "fix" it by
 * weakening this check.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const FILE = "src/calendar/ui/DayScroller.js";

const src = readFileSync(join(ROOT, FILE), "utf8");

/** @type {string[]} */
const missing = [];
if (!/setProperty\(\s*["']overflow-y["']\s*,\s*["']auto["']\s*,\s*["']important["']\s*\)/.test(src)) {
  missing.push('track.style.setProperty("overflow-y", "auto", "important")');
}
if (!/setProperty\(\s*["']max-height["']/.test(src)) {
  missing.push('track.style.setProperty("max-height", ...) bound');
}

if (missing.length) {
  console.error(
    "[check-dayscroller-scroll] Timeline time-slot scroll enforcement missing from " +
      FILE +
      ":\n" +
      missing.map((m) => `  - ${m}`).join("\n") +
      "\n\nThe time-slot list must stay scrollable. Re-add the JS enforcement in " +
      "DayScroller._enableTouchScroll (inline !important) rather than relying on CSS."
  );
  process.exit(1);
}

console.log("[check-dayscroller-scroll] OK — timeline time-slot scroll enforcement present");
