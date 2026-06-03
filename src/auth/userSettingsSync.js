import { getSession, setSession } from "./session.js";
import { saveLocalProfile } from "./userAccount.js";
import { saveNotificationSettings } from "../calendar/notifications/notificationSettings.js";
import { applyWordWeaverFromServer } from "../wordweaver/wordweaverCloudSync.js";
import { applyPaletteToDocument, PALETTES } from "../theme/appearancePalettes.js";

/**
 * Merge server user profile + settings into local session and preferences.
 * @param {object} [user]
 */
export function applyServerUserToClient(user) {
  if (!user) return;

  saveLocalProfile(user);

  const session = getSession();
  if (session) {
    setSession({
      ...session,
      email: user.email ?? session.email,
      user
    });
  }

  const n = user.settings?.notifications;
  if (n) {
    saveNotificationSettings({
      enableSounds: n.sound !== false,
      enableBrowser: n.enabled !== false,
      quietHoursEnabled: Boolean(n.quietHours?.start && n.quietHours?.end),
      quietHoursStart: n.quietHours?.start ?? "",
      quietHoursEnd: n.quietHours?.end ?? ""
    });
  }

  applyWordWeaverFromServer(user.settings?.wordweaver);

  const theme = user.settings?.theme;
  const themeMode = theme?.mode;
  const patch = {};

  if (themeMode === "light" || themeMode === "dark" || themeMode === "auto") {
    patch.theme = themeMode;
    document.documentElement.dataset.inklingTheme = themeMode;
    try {
      localStorage.setItem("inkling:theme", themeMode);
    } catch {
      /* ignore */
    }
  }

  const paletteId = theme?.appearancePalette;
  if (paletteId && PALETTES[paletteId]) {
    patch.appearancePalette = paletteId;
    applyPaletteToDocument(paletteId);
  }

  if (Object.keys(patch).length) {
    saveNotificationSettings(patch);
  }
}
