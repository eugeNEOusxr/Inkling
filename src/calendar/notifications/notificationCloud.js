import { apiFetch } from "../../auth/cloudSync.js";
import { getSession } from "../../auth/session.js";

let historySyncTimer = null;

/**
 * @returns {Promise<object[]>}
 */
export async function fetchNotificationSchedules() {
  const { schedules } = await apiFetch("/api/notifications/schedules");
  return schedules ?? [];
}

/**
 * @param {object[]} schedules
 */
export async function saveNotificationSchedules(schedules) {
  const { schedules: saved } = await apiFetch("/api/notifications/schedules", {
    method: "PUT",
    body: JSON.stringify({ schedules })
  });
  return saved ?? [];
}

/**
 * @param {number} [limit]
 */
export async function fetchNotificationHistory(limit = 100) {
  const { history } = await apiFetch(`/api/notifications/history?limit=${limit}`);
  return history ?? [];
}

/**
 * Push a fired notification to the account (debounced batch optional).
 * @param {object} entry
 */
export function queueNotificationHistorySync(entry) {
  if (!getSession()?.token) return;
  if (historySyncTimer) clearTimeout(historySyncTimer);
  historySyncTimer = setTimeout(() => {
    historySyncTimer = null;
    apiFetch("/api/notifications/history", {
      method: "POST",
      body: JSON.stringify({
        entry: {
          id: entry.id,
          scheduleId: entry.scheduleId ?? null,
          status: entry.status ?? "fired",
          firedAt: entry.firedAt ?? Date.now(),
          type: entry.type,
          level: entry.level,
          message: entry.message,
          title: entry.title,
          date: entry.date,
          dayId: entry.dayId,
          hour: entry.hour
        }
      })
    }).catch((err) => {
      console.warn("[notificationCloud] history sync failed", err.message);
    });
  }, 400);
}
