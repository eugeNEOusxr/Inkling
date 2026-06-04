import * as bus from "../../utils/EventBus.js";
import {
  getUpcomingAlerts,
  getMissedAlerts,
  snoozeAlert,
  dismissAlert,
  syncAlertsBadge,
  AlertPriority,
  SNOOZE_MINUTES_OPTIONS
} from "./alertsModel.js";
import { getCategoryColor, formatTimelineDisplayTime } from "../../wordweaver/timelineModel.js";
import { navigateToAlert } from "./InklingAI.js";
import {
  formatUpcomingUntilLabel,
  formatMissedLabel,
  resolveAlertNavigateDate
} from "./alertsUi.js";

const PRIORITY_ICONS = {
  [AlertPriority.CRITICAL]: "🔴",
  [AlertPriority.HIGH]: "🟡",
  [AlertPriority.NORMAL]: "🔵",
  [AlertPriority.LOW]: "⚪"
};

/** @type {AlertsDropdown | null} */
let singleton = null;

function ensureStyles() {
  if (document.getElementById("alerts-dropdown-styles")) return;
  const style = document.createElement("style");
  style.id = "alerts-dropdown-styles";
  style.textContent = `
    .alerts-dropdown-root { position: relative; display: inline-flex; }
    .alerts-dropdown-menu {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: min(380px, 92vw);
      max-height: min(480px, 55vh);
      display: flex;
      flex-direction: column;
      border-radius: 12px;
      border: 1px solid rgba(78, 230, 230, 0.35);
      background: rgba(6, 10, 20, 0.97);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
      z-index: 300;
      overflow: hidden;
      opacity: 0;
      transform: translateY(-6px) scale(0.98);
      pointer-events: none;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .alerts-dropdown-menu.is-open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .alerts-dropdown-menu.hidden { display: none; }
    .alerts-dropdown-header,
    .alerts-dropdown-section-title {
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 700;
      color: #a8f7f7;
      border-bottom: 1px solid rgba(51, 65, 85, 0.8);
      flex-shrink: 0;
    }
    .alerts-dropdown-section-title {
      color: #fca5a5;
      border-bottom-color: rgba(127, 29, 29, 0.5);
      background: rgba(127, 29, 29, 0.12);
    }
    .alerts-dropdown-list {
      flex: 1;
      overflow-y: auto;
      padding: 6px;
      -webkit-overflow-scrolling: touch;
    }
    .alerts-dropdown-empty {
      padding: 16px;
      color: #94a3b8;
      font-size: 13px;
      text-align: center;
    }
    .alerts-dropdown-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 6px;
      border: 1px solid rgba(51, 65, 85, 0.6);
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.85);
      overflow: hidden;
    }
    .alerts-dropdown-row.is-focused {
      outline: 2px solid rgba(78, 230, 230, 0.65);
      outline-offset: 1px;
    }
    .alerts-dropdown-row__nav {
      display: grid;
      grid-template-columns: 4px 1fr auto;
      gap: 8px 10px;
      align-items: start;
      width: 100%;
      min-height: 44px;
      padding: 10px;
      border: none;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .alerts-dropdown-row__nav:hover {
      background: rgba(78, 230, 230, 0.08);
    }
    .alerts-dropdown-row__bar {
      width: 4px;
      border-radius: 4px;
      align-self: stretch;
      min-height: 36px;
    }
    .alerts-dropdown-row__text {
      margin: 0;
      font-size: 14px;
      color: #f1f5f9;
      line-height: 1.35;
    }
    .alerts-dropdown-row__meta {
      margin: 4px 0 0;
      font-size: 12px;
      color: #94a3b8;
    }
    .alerts-dropdown-row__side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      font-size: 12px;
      color: #cbd5e1;
      white-space: nowrap;
    }
    .alerts-dropdown-row__until {
      font-weight: 600;
      color: #fde68a;
    }
    .alerts-dropdown-row__until--missed { color: #fca5a5; }
    .alerts-dropdown-row__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 0 10px 10px;
    }
    .alerts-dropdown-row__actions button {
      min-height: 44px;
      min-width: 44px;
      padding: 6px 10px;
      font-size: 12px;
      border-radius: 6px;
      border: 1px solid rgba(51, 65, 85, 0.8);
      background: rgba(30, 41, 59, 0.9);
      color: #e2e8f0;
      cursor: pointer;
    }
    .alerts-dropdown-row__actions button:hover {
      border-color: rgba(78, 230, 230, 0.45);
    }
    .alerts-dropdown-row__dismiss {
      margin-left: auto;
      color: #fca5a5;
    }
    @media (max-width: 639px) {
      .alerts-dropdown-menu {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        width: 100%;
        max-width: none;
        max-height: min(72vh, 100dvh);
        border-radius: 0 0 14px 14px;
        padding-top: env(safe-area-inset-top, 0px);
      }
      .alerts-dropdown-root .alerts-dropdown-menu {
        top: 0;
        right: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Canonical §7.3 alerts list (desktop dropdown + mobile top sheet).
 */
export class AlertsDropdown {
  /**
   * @param {{ anchorId?: string }} [opts]
   */
  constructor(opts = {}) {
    this.anchorId = opts.anchorId ?? "btn-inkling-alerts";
    this._open = false;
    /** @type {number} */
    this._focusIndex = -1;
    /** @type {HTMLElement[]} */
    this._rowEls = [];
    /** @type {Array<() => void>} */
    this._busDisposers = [];

    ensureStyles();
    this._mount();
    this._bindGlobal();
    this._bindBus();
  }

  isOpen() {
    return this._open;
  }

  _mount() {
    const anchor = document.getElementById(this.anchorId);
    if (!anchor) return;

    let root = anchor.closest(".alerts-dropdown-root");
    if (!root) {
      root = document.createElement("div");
      root.className = "alerts-dropdown-root";
      anchor.parentElement?.insertBefore(root, anchor);
      root.appendChild(anchor);
    }

    if (!this.menu) {
      this.menu = document.createElement("div");
      this.menu.id = "alerts-dropdown-menu";
      this.menu.className = "alerts-dropdown-menu hidden";
      this.menu.setAttribute("role", "menu");
      this.menu.setAttribute("aria-label", "Alerts");
      this.menu.innerHTML = `
        <div id="alerts-dropdown-missed-wrap" class="hidden">
          <div class="alerts-dropdown-section-title">Missed alerts</div>
          <div class="alerts-dropdown-list" id="alerts-dropdown-missed-list"></div>
        </div>
        <header class="alerts-dropdown-header">Upcoming alerts</header>
        <div class="alerts-dropdown-list" id="alerts-dropdown-list"></div>
        <p class="alerts-dropdown-empty hidden" id="alerts-dropdown-empty">No upcoming alerts.</p>
      `;
      root.appendChild(this.menu);
      this.missedWrap = this.menu.querySelector("#alerts-dropdown-missed-wrap");
      this.missedListEl = this.menu.querySelector("#alerts-dropdown-missed-list");
      this.listEl = this.menu.querySelector("#alerts-dropdown-list");
      this.emptyEl = this.menu.querySelector("#alerts-dropdown-empty");
    }
  }

  _bindGlobal() {
    this._onDocClick = (e) => {
      if (!this._open) return;
      const anchor = document.getElementById(this.anchorId);
      if (anchor?.contains(e.target) || this.menu?.contains(e.target)) return;
      this.close();
    };
    document.addEventListener("click", this._onDocClick);

    this._onKeydown = (e) => {
      if (!this._open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        this.close();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        this._moveFocus(e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (e.key === "Enter" && this._focusIndex >= 0) {
        e.preventDefault();
        const row = this._rowEls[this._focusIndex];
        row?.querySelector(".alerts-dropdown-row__nav")?.click();
      }
    };
    document.addEventListener("keydown", this._onKeydown);

    document.addEventListener("inkling:close-all-panels", () => this.close());
  }

  _bindBus() {
    const refresh = () => {
      syncAlertsBadge();
      if (this._open) this.render();
    };
    this._busDisposers.push(
      bus.on("alertTriggered", refresh),
      bus.on("eventUpdated", refresh),
      bus.on("eventDeleted", refresh)
    );
  }

  _moveFocus(delta) {
    if (!this._rowEls.length) return;
    this._focusIndex = Math.max(
      0,
      Math.min(this._rowEls.length - 1, this._focusIndex + delta)
    );
    this._applyFocus();
  }

  _applyFocus() {
    this._rowEls.forEach((el, i) => {
      el.classList.toggle("is-focused", i === this._focusIndex);
      if (i === this._focusIndex) {
        el.querySelector(".alerts-dropdown-row__nav")?.setAttribute("tabindex", "0");
      } else {
        el.querySelector(".alerts-dropdown-row__nav")?.setAttribute("tabindex", "-1");
      }
    });
    this._rowEls[this._focusIndex]?.scrollIntoView({ block: "nearest" });
  }

  toggle() {
    if (this._open) this.close();
    else this.open();
  }

  open() {
    this._mount();
    if (!this.menu) return;

    document.dispatchEvent(new CustomEvent("inkling:close-all-panels"));

    this._open = true;
    this.menu.classList.remove("hidden");
    requestAnimationFrame(() => {
      this.menu?.classList.add("is-open");
      document.getElementById("btn-inkling-alerts")?.setAttribute("aria-expanded", "true");
      document.dispatchEvent(new CustomEvent("inkling:alerts-dropdown-toggle"));
    });

    this.render();
    bus.emit("alertsOpened");
  }

  close() {
    this._open = false;
    this._focusIndex = -1;
    this.menu?.classList.remove("is-open");
    const btn = document.getElementById("btn-inkling-alerts");
    btn?.setAttribute("aria-expanded", "false");
    document.dispatchEvent(new CustomEvent("inkling:alerts-dropdown-toggle"));
    setTimeout(() => {
      if (!this._open) this.menu?.classList.add("hidden");
    }, 200);
    btn?.focus();
  }

  render() {
    if (!this.listEl || !this.missedListEl) return;

    const now = Date.now();
    const missed = getMissedAlerts(now);
    const upcoming = getUpcomingAlerts(now);

    this.missedWrap?.classList.toggle("hidden", missed.length === 0);
    this.missedListEl.innerHTML = "";
    this.listEl.innerHTML = "";
    this._rowEls = [];

    for (const { alert, triggerAt } of missed) {
      this._appendRow(this.missedListEl, alert, triggerAt, {
        until: formatMissedLabel(triggerAt, now),
        missed: true
      });
    }

    this.emptyEl?.classList.toggle("hidden", upcoming.length > 0);

    for (const { alert, triggerAt } of upcoming) {
      this._appendRow(this.listEl, alert, triggerAt, {
        until: formatUpcomingUntilLabel(triggerAt, now),
        missed: false
      });
    }

    if (this._open && this._rowEls.length) {
      this._focusIndex = 0;
      this._applyFocus();
    }

    syncAlertsBadge();
  }

  /**
   * @param {HTMLElement} parent
   * @param {import("./alertsModel.js").AlertRecord} alert
   * @param {number} triggerAt
   * @param {{ until: string, missed: boolean }} opts
   */
  _appendRow(parent, alert, triggerAt, opts) {
    const row = document.createElement("div");
    row.className = "alerts-dropdown-row";

    const color = getCategoryColor(alert.category);
    const timeLabel = formatTimelineDisplayTime(alert.time);
    const icon = PRIORITY_ICONS[alert.priority] ?? "⚪";
    const untilClass = opts.missed
      ? "alerts-dropdown-row__until alerts-dropdown-row__until--missed"
      : "alerts-dropdown-row__until";

    const snoozeBtns = SNOOZE_MINUTES_OPTIONS.map(
      (m) =>
        `<button type="button" class="alerts-dropdown-row__snooze" data-snooze-min="${m}" aria-label="Snooze ${m} minutes">${m}m</button>`
    ).join("");

    row.innerHTML = `
      <button type="button" class="alerts-dropdown-row__nav" role="menuitem" tabindex="-1">
        <span class="alerts-dropdown-row__bar" style="background:${color}"></span>
        <div>
          <p class="alerts-dropdown-row__text"></p>
          <p class="alerts-dropdown-row__meta">${timeLabel} · ${alert.category}</p>
        </div>
        <div class="alerts-dropdown-row__side">
          <span aria-hidden="true">${icon}</span>
          <span class="${untilClass}">${opts.until}</span>
        </div>
      </button>
      <div class="alerts-dropdown-row__actions">
        ${snoozeBtns}
        <button type="button" class="alerts-dropdown-row__dismiss" aria-label="Dismiss alert">Dismiss</button>
      </div>
    `;
    row.querySelector(".alerts-dropdown-row__text").textContent = alert.text;

    row.querySelector(".alerts-dropdown-row__nav")?.addEventListener("click", () => {
      this._navigateToAlert(alert);
    });

    row.querySelectorAll("[data-snooze-min]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const min = Number(btn.getAttribute("data-snooze-min"));
        if (Number.isFinite(min)) snoozeAlert(alert.id, min);
      });
    });

    row.querySelector(".alerts-dropdown-row__dismiss")?.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissAlert(alert.id);
    });

    parent.appendChild(row);
    this._rowEls.push(row);
  }

  /**
   * @param {import("./alertsModel.js").AlertRecord} alert
   */
  _navigateToAlert(alert) {
    const date = resolveAlertNavigateDate(alert);
    bus.emit("navigateTo", { date, level: "day" });
    this.close();
    void navigateToAlert(alert);
  }
}

/**
 * @returns {AlertsDropdown}
 */
export function getAlertsDropdown() {
  if (!singleton) {
    singleton = new AlertsDropdown();
  }
  return singleton;
}

export function openAlertsDropdown() {
  getAlertsDropdown().open();
}

export function closeAlertsDropdown() {
  getAlertsDropdown().close();
}
