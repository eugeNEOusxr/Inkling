/**
 * InklingAlerts — Inkling's dedicated alerts surface.
 *
 * Inkling is the hub for every reminder, but alerts must NOT flood the chat
 * (conversation gets buried). So they live in their own colour-coded field:
 *   • a count badge over the floating orb (#inkling-fab)
 *   • a slide-in panel listing upcoming reminders, each tinted by its category
 *     colour (the same "colour word system" used across the app)
 *
 * Reads the canonical alerts store (alertsModel) and stays in sync via the bus.
 */
import * as bus from "../../utils/EventBus.js";
import {
  getUpcomingAlerts,
  getTimeUntil,
  dismissAlert,
  snoozeAlert
} from "../alerts/alertsModel.js";
import { getCategoryColor, formatTimelineDisplayTime } from "../../wordweaver/timelineModel.js";
import { recomputeSchedule } from "../alerts/alertsScheduler.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const CAT_LABEL = {
  health: "Health", study: "Study", work: "Work", personal: "Personal",
  creative: "Creative", errands: "Errands", reminder: "Reminder",
  appointment: "Appointment", deadline: "Deadline", default: "Reminder"
};

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function relLabel(triggerAt, now = Date.now()) {
  if (triggerAt <= now) return "now";
  const raw = getTimeUntil(triggerAt, now);
  if (raw === "now" || raw === "less than a minute") return "soon";
  return `in ${raw}`;
}

export class InklingAlerts {
  /** @param {HTMLElement | null} orbEl */
  constructor(orbEl) {
    this.orb = orbEl;
    this._panel = null;
    this._badge = null;
    /** @type {{alert:any, triggerAt:number}[]} */
    this._rows = [];
    this._refresh = this._refresh.bind(this);

    this._buildBadge();

    for (const ev of ["alertTriggered", "eventCreated", "eventUpdated", "eventDeleted", "initialized", "starterDataCleared"]) {
      try { bus.on(ev, this._refresh); } catch { /* ignore */ }
    }
    // Keep counts + relative labels fresh.
    this._timer = setInterval(this._refresh, 60_000);
    this._refresh();
  }

  // --- badge over the orb ---

  _buildBadge() {
    if (!this.orb || this._badge) return;
    const b = document.createElement("span");
    b.id = "inkling-alert-badge";
    b.style.cssText =
      "position:absolute;top:-5px;right:-5px;min-width:20px;height:20px;padding:0 5px;border-radius:11px;" +
      "background:linear-gradient(180deg,#f87171,#dc2626);color:#fff;font:800 11px system-ui;" +
      "display:none;align-items:center;justify-content:center;box-shadow:0 2px 7px rgba(0,0,0,.45);" +
      "border:1.5px solid rgba(255,255,255,.85);z-index:3;cursor:pointer;pointer-events:auto";
    // Don't let a badge tap start an orb drag / open the orb menu.
    b.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); this.toggle(); });
    this.orb.appendChild(b);
    this._badge = b;
  }

  _refresh() {
    let rows = [];
    try { rows = getUpcomingAlerts(Date.now(), { withinMs: WEEK_MS }); } catch { /* ignore */ }
    this._rows = rows;
    const now = Date.now();
    const soon = rows.filter((r) => r.triggerAt - now <= DAY_MS).length;
    if (this._badge) {
      this._badge.textContent = soon > 9 ? "9+" : String(soon);
      this._badge.style.display = soon > 0 ? "flex" : "none";
    }
    if (this._panel && this._panel.style.display !== "none") this._render();
  }

  // --- the dedicated panel ---

  _buildPanel() {
    if (this._panel) return;
    const panel = document.createElement("div");
    panel.id = "inkling-alerts-panel";
    panel.style.cssText =
      "position:fixed;top:0;right:0;bottom:0;width:min(360px,90vw);z-index:11080;display:none;" +
      "flex-direction:column;background:rgba(8,12,22,0.96);backdrop-filter:blur(12px);" +
      "border-left:1px solid rgba(244,114,182,0.4);color:#e2e8f0;font:600 12px system-ui;" +
      "box-shadow:-14px 0 44px rgba(0,0,0,0.55)";

    const head = document.createElement("div");
    head.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:15px 15px 11px;border-bottom:1px solid rgba(255,255,255,0.1)";
    const title = document.createElement("div");
    title.textContent = "🔔 Inkling Alerts";
    title.style.cssText = "font:800 17px system-ui;letter-spacing:.3px;color:#fbcfe8";
    const close = document.createElement("button");
    close.textContent = "✕";
    close.title = "Close";
    close.style.cssText =
      "background:#1e293b;color:#e2e8f0;border:0;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:14px;flex:0 0 auto";
    close.addEventListener("click", () => this.hide());
    head.append(title, close);

    const body = document.createElement("div");
    body.style.cssText = "flex:1;overflow:auto;padding:12px 14px";

    panel.append(head, body);
    document.body.appendChild(panel);
    this._panel = panel;
    this._panelBody = body;
  }

  _render() {
    this._buildPanel();
    const body = this._panelBody;
    body.textContent = "";
    const now = Date.now();

    if (!this._rows.length) {
      const empty = document.createElement("div");
      empty.innerHTML =
        "No reminders set.<br><span style='opacity:.65;font-size:12px'>Add one in Schedule, or ask Inkling “remind me at 7pm to…”</span>";
      empty.style.cssText = "color:#94a3b8;font-size:13px;padding:8px 2px;line-height:1.5";
      body.appendChild(empty);
      return;
    }

    for (const { alert, triggerAt } of this._rows) {
      const cat = String(alert.category ?? "reminder").toLowerCase();
      const color = getCategoryColor(cat === "errand" ? "errands" : cat) || "#94a3b8";
      const row = document.createElement("div");
      row.style.cssText =
        `display:flex;align-items:flex-start;gap:9px;padding:9px 10px;margin-bottom:7px;border-radius:9px;` +
        `border-left:4px solid ${color};background:rgba(255,255,255,0.05)`;

      const left = document.createElement("div");
      left.style.cssText = "flex:1;min-width:0";
      left.innerHTML =
        `<div style="font:800 13px system-ui;color:${color}">${escapeHtml(formatTimelineDisplayTime(alert.time))}` +
        `<span style="color:#64748b;font-weight:600;font-size:11px;margin-left:8px">${escapeHtml(CAT_LABEL[cat] ?? cat)}</span></div>` +
        `<div style="font:600 13px system-ui;color:#f1f5f9;margin-top:2px;white-space:normal;word-break:break-word">${escapeHtml(alert.text || "Reminder")}</div>` +
        `<div style="font-size:11px;color:#94a3b8;margin-top:3px">${escapeHtml(relLabel(triggerAt, now))}</div>`;

      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;flex-direction:column;gap:4px;flex:0 0 auto";
      const snooze = document.createElement("button");
      snooze.textContent = "💤 10m";
      snooze.title = "Snooze 10 minutes";
      snooze.style.cssText = "background:#1e293b;color:#cbd5e1;border:0;border-radius:7px;padding:4px 7px;font:700 11px system-ui;cursor:pointer";
      snooze.addEventListener("click", () => {
        try { snoozeAlert(alert.id, 10); recomputeSchedule(); } catch { /* ignore */ }
        this._refresh();
      });
      const dismiss = document.createElement("button");
      dismiss.textContent = "✕";
      dismiss.title = "Dismiss";
      dismiss.style.cssText = "background:transparent;color:#64748b;border:0;border-radius:7px;padding:4px 7px;font:800 13px system-ui;cursor:pointer";
      dismiss.addEventListener("click", () => { try { dismissAlert(alert.id); } catch { /* ignore */ } this._refresh(); });
      actions.append(snooze, dismiss);

      row.append(left, actions);
      body.appendChild(row);
    }
  }

  // --- visibility ---

  toggle() {
    this._buildPanel();
    if (this._panel.style.display === "none" || !this._panel.style.display) this.show();
    else this.hide();
  }

  show() {
    this._buildPanel();
    this._render();
    this._panel.style.display = "flex";
  }

  hide() {
    if (this._panel) this._panel.style.display = "none";
  }

  dispose() {
    clearInterval(this._timer);
    this._panel?.remove();
    this._badge?.remove();
  }
}
