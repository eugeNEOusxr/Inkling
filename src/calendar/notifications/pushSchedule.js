/**
 * Uploads the upcoming alarm fire-times to the backend so it can send a Web Push
 * at each one — even when the app is fully closed. The server is a dumb timer:
 * it stores {id, fireAt, title, body, ...} rows and pushes each when due, so the
 * calendar logic stays here on the client.
 *
 * Re-uploads (replace semantics) whenever events change, so edits/cancellations
 * propagate. Only the next-7-day horizon is sent (matches buildUpcomingFeed).
 */
import { apiFetch } from "../../auth/cloudSync.js";
import { getSession } from "../../auth/session.js";
import { buildUpcomingFeed } from "./notificationFeed.js";
import { loadNotificationSettings } from "./notificationSettings.js";
import { isPushEnabledLocally } from "./webPush.js";

const TYPE_LABEL = {
  reminder: "Reminder",
  alarm: "Alarm",
  appointment: "Appointment",
  note: "Note"
};

let uploadTimer = null;

function fmtHour(h) {
  return `${String(h).padStart(2, "0")}:00`;
}

/**
 * Build the flat push-schedule rows from calendar state.
 * @param {import("../calendarState.js").CalendarState} state
 * @param {number} [now]
 */
export function buildPushSchedule(state, now = Date.now()) {
  const settings = loadNotificationSettings();
  const feed = buildUpcomingFeed(state, now);
  const rows = [];
  for (const item of feed) {
    if (item.status !== "upcoming") continue;
    if (item.triggerAt <= now) continue;
    // Respect the master per-level toggle for the "final" (at-time) alert.
    if (!settings.enableFinal) continue;
    const label = TYPE_LABEL[item.type] || "Event";
    rows.push({
      id: `${item.sourceId}:final`,
      fireAt: item.triggerAt,
      title: item.title || `${label} — ${item.date} ${fmtHour(item.hour)}`,
      body: item.message || `${label} at ${fmtHour(item.hour)}`,
      tag: `inkling-${item.type}-${item.sourceId}`,
      url: "/index.html",
      kind: item.type
    });
  }
  return rows;
}

/**
 * Push the current schedule to the server (debounced).
 * @param {() => import("../calendarState.js").CalendarState} getState
 */
export function scheduleUpload(getState) {
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => uploadNow(getState).catch(() => {}), 1200);
}

/**
 * @param {() => import("../calendarState.js").CalendarState} getState
 */
export async function uploadNow(getState) {
  if (!getSession()?.token) return { ok: false, reason: "signed-out" };
  if (!isPushEnabledLocally()) return { ok: false, reason: "push-off" };
  const state = getState?.();
  if (!state) return { ok: false, reason: "no-state" };
  const schedules = buildPushSchedule(state);
  await apiFetch("/api/push/schedules", {
    method: "PUT",
    body: JSON.stringify({ schedules }),
    timeoutMs: 8000
  });
  return { ok: true, count: schedules.length };
}
