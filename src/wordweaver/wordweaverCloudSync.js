import { getSession } from "../auth/session.js";
import { updateSettings } from "../auth/userAccount.js";
import {
  loadCustomLayout,
  saveCustomLayout,
  LAYOUT_MODE_KEY,
  LAYOUT_SAVED_AT_KEY
} from "./customLayout.js";

let syncTimer = null;

/**
 * Apply WordWeaver settings from account (server wins if newer).
 * @param {object} [ww]
 */
export function applyWordWeaverFromServer(ww) {
  if (!ww) return;

  const localAt = Number(localStorage.getItem(LAYOUT_SAVED_AT_KEY) || 0);
  const remoteAt = Number(ww.savedAt || 0);

  if (ww.customLayout && remoteAt >= localAt) {
    saveCustomLayout(ww.customLayout);
    localStorage.setItem(LAYOUT_SAVED_AT_KEY, String(remoteAt));
  }

  if (ww.layoutMode && typeof ww.layoutMode === "string" && remoteAt >= localAt) {
    try {
      localStorage.setItem(LAYOUT_MODE_KEY, ww.layoutMode);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Push layout + mode to account settings (debounced).
 * @param {{ customLayout?: object, layoutMode?: string }} payload
 */
export function scheduleWordWeaverCloudSync(payload = {}) {
  if (!getSession()?.token) return;

  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    const customLayout = payload.customLayout ?? loadCustomLayout();
    const layoutMode =
      payload.layoutMode ?? localStorage.getItem(LAYOUT_MODE_KEY) ?? "street";
    const savedAt = Date.now();

    localStorage.setItem(LAYOUT_SAVED_AT_KEY, String(savedAt));

    updateSettings({
      wordweaver: {
        customLayout,
        layoutMode,
        savedAt
      }
    }).catch((err) => {
      console.warn("[WordWeaver] cloud sync failed:", err.message);
    });
  }, 700);
}
