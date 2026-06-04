import {
  getPreferredSnoozeDuration,
  setPreferredSnoozeDuration,
  snoozeLabel
} from "./snoozePrefs.js";
import {
  dismissAlert,
  snoozeAlert,
  SNOOZE_MINUTES_OPTIONS
} from "../alerts/alertsModel.js";
import { formatTimelineDisplayTime } from "../../wordweaver/timelineModel.js";

/**
 * In-app alert toasts (app open).
 */
export class InAppAlert {
  constructor() {
    this.container = document.getElementById("in-app-alerts");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "in-app-alerts";
      document.getElementById("ui-overlay")?.appendChild(this.container);
    }
  }

  /**
   * @param {{
   *   title: string,
   *   message: string,
   *   kind?: 'reminder'|'alarm'|'appointment'|'note'|'info',
   *   level?: string|null,
   *   feedId?: string,
   *   onSnooze?: (duration: '5m'|'10m'|'15m', feedId: string) => void
   * }} payload
   */
  show({ title, message, kind = "info", level = null, feedId, onSnooze }) {
    const el = document.createElement("div");
    const levelClass = level ? `in-app-alert--level-${level}` : "";
    const isAlarm = kind === "alarm";
    el.className = `in-app-alert in-app-alert--${kind} ${levelClass}`.trim();

    const pref = getPreferredSnoozeDuration();
    const snoozeBlock =
      isAlarm && feedId && onSnooze
        ? `
      <div class="in-app-alert-snooze" role="group" aria-label="Snooze alarm">
        <span class="in-app-alert-snooze-label">Snooze</span>
        <button type="button" class="in-app-alert-snooze-chip" data-snooze="5m">5</button>
        <button type="button" class="in-app-alert-snooze-chip" data-snooze="10m">10</button>
        <button type="button" class="in-app-alert-snooze-chip" data-snooze="15m">15</button>
        <span class="in-app-alert-snooze-unit">min</span>
        <button type="button" class="in-app-alert-snooze-primary" data-snooze-primary>
          Snooze ${snoozeLabel(pref)}
        </button>
      </div>`
        : "";

    el.innerHTML = `
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
      ${snoozeBlock}
      <button type="button" class="in-app-alert-dismiss" aria-label="Dismiss">✕</button>
    `;

    const remove = () => {
      el.classList.remove("in-app-alert--visible");
      setTimeout(() => el.remove(), 400);
    };

    el.querySelector(".in-app-alert-dismiss")?.addEventListener("click", remove);

    const applySnooze = (duration) => {
      setPreferredSnoozeDuration(duration);
      const primary = el.querySelector("[data-snooze-primary]");
      if (primary) primary.textContent = `Snooze ${snoozeLabel(duration)}`;
      el.querySelectorAll(".in-app-alert-snooze-chip").forEach((chip) => {
        chip.classList.toggle("is-selected", chip.getAttribute("data-snooze") === duration);
      });
      onSnooze?.(duration, feedId);
      remove();
    };

    el.querySelector("[data-snooze-primary]")?.addEventListener("click", () => {
      applySnooze(getPreferredSnoozeDuration());
    });

    el.querySelectorAll(".in-app-alert-snooze-chip").forEach((chip) => {
      const dur = chip.getAttribute("data-snooze");
      if (dur === pref) chip.classList.add("is-selected");
      chip.addEventListener("click", () => {
        if (dur === "5m" || dur === "10m" || dur === "15m") applySnooze(dur);
      });
    });

    this.container.appendChild(el);
    setTimeout(() => el.classList.add("in-app-alert--visible"), 10);

    if (!isAlarm) {
      setTimeout(remove, 8000);
    }
  }

  /**
   * §7.5 timeline alert toast — snooze/dismiss via alerts engine; auto-hide 30s without dismiss.
   * @param {{
   *   alert: import("../alerts/alertsModel.js").AlertRecord,
   *   trigger?: { leadMinutes?: number }
   * }} payload
   */
  showTimelineAlert({ alert, trigger }) {
    const lead =
      trigger?.leadMinutes > 0 ? `${trigger.leadMinutes} min before · ` : "";
    const time = formatTimelineDisplayTime(alert.time);
    const title = alert.text;
    const message = `${lead}${time}`;

    const el = document.createElement("div");
    el.className = "in-app-alert in-app-alert--reminder";

    const snoozeBtns = SNOOZE_MINUTES_OPTIONS.map(
      (m) =>
        `<button type="button" class="in-app-alert-snooze-chip" data-snooze-min="${m}">${m}</button>`
    ).join("");

    el.innerHTML = `
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
      <div class="in-app-alert-snooze" role="group" aria-label="Snooze alert">
        <span class="in-app-alert-snooze-label">Snooze</span>
        ${snoozeBtns}
        <span class="in-app-alert-snooze-unit">min</span>
      </div>
      <button type="button" class="in-app-alert-dismiss" aria-label="Dismiss">✕</button>
    `;

    const remove = () => {
      el.classList.remove("in-app-alert--visible");
      setTimeout(() => el.remove(), 400);
    };

    el.querySelector(".in-app-alert-dismiss")?.addEventListener("click", () => {
      dismissAlert(alert.id);
      remove();
    });

    el.querySelectorAll("[data-snooze-min]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const min = Number(btn.getAttribute("data-snooze-min"));
        if (Number.isFinite(min)) {
          snoozeAlert(alert.id, min);
          remove();
        }
      });
    });

    this.container.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in-app-alert--visible"));

    setTimeout(remove, 30_000);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
