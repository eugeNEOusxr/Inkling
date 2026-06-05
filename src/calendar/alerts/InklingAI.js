import * as bus from "../../utils/EventBus.js";
import {
  getUpcomingAlerts,
  AlertPriority,
  todayDateString
} from "./alertsModel.js";
import { formatTimelineDisplayTime } from "../../wordweaver/timelineModel.js";
import { scrollToTime } from "../ui/CalendarDayView.js";

/**
 * @typedef {{ type: string, alerts?: import("./alertsModel.js").AlertRecord[], alert?: import("./alertsModel.js").AlertRecord, trigger?: object }} SystemEvent
 */

/**
 * @param {SystemEvent} event
 * @returns {string}
 */
export function handleSystemEvent(event) {
  const type = String(event?.type ?? "");
  let summary = "";

  if (type === "alertsOpened") {
    summary = buildAlertsOpenedSummary(event.alerts ?? getUpcomingAlerts());
  } else if (type === "alertTriggered") {
    summary = buildAlertTriggeredSummary(event.alert);
  } else {
    summary = "";
  }

  if (summary) {
    postInklingSystemMessage(summary);
  }

  return summary;
}

/**
 * @param {{ alert: import("./alertsModel.js").AlertRecord, triggerAt: number }[]} rows
 */
function buildAlertsOpenedSummary(rows) {
  if (!rows.length) {
    return "No upcoming alerts right now.";
  }

  const urgent = rows.filter((r) => r.alert.priority >= AlertPriority.HIGH);
  const next = rows[0];
  const nextLabel = formatTimelineDisplayTime(next.alert.time);
  const parts = [];

  if (urgent.length === 0) {
    parts.push("No urgent alerts right now.");
  } else {
    const u = urgent[0];
    const cat = u.alert.category;
    const until = formatUntilLabel(u.triggerAt);
    parts.push(`You have a ${cat} alert ${until}.`);
  }

  if (rows.length > 1) {
    parts.push(`Your next alert is at ${nextLabel}.`);
  } else {
    parts.push(`Your next alert is at ${nextLabel} (${formatUntilLabel(next.triggerAt)}).`);
  }

  return parts.join(" ");
}

/**
 * @param {import("./alertsModel.js").AlertRecord | undefined} alert
 */
function buildAlertTriggeredSummary(alert) {
  if (!alert) return "An alert just fired.";
  const time = formatTimelineDisplayTime(alert.time);
  return `Heads up: “${alert.text}” (${alert.category}) — scheduled for ${time}.`;
}

/**
 * @param {number} triggerAt
 */
function formatUntilLabel(triggerAt) {
  const diff = triggerAt - Date.now();
  if (diff <= 0) return "now";
  if (diff < 60000) return "in less than a minute";
  if (diff < 3600000) return `in ${Math.floor(diff / 60000)} minutes`;
  if (diff < 86400000) return `in ${Math.floor(diff / 3600000)} hours`;
  return `in ${Math.floor(diff / 86400000)} days`;
}

/**
 * @param {string} text
 */
function postInklingSystemMessage(text) {
  document.dispatchEvent(
    new CustomEvent("inkling:system-chat", { detail: { text, role: "inkling" } })
  );

  const messagesEl = document.getElementById("inkling-messages");
  if (!messagesEl) return;

  const div = document.createElement("div");
  div.className = "inkling-msg inkling-msg--inkling";
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * @param {import("./alertsModel.js").AlertRecord} alert
 */
export async function navigateToAlert(alert) {
  if (!alert) return;

  const date = alert.date ?? todayDateString();
  const time = formatTimelineDisplayTime(alert.time);

  const dayBtn = document.querySelector(`.mini-month-cal__day[data-date="${date}"]`);
  if (dayBtn) {
    dayBtn.click();
  } else {
    document.querySelector("#inkling-bottom-nav [data-tab=writer]")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    await delay(280);
    document.querySelector(".notebook-calendar-dock__btn[data-open-writer]")?.click();
    await delay(280);
  }

  await delay(200);
  const track =
    document.querySelector("#notebook-writer-panel .day-scroller__track-wrap") ??
    document.querySelector("#notebook-writer-panel .day-scroller__track");
  if (track) {
    scrollToTime(track, time);
  }

  document.dispatchEvent(
    new CustomEvent("inkling:time-entry-select", { detail: { time } })
  );
}

/**
 * @param {number} ms
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// NOTE: Inkling no longer mirrors alert status into the chat on `alertsOpened`.
// Alerts have their own dedicated surface (the bell dropdown / Alerts tab), so
// echoing "No upcoming alerts right now." + summaries into the chat on every
// open just buried the welcome message and read as spam. `handleSystemEvent`
// stays exported for the dropdown/tests; only a genuinely *fired* alert posts a
// proactive nudge below.
bus.on("alertTriggered", (payload) => {
  handleSystemEvent({ type: "alertTriggered", alert: payload?.alert });
});
