import { scheduleCloudSync } from "../../auth/cloudSync.js";

const SETTINGS_KEY = "calendar3d-notification-settings-v1";

export const SOUND_THEMES = [
  { id: "softChime", label: "Soft Chime" },
  { id: "glassPing", label: "Glass Ping" },
  { id: "warmBell", label: "Warm Bell" },
  { id: "softPulse", label: "Soft Pulse" },
  { id: "morningBuzzer", label: "Morning Alarm Buzzer" }
];

export const LEVEL_SOUND_MAP = {
  soft: "softChime",
  medium: "glassPing",
  urgent: "warmBell",
  final: "softPulse"
};

const DEFAULTS = {
  volume: 0.45,
  defaultSound: "softChime",
  soundByEventType: {
    note: "softChime",
    reminder: "glassPing",
    alarm: "morningBuzzer",
    appointment: "warmBell"
  },
  enableSoft: true,
  enableMedium: true,
  enableUrgent: true,
  enableFinal: true,
  enableBrowser: true,
  enableSounds: true,
  theme: "auto",
  appearancePalette: "neutral"
};

/**
 * @returns {typeof DEFAULTS}
 */
export function loadNotificationSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      return {
        ...DEFAULTS,
        ...stored,
        soundByEventType: {
          ...DEFAULTS.soundByEventType,
          ...(stored.soundByEventType ?? {})
        }
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

/**
 * @param {Partial<typeof DEFAULTS>} settings
 */
export function saveNotificationSettings(settings) {
  const merged = { ...loadNotificationSettings(), ...settings };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    scheduleCloudSync();
  } catch {
    /* ignore */
  }
  return merged;
}
