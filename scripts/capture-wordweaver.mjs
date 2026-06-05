/**
 * Capture a REAL WebGL screenshot of the running app (default: the WordWeaver 3D view).
 * No more mockups — this drives a real headless browser against the live dev server.
 *
 * Usage:
 *   1) Start the app in one terminal:   npm run dev
 *   2) Capture in another:              npm run capture
 *      ...or with options:
 *        node scripts/capture-wordweaver.mjs --url http://localhost:3080/?tab=wordweaver \
 *             --out screenshots/ww.png --wait 4500 --mobile
 *
 * Flags / env:
 *   --url   (CAPTURE_URL)   page to load    [default http://localhost:3080/?tab=wordweaver]
 *   --out   (CAPTURE_OUT)   output png path [default screenshots/wordweaver-<timestamp>.png]
 *   --wait  (CAPTURE_WAIT)  ms to let the WebGL scene build/animate after load [default 4500]
 *   --mobile                use a mobile viewport + touch (to see the mobile flight controls)
 *
 * If launch fails with "Executable doesn't exist", run once: npx playwright install chromium
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const url = opt("url", process.env.CAPTURE_URL || "http://localhost:3080/?tab=wordweaver");
const waitMs = Number(opt("wait", process.env.CAPTURE_WAIT || 4500));
const mobile = flag("mobile");
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const out = opt("out", process.env.CAPTURE_OUT || `screenshots/wordweaver-${ts}.png`);

await mkdir(path.dirname(out), { recursive: true });

// SwiftShader gives reliable software WebGL in headless Chromium (no GPU needed).
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist"
  ]
});

const context = await browser.newContext(
  mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
);
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("  [page console.error]", m.text());
});

console.log(`→ loading ${url}  (${mobile ? "mobile" : "desktop"} viewport)`);
try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
} catch (e) {
  console.error(`✗ could not load ${url}\n  Is the dev server running?  (npm run dev)\n  ${e.message}`);
  await browser.close();
  process.exit(1);
}

// If the app shows the sign-in wall, take the guest path ("Continue without signing in"),
// then re-open the target view (the auth redirect may drop the ?tab= param).
const skip = page.locator("#auth-skip-login");
if (await skip.count().catch(() => 0)) {
  console.log("→ auth wall detected — clicking 'Continue without signing in'");
  await skip.first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
}

// Let the WebGL scene mount, build the grid, and render a frame or two.
await page.waitForTimeout(waitMs);

await page.screenshot({ path: out, fullPage: false });
console.log(`✓ saved ${out}`);
await browser.close();
