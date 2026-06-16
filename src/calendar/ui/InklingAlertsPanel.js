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
  getAlertsAwaitingReview,
  getResolvedAlerts,
  getTimeUntil,
  getTimeAgo,
  dismissAlert,
  snoozeAlert,
  setAlertStatus,
  setAlertRemark
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

// --- opt-in "colour word system": tint category keywords in alert summaries ---

const COLOR_WORDS_KEY = "inkling-color-alert-words";
/** keyword → category (for getCategoryColor). */
const WORD_CAT = {
  health: "health", gym: "health", workout: "health", doctor: "health", dentist: "health", yoga: "health", run: "health", appointment: "health",
  work: "work", meeting: "work", standup: "work", client: "work", deadline: "work", project: "work", office: "work", call: "work",
  study: "study", exam: "study", class: "study", homework: "study", lecture: "study", course: "study", reading: "study",
  personal: "personal", family: "personal", birthday: "personal",
  creative: "creative", sketch: "creative", design: "creative", paint: "creative", music: "creative",
  errand: "errands", errands: "errands", grocery: "errands", groceries: "errands", shopping: "errands", bank: "errands"
};
let _colorRe = null;
function colorRe() {
  if (!_colorRe) _colorRe = new RegExp(`\\b(${Object.keys(WORD_CAT).join("|")})\\b`, "gi");
  return _colorRe;
}

/** @returns {boolean} */
export function isAlertWordColorOn() {
  try { return localStorage.getItem(COLOR_WORDS_KEY) === "1"; } catch { return false; }
}
/** @param {boolean} on */
export function setAlertWordColor(on) {
  try { localStorage.setItem(COLOR_WORDS_KEY, on ? "1" : "0"); } catch { /* ignore */ }
}

/**
 * Wrap category keywords in colour spans. Input MUST already be HTML-escaped
 * plain text (no tags) so we don't corrupt markup.
 * @param {string} escaped
 * @returns {string}
 */
export function colorizeAlertWords(escaped) {
  if (!isAlertWordColorOn()) return escaped;
  return String(escaped).replace(colorRe(), (m) => {
    const color = getCategoryColor(WORD_CAT[m.toLowerCase()]) || "#a5b4fc";
    return `<span style="color:${color};font-weight:800">${m}</span>`;
  });
}

function relLabel(triggerAt, now = Date.now()) {
  // Past alerts show how long ago they fired (e.g. "8 hours ago") so the user
  // can decide whether to clear them — not a misleading "now".
  if (triggerAt <= now) return getTimeAgo(triggerAt, now);
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
    // Oval count pill that sits JUST OUTSIDE the orb's top-right circumference
    // (orb is overflow:visible) so it's never clipped. A short grey leader dash
    // ties it to the orb. Tap the pill to open Alerts directly; tapping the orb
    // opens the menu (which also has Alerts).
    const b = document.createElement("span");
    b.id = "inkling-alert-badge";
    b.style.cssText =
      "position:absolute;top:-9px;right:-16px;min-width:22px;height:21px;padding:0 8px;border-radius:11px;" +
      "background:linear-gradient(180deg,#f87171,#dc2626);color:#fff;font:800 12px system-ui;" +
      "display:none;align-items:center;justify-content:center;box-shadow:0 3px 9px rgba(0,0,0,.5);" +
      "border:1.5px solid rgba(255,255,255,.9);z-index:4;cursor:pointer;pointer-events:auto;white-space:nowrap";
    // grey leader dash between orb edge and the pill
    const dash = document.createElement("span");
    dash.style.cssText =
      "position:absolute;top:6px;right:-7px;width:8px;height:2px;border-radius:1px;background:rgba(148,163,184,.85);z-index:3;pointer-events:none";
    // Don't let a badge tap start an orb drag / open the orb menu.
    b.addEventListener("pointerdown", (e) => { e.stopPropagation(); e.preventDefault(); this.toggle(); });
    this.orb.appendChild(dash);
    this.orb.appendChild(b);
    this._badge = b;
    this._badgeDash = dash;
  }

  _refresh() {
    const now = Date.now();
    let rows = [], awaiting = [], resolved = [];
    try { rows = getUpcomingAlerts(now, { withinMs: WEEK_MS }); } catch { /* ignore */ }
    try { awaiting = getAlertsAwaitingReview(now); } catch { /* ignore */ }
    try { resolved = getResolvedAlerts(now); } catch { /* ignore */ }
    this._rows = rows;
    this._awaiting = awaiting;
    this._resolved = resolved;
    // Badge nags for soon-upcoming (24h) PLUS anything overdue still unchecked.
    const soon = rows.filter((r) => r.triggerAt - now <= DAY_MS).length + awaiting.length;
    if (this._badge) {
      this._badge.textContent = soon > 9 ? "9+" : String(soon);
      this._badge.style.display = soon > 0 ? "flex" : "none";
      if (this._badgeDash) this._badgeDash.style.display = soon > 0 ? "block" : "none";
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
    // Opt-in: colour category keywords in alert text.
    const colorBtn = document.createElement("button");
    const syncColorBtn = () => {
      const on = isAlertWordColorOn();
      colorBtn.textContent = on ? "🎨 On" : "🎨 Off";
      colorBtn.style.opacity = on ? "1" : "0.6";
    };
    colorBtn.title = "Colour the category words in reminders";
    colorBtn.style.cssText =
      "background:#1e293b;color:#e2e8f0;border:0;border-radius:8px;height:30px;padding:0 9px;cursor:pointer;font:700 11px system-ui;flex:0 0 auto";
    colorBtn.addEventListener("click", () => { setAlertWordColor(!isAlertWordColorOn()); syncColorBtn(); this._render(); });
    syncColorBtn();

    const close = document.createElement("button");
    close.textContent = "✕";
    close.title = "Close";
    close.style.cssText =
      "background:#1e293b;color:#e2e8f0;border:0;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:14px;flex:0 0 auto";
    close.addEventListener("click", () => this.hide());

    const headRight = document.createElement("div");
    headRight.style.cssText = "display:flex;align-items:center;gap:6px;flex:0 0 auto";
    headRight.append(colorBtn, close);
    head.append(title, headRight);

    const body = document.createElement("div");
    body.style.cssText = "flex:1;overflow:auto;padding:12px 14px";

    panel.append(head, body);
    document.body.appendChild(panel);
    this._panel = panel;
    this._panelBody = body;
  }

  _sectionHead(text, color) {
    const h = document.createElement("div");
    h.textContent = text;
    h.style.cssText =
      `font:800 11px system-ui;letter-spacing:.5px;text-transform:uppercase;color:${color};margin:12px 2px 7px;opacity:.9`;
    return h;
  }

  /**
   * One alert row. mode: "awaiting" | "upcoming" | "resolved".
   * @returns {HTMLElement}
   */
  _buildRow(alert, triggerAt, mode, now) {
    const cat = String(alert.category ?? "reminder").toLowerCase();
    const color = getCategoryColor(cat === "errand" ? "errands" : cat) || "#94a3b8";
    const resolved = mode === "resolved";
    const row = document.createElement("div");
    row.style.cssText =
      `display:flex;flex-direction:column;gap:7px;padding:9px 10px;margin-bottom:7px;border-radius:9px;` +
      `border-left:4px solid ${color};background:rgba(255,255,255,${resolved ? "0.03" : "0.05"})` +
      (resolved ? ";opacity:.72" : "");

    const left = document.createElement("div");
    left.style.cssText = "flex:1;min-width:0";
    const metaLine = resolved
      ? (alert.status === "done"
          ? "<span style='color:#34d399;font-weight:800'>✓ Accomplished</span>"
          : "<span style='color:#f87171;font-weight:800'>✗ Missed</span>")
      : escapeHtml(relLabel(triggerAt, now));
    const textStyle = resolved ? "text-decoration:line-through;color:#cbd5e1" : "color:#f1f5f9";
    left.innerHTML =
      `<div style="font:800 13px system-ui;color:${color}">${escapeHtml(formatTimelineDisplayTime(alert.time))}` +
      `<span style="color:#64748b;font-weight:600;font-size:11px;margin-left:8px">${escapeHtml(CAT_LABEL[cat] ?? cat)}</span></div>` +
      `<div style="font:600 13px system-ui;${textStyle};margin-top:2px;white-space:normal;word-break:break-word">${colorizeAlertWords(escapeHtml(alert.text || "Reminder"))}</div>` +
      `<div style="font-size:11px;color:#94a3b8;margin-top:3px">${metaLine}</div>`;

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;flex-direction:column;gap:4px;flex:0 0 auto";
    const mkBtn = (label, title, css, fn) => {
      const b = document.createElement("button");
      b.textContent = label; b.title = title; b.style.cssText = css;
      b.addEventListener("click", fn);
      return b;
    };
    const doneCss = "background:#064e3b;color:#a7f3d0;border:0;border-radius:7px;padding:4px 8px;font:800 13px system-ui;cursor:pointer";
    const missCss = "background:#4c0519;color:#fecdd3;border:0;border-radius:7px;padding:4px 8px;font:800 13px system-ui;cursor:pointer";
    const subCss = "background:#1e293b;color:#cbd5e1;border:0;border-radius:7px;padding:4px 7px;font:700 11px system-ui;cursor:pointer";

    if (resolved) {
      actions.append(mkBtn("↩", "Undo — back to pending", subCss, () => {
        try { setAlertStatus(alert.id, "pending"); } catch { /* ignore */ }
        this._refresh();
      }));
    } else {
      actions.append(
        mkBtn("✓", "Accomplished", doneCss, () => { try { setAlertStatus(alert.id, "done"); } catch { /* ignore */ } this._refresh(); }),
        mkBtn("✗", "Missed / unattained", missCss, () => { try { setAlertStatus(alert.id, "missed"); } catch { /* ignore */ } this._refresh(); })
      );
      if (mode === "upcoming") {
        actions.append(mkBtn("💤", "Snooze 10 minutes", subCss, () => {
          try { snoozeAlert(alert.id, 10); recomputeSchedule(); } catch { /* ignore */ }
          this._refresh();
        }));
      }
      actions.append(mkBtn("✕", "Dismiss (remove entirely)",
        "background:transparent;color:#64748b;border:0;border-radius:7px;padding:4px 7px;font:800 13px system-ui;cursor:pointer",
        () => { try { dismissAlert(alert.id); } catch { /* ignore */ } this._refresh(); }));
    }

    const topRow = document.createElement("div");
    topRow.style.cssText = "display:flex;align-items:flex-start;gap:9px";
    topRow.append(left, actions);
    row.appendChild(topRow);

    // Remark box — annotate fired/reviewed alerts ("no show" etc.); persists for
    // later review in WordWeaver.
    if (mode === "awaiting" || resolved) {
      const rrow = document.createElement("div");
      rrow.style.cssText = "display:flex;gap:6px;align-items:center";
      const remark = document.createElement("input");
      remark.type = "text";
      remark.value = alert.remark || "";
      remark.placeholder = "📝 remark (e.g. no show)…";
      remark.style.cssText =
        "flex:1;min-width:0;box-sizing:border-box;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);" +
        "border-radius:7px;padding:6px 9px;color:#e2e8f0;font:600 12px system-ui;outline:none";
      const saveBtn = document.createElement("button");
      saveBtn.textContent = "Save";
      saveBtn.title = "Save remark";
      saveBtn.style.cssText =
        "flex:0 0 auto;background:#1e293b;color:#cbd5e1;border:0;border-radius:7px;padding:6px 10px;font:700 11px system-ui;cursor:pointer";
      const doSave = () => {
        try { setAlertRemark(alert.id, remark.value); } catch { /* ignore */ }
        // Unmistakable confirmation: button flashes solid green, input border too.
        saveBtn.textContent = "✓ Saved";
        saveBtn.style.background = "#16a34a";
        saveBtn.style.color = "#ffffff";
        remark.style.borderColor = "#16a34a";
        setTimeout(() => {
          saveBtn.textContent = "Save";
          saveBtn.style.background = "#1e293b";
          saveBtn.style.color = "#cbd5e1";
          remark.style.borderColor = "rgba(255,255,255,0.14)";
        }, 1500);
      };
      saveBtn.addEventListener("click", doSave);
      // Also persist on blur so an un-clicked edit isn't lost; Enter = save.
      remark.addEventListener("change", () => { try { setAlertRemark(alert.id, remark.value); } catch { /* ignore */ } });
      remark.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") doSave(); });
      rrow.append(remark, saveBtn);
      row.appendChild(rrow);
    }
    return row;
  }

  _render() {
    this._buildPanel();
    const body = this._panelBody;
    body.textContent = "";
    const now = Date.now();

    const hasAny = (this._rows?.length || this._awaiting?.length || this._resolved?.length);
    if (!hasAny) {
      const empty = document.createElement("div");
      empty.innerHTML =
        "No reminders set.<br><span style='opacity:.65;font-size:12px'>Add one in Schedule, or ask Inkling “remind me at 7pm to…”</span>";
      empty.style.cssText = "color:#94a3b8;font-size:13px;padding:8px 2px;line-height:1.5";
      body.appendChild(empty);
      return;
    }

    // Awaiting your check first — fired alerts persist here until you ✓/✗ them.
    if (this._awaiting?.length) {
      body.appendChild(this._sectionHead(`✅ Awaiting your check · ${this._awaiting.length}`, "#fca5a5"));
      for (const { alert, triggerAt } of this._awaiting) {
        body.appendChild(this._buildRow(alert, triggerAt, "awaiting", now));
      }
    }
    if (this._rows?.length) {
      body.appendChild(this._sectionHead("⏰ Upcoming", "#a5b4fc"));
      for (const { alert, triggerAt } of this._rows) {
        body.appendChild(this._buildRow(alert, triggerAt, "upcoming", now));
      }
    }
    if (this._resolved?.length) {
      body.appendChild(this._sectionHead("🗂 Reviewed", "#64748b"));
      for (const alert of this._resolved) {
        body.appendChild(this._buildRow(alert, null, "resolved", now));
      }
    }
  }

  // --- visibility ---

  toggle() {
    this._buildPanel();
    if (this._panel.style.display === "none" || !this._panel.style.display) this.show();
    else this.hide();
  }

  /**
   * @param {{ full?: boolean, onClose?: () => void }} [opts]
   *   full   — render as a centered full-screen surface (used as the Alerts tab)
   *            instead of the right-edge slide-in (used from the orb badge).
   *   onClose — called when the ✕ is pressed (e.g. to close the nav stage).
   */
  show(opts = {}) {
    this._buildPanel();
    this._onClose = opts.onClose || null;
    const full = !!opts.full;
    this._panel.style.width = full ? "100%" : "min(360px,90vw)";
    this._panel.style.borderLeft = full ? "0" : "1px solid rgba(244,114,182,0.4)";
    this._panelBody.style.maxWidth = full ? "640px" : "none";
    this._panelBody.style.margin = full ? "0 auto" : "0";
    this._panelBody.style.width = full ? "100%" : "auto";
    this._render();
    this._panel.style.display = "flex";
  }

  hide({ silent = false } = {}) {
    if (this._panel) this._panel.style.display = "none";
    const cb = this._onClose;
    this._onClose = null;
    if (cb && !silent) { try { cb(); } catch { /* ignore */ } }
  }

  dispose() {
    clearInterval(this._timer);
    this._panel?.remove();
    this._badge?.remove();
  }
}
