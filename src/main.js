import "./wordweaver/calendarMode.js";
import { createScene } from "./scene.js";
import { CalendarApp } from "./calendar/CalendarApp.js";
import { requireAuthForApp, signOut } from "./auth/requireAuth.js";
import { getSession } from "./auth/session.js";
import { clearAuthSkip } from "./auth/authSkip.js";
import { scheduleCloudSync } from "./auth/cloudSync.js";
import { registerInklingTimelineBridge } from "./wordweaver/InklingTimelineBridge.js";
import { registerInklingApp } from "./App.js";
import "./MainUI.js";

const embedded = new URLSearchParams(window.location.search).has("embedded");
if (embedded) {
  document.body.classList.add("embedded-app");
}

const authed = await requireAuthForApp();
if (!authed) {
  throw new Error("Redirecting to login");
}

const session = getSession();
const accountLabel = document.getElementById("auth-account-label");
if (accountLabel) {
  accountLabel.classList.add("hidden");
  accountLabel.setAttribute("aria-hidden", "true");
}

document.getElementById("btn-sign-out")?.addEventListener("click", () => signOut());

// Guests (auth skipped, no session) get a top-right "Log in" button.
const loginBtn = document.getElementById("btn-top-login");
if (loginBtn) {
  if (!session?.token) {
    loginBtn.classList.remove("hidden");
    loginBtn.addEventListener("click", () => {
      clearAuthSkip();
      window.location.reload();
    });
  } else {
    loginBtn.classList.add("hidden");
  }
}

const canvas = document.getElementById("three-canvas");
const { scene, camera, renderer, controls } = createScene(canvas);

const calendarApp = new CalendarApp({
  scene,
  camera,
  renderer,
  controls,
  osShell: !embedded,
  onLocalDataChange: () => scheduleCloudSync()
});

registerInklingTimelineBridge(calendarApp);
registerInklingApp(calendarApp);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  calendarApp.update();
  renderer.render(scene, camera);
}

animate();
