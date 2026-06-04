import {
  getUpcomingAlerts,
  getTimeUntil,
  syncAlertsBadge,
  AlertPriority
} from "./alertsModel.js";
import { getCategoryColor, formatTimelineDisplayTime } from "../../wordweaver/timelineModel.js";
import { handleSystemEvent } from "./InklingAI.js";

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
      width: min(360px, 92vw);
      max-height: min(420px, 55vh);
      display: flex;
      flex-direction: column;
      border-radius: 12px;
      border: 1px solid rgba(78, 230, 230, 0.35);
      background: rgba(6, 10, 20, 0.97);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
      z-index: 10320;
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
    .alerts-dropdown-header {
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 700;
      color: #a8f7f7;
      border-bottom: 1px solid rgba(51, 65, 85, 0.8);
      flex-shrink: 0;
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
      display: grid;
      grid-template-columns: 4px 1fr auto;
      gap: 8px 10px;
      align-items: start;
      width: 100%;
      padding: 10px;
      margin-bottom: 4px;
      border: 1px solid rgba(51, 65, 85, 0.6);
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.85);
      color: inherit;
      text-align: left;
      cursor: pointer;
    }
    .alerts-dropdown-row:hover {
      border-color: rgba(78, 230, 230, 0.45);
      background: rgba(78, 230, 230, 0.1);
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
  `;
  document.head.appendChild(style);
}

/**
 * Unified alerts dropdown under the top-nav Alerts icon.
 */
export class AlertsDropdown {
  /**
   * @param {{
   *   anchorId?: string,
   *   onNavigateToAlert?: (alert: import("./alertsModel.js").AlertRecord) => void
   * }} [opts]
   */
  constructor(opts = {}) {
    this.anchorId = opts.anchorId ?? "btn-inkling-alerts";
    this.onNavigateToAlert =
      opts.onNavigateToAlert ??
      ((alert) => {
        document.dispatchEvent(
          new CustomEvent("inkling:navigate-to-alert", { detail: { alert } })
        );
      });

    this._open = false;
    this._tickTimer = null;
    ensureStyles();
    this._mount();
    this._bindGlobal();
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
      this.menu.innerHTML = `
        <header class="alerts-dropdown-header">Upcoming alerts</header>
        <div class="alerts-dropdown-list" id="alerts-dropdown-list"></div>
        <p class="alerts-dropdown-empty hidden" id="alerts-dropdown-empty">No upcoming alerts.</p>
      `;
      root.appendChild(this.menu);
      this.listEl = this.menu.querySelector("#alerts-dropdown-list");
      this.emptyEl = this.menu.querySelector("#alerts-dropdown-empty");
    }
  }

  _bindGlobal() {
    document.addEventListener("click", (e) => {
      if (!this._open) return;
      const anchor = document.getElementById(this.anchorId);
      if (anchor?.contains(e.target) || this.menu?.contains(e.target)) return;
      this.close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this._open) this.close();
    });

    document.addEventListener("inkling:close-all-panels", () => this.close());
    document.addEventListener("inkling:alerts-updated", () => this.render());
    document.addEventListener("inkling:alerts-tick", () => {
      if (this._open) this.render();
      syncAlertsBadge();
    });
    document.addEventListener("inkling:alert-fired", () => {
      syncAlertsBadge();
      if (this._open) this.render();
    });
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
    this._startTick();

    const rows = getUpcomingAlerts();
    handleSystemEvent({ type: "alertsOpened", alerts: rows });
  }

  close() {
    this._open = false;
    this.menu?.classList.remove("is-open");
    document.getElementById("btn-inkling-alerts")?.setAttribute("aria-expanded", "false");
    document.dispatchEvent(new CustomEvent("inkling:alerts-dropdown-toggle"));
    this._stopTick();
    setTimeout(() => {
      if (!this._open) this.menu?.classList.add("hidden");
    }, 200);
  }

  render() {
    if (!this.listEl) return;

    const rows = getUpcomingAlerts();
    this.listEl.innerHTML = "";
    this.emptyEl?.classList.toggle("hidden", rows.length > 0);

    for (const { alert, triggerAt } of rows) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "alerts-dropdown-row";
      btn.setAttribute("role", "menuitem");

      const color = getCategoryColor(alert.category);
      const timeLabel = formatTimelineDisplayTime(alert.time);
      const rawUntil = getTimeUntil(triggerAt);
      const until =
        rawUntil === "now"
          ? "now"
          : rawUntil === "less than a minute"
            ? "in less than a minute"
            : rawUntil.startsWith("in ")
              ? rawUntil
              : `in ${rawUntil}`;
      const icon = PRIORITY_ICONS[alert.priority] ?? "⚪";

      btn.innerHTML = `
        <span class="alerts-dropdown-row__bar" style="background:${color}"></span>
        <div>
          <p class="alerts-dropdown-row__text"></p>
          <p class="alerts-dropdown-row__meta">${timeLabel} · ${alert.category}</p>
        </div>
        <div class="alerts-dropdown-row__side">
          <span aria-hidden="true">${icon}</span>
          <span class="alerts-dropdown-row__until">${until}</span>
        </div>
      `;
      btn.querySelector(".alerts-dropdown-row__text").textContent = alert.text;

      btn.addEventListener("click", () => {
        this.close();
        this.onNavigateToAlert(alert);
      });

      this.listEl.appendChild(btn);
    }

    syncAlertsBadge();
  }

  _startTick() {
    this._stopTick();
    this._tickTimer = setInterval(() => {
      if (this._open) this.render();
    }, 30_000);
  }

  _stopTick() {
    if (this._tickTimer) clearInterval(this._tickTimer);
    this._tickTimer = null;
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
