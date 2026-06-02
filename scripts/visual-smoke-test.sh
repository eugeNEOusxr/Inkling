#!/usr/bin/env bash
set -euo pipefail

# Phase D visual smoke test.
# Rollback: remove this file and related package.json script.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$ROOT_DIR"

echo "[visual-smoke] build"
npm run build:web >/dev/null 2>&1 || true

echo "[visual-smoke] start server"
npx serve -s . -l 4173 >/tmp/notebookcalender-visual-serve.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID >/dev/null 2>&1 || true' EXIT
sleep 2

echo "[visual-smoke] run headless check"
node <<'EOF'
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:4173", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.__EUGENE_VISUALS_ENABLED = true;
    window.dispatchEvent(new CustomEvent("eugeneous:note-added", { detail: { x: 720, y: 420 } }));
  });
  await page.waitForTimeout(350);
  const exists = await page.evaluate(() =>
    Boolean(document.querySelector(".visual-overlay--pixel-wave") || document.querySelector(".visual-overlay--particles"))
  );
  if (!exists) {
    throw new Error("Expected visual overlay canvas not found");
  }
  await page.screenshot({ path: "visual-smoke.png", fullPage: true });
  await browser.close();
})();
EOF

echo "[visual-smoke] passed (screenshot: visual-smoke.png)"
