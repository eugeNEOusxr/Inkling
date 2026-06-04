import { dismissAlert, getActiveAlerts, AlertPriority, syncAlertsBadge } from "./alertsModel.js";
import { formatTimelineDisplayTime } from "../../wordweaver/timelineModel.js";

const PRIORITY_LABELS = {
  [AlertPriority.CRITICAL]: "Critical",
  [AlertPriority.HIGH]: "High",
  [AlertPriority.NORMAL]: "Normal",
  [AlertPriority.LOW]: "Low"
};

/**
 * Full-screen alerts panel — list, priority styling, dismiss.
 */
export class AlertsPanel {
  /**
   * @param {{
   *   windowManager?: import("../ui/WindowManager.js").WindowManager | null,
   *   onClose?: () => void
   * }} opts
   */
  constructor(opts = {}) {
    this.windowManager = opts.windowManager ?? null;
    this.onClose = opts.onClose ?? (() => {});
    this.el = null;
    this.listEl = null;
    this.toastEl = null;
    this._open = false;

    this._ensureDom();
    this._bindEvents();
    this.render();
  }

  _ensureDom() {
    let panel = document.getElementById("alerts-panel");
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "alerts-panel";
      panel.className = "alerts-panel hidden";
      panel.setAttribute("aria-label", "Alerts");
      panel.innerHTML = `
        <header class="alerts-panel__header reader-holographic glass-panel">
          <h2 class="alerts-panel__title">Alerts</h2>
          <button type="button" class="alerts-panel__close" aria-label="Close alerts">×</button>
        </header>
        <div id="alerts-panel-toast" class="alerts-panel__toast hidden" role="status" aria-live="assertive"></div>
        <div id="alerts-panel-list" class="alerts-panel__list"></div>
        <p id="alerts-panel-empty" class="alerts-panel__empty hidden">No active alerts. Say “remind me at 3pm” to create one.</p>
      `;
      document.getElementById("ui-overlay")?.appendChild(panel);
    }
    this.el = panel;
    this.listEl = panel.querySelector("#alerts-panel-list");
    this.toastEl = panel.querySelector("#alerts-panel-toast");
    this.emptyEl = panel.querySelector("#alerts-panel-empty");

    panel.querySelector(".alerts-panel__close")?.addEventListener("click", () => this.close());
  }

  _bindEvents() {
    document.addEventListener("inkling:alerts-updated", () => this.render());
    document.addEventListener("inkling:alert-fired", (e) => {
      const alert = e.detail?.alert;
      const trigger = e.detail?.trigger;
      if (!alert) return;
      const lead =
        trigger?.leadMinutes > 0 ? `${trigger.leadMinutes} min before · ` : "";
      this._showToast(`${lead}${alert.text}`);
      if (this._open) this.render();
    });
    document.addEventListener("inkling:close-all-panels", () => {
      if (this._open) this.close();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this._open) this.close();
    });
  }

  /**
   * @param {string} message
   */
  _showToast(message) {
    let toast = document.getElementById("inkling-alert-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "inkling-alert-toast";
      toast.className = "inkling-alert-toast hidden";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "assertive");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast?.classList.add("hidden"), 6000);
  }

  open() {
    this.windowManager?.closeAllPanels();
    document.dispatchEvent(new CustomEvent("inkling:close-all-panels"));
    this._open = true;
    this.el?.classList.remove("hidden");
    document.body.classList.add("alerts-panel-open");
    this.render();
  }

  close() {
    this._open = false;
    this.el?.classList.add("hidden");
    document.body.classList.remove("alerts-panel-open");
    this.onClose();
  }

  isOpen() {
    return this._open;
  }

  render() {
    const alerts = getActiveAlerts().sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.time.localeCompare(b.time);
    });

    if (!this.listEl) return;

    this.emptyEl?.classList.toggle("hidden", alerts.length > 0);
    this.listEl.innerHTML = "";

    for (const alert of alerts) {
      const item = document.createElement("article");
      item.className = `alerts-panel__item alerts-panel__item--p${alert.priority}`;
      item.dataset.alertId = alert.id;

      const time = formatTimelineDisplayTime(alert.time);
      const label = PRIORITY_LABELS[alert.priority] ?? "Alert";

      item.innerHTML = `
        <div class="alerts-panel__item-glow" aria-hidden="true"></div>
        <div class="alerts-panel__item-main">
          <span class="alerts-panel__item-time">${time}</span>
          <span class="alerts-panel__item-priority">${label}</span>
          ${alert.timelineEntryId ? '<span class="alerts-panel__item-timeline" title="Linked to WordWeaver timeline">🪡</span>' : ""}
        </div>
        <p class="alerts-panel__item-text"></p>
        <div class="alerts-panel__item-actions">
          <button type="button" class="btn-ghost btn-sm alerts-panel__dismiss">Dismiss</button>
        </div>
      `;

      item.querySelector(".alerts-panel__item-text").textContent = alert.text;
      item.querySelector(".alerts-panel__dismiss")?.addEventListener("click", () => {
        dismissAlert(alert.id);
        this.render();
      });

      this.listEl.appendChild(item);
    }

    syncAlertsBadge();
  }
}
