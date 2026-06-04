import { createScene } from "./scene.js";
import { CalendarApp } from "./calendar/CalendarApp.js";
import { requireAuthForApp, signOut } from "./auth/requireAuth.js";
import { getSession } from "./auth/session.js";
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
