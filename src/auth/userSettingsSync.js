import { getSession, setSession } from "./session.js";
import { saveLocalProfile } from "./userAccount.js";
import { saveNotificationSettings } from "../calendar/notifications/notificationSettings.js";
import { applyWordWeaverFromServer } from "../wordweaver/wordweaverCloudSync.js";

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

  const themeMode = user.settings?.theme?.mode;
  if (themeMode === "light" || themeMode === "dark") {
    document.documentElement.dataset.inklingTheme = themeMode;
    try {
      localStorage.setItem("inkling:theme", themeMode);
    } catch {
      /* ignore */
    }
  }
}
