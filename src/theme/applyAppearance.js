import { applyPaletteToDocument, getActivePaletteId } from "./appearancePalettes.js";
import { loadNotificationSettings, saveNotificationSettings } from "../calendar/notifications/notificationSettings.js";
import { scheduleCloudSync } from "../auth/cloudSync.js";
import { getSession } from "../auth/session.js";

/**
 * Load palette from notification settings and apply to the document.
 */
export function bootstrapAppearance() {
  const settings = loadNotificationSettings();
  const id = settings.appearancePalette ?? getActivePaletteId();
  applyPaletteToDocument(id);
  return id;
}

/**
 * @param {import('./appearancePalettes.js').AppearancePaletteId} paletteId
 */
export function setAppearancePalette(paletteId) {
  saveNotificationSettings({ appearancePalette: paletteId });
  applyPaletteToDocument(paletteId);
  scheduleAppearanceCloudSync(paletteId);
}

let syncTimer = null;

/**
 * @param {string} paletteId
 */
export function scheduleAppearanceCloudSync(paletteId) {
  if (!getSession()?.token) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    import("../auth/cloudSync.js")
      .then(({ apiFetch }) =>
        apiFetch("/api/auth/settings", {
          method: "PUT",
          body: JSON.stringify({
            theme: { appearancePalette: paletteId, mode: loadNotificationSettings().theme ?? "auto" }
          })
        })
      )
      .catch(() => {});
  }, 600);
}
