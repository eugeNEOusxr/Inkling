/**
 * AlarmClock — a captivating analog clock + Alarm / Stopwatch / Timer.
 *
 * The live analog face ticks in real time; in Alarm mode you tap the face to set
 * the minute and pick the hour, then "Set alarm" registers it in the canonical
 * alerts store so it fires on time (sound + notification) like any reminder.
 */
import { createAlert, addAlert, getUpcomingAlerts, dismissAlert } from "../alerts/alertsModel.js";
import { recomputeSchedule } from "../alerts/alertsScheduler.js";
import { playAlertSound } from "../alerts/alertSounds.js";

const pad = (n) => String(n).padStart(2, "0");
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDay = (iso) => {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y) return "";
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

export class AlarmClock {
  constructor(app) {
    this.app = app;
    this._el = null;
    this._tab = "clock";
    // alarm draft (24h)
    this._alarmH = new Date().getHours();
    this._alarmM = 0;
    this._settingPhase = "hour"; // first tap = hour hand, second tap = minute hand
    this._ampm = this._alarmH >= 12 ? "PM" : "AM";
    this._alarmDate = isoToday(); // which DAY the alarm fires on (defaults today)
    // stopwatch
    this._swRunning = false;
    this._swStart = 0;
    this._swAcc = 0;
    this._laps = [];
    // timer
    this._timerEnd = 0;
    this._timerRunning = false;
    this._timerFired = false;
    this._timerDur = 5 * 60 * 1000; // default 5 min
    this._tick = this._tick.bind(this);
  }

  // ---------- styles + shell ----------

  _injectStyles() {
    if (document.getElementById("alarm-clock-styles")) return;
    const s = document.createElement("style");
    s.id = "alarm-clock-styles";
    s.textContent = `
      #alarm-clock {
        position:fixed; inset:0; z-index:11070; display:none; flex-direction:column;
        background:radial-gradient(ellipse at 50% -10%, #1a2350 0%, #0b1024 55%, #05060f 100%);
        color:#e6ebff; font-family:system-ui,sans-serif; overflow:auto;
      }
      #alarm-clock .ac-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; }
      #alarm-clock .ac-title { font:800 18px system-ui; color:#c7d2fe; }
      #alarm-clock .ac-x { background:#1e293b; color:#e2e8f0; border:0; border-radius:9px; width:34px; height:34px; cursor:pointer; font-size:15px; }
      #alarm-clock .ac-tabs { display:flex; gap:6px; justify-content:center; flex-wrap:wrap; padding:0 12px 8px; }
      #alarm-clock .ac-tab { border:0; border-radius:999px; padding:8px 16px; font:700 12px system-ui; cursor:pointer; background:#1e293b; color:#9aa6c9; }
      #alarm-clock .ac-tab.on { background:#312e81; color:#e0e7ff; }
      #alarm-clock .ac-body { flex:1; display:flex; flex-direction:column; align-items:center; gap:14px; padding:10px 16px 40px; }
      #alarm-clock .ac-digital { font:800 clamp(34px,9vw,58px) ui-monospace,monospace; letter-spacing:2px; color:#e6ebff; text-shadow:0 0 18px rgba(129,140,248,.5); }
      #alarm-clock .ac-sub { font:600 13px system-ui; color:#9aa6c9; margin-top:-6px; }
      #alarm-clock .ac-clock { width:min(74vw,300px); height:min(74vw,300px); cursor:default; }
      #alarm-clock.ac-set .ac-clock { cursor:crosshair; }
      #alarm-clock .ac-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:center; }
      #alarm-clock input, #alarm-clock select {
        background:rgba(255,255,255,.08); color:#e6ebff; border:1px solid rgba(129,140,248,.4);
        border-radius:9px; padding:9px 11px; font:700 14px system-ui;
      }
      #alarm-clock .ac-btn { border:0; border-radius:10px; padding:10px 18px; font:800 13px system-ui; cursor:pointer; background:#6366f1; color:#fff; }
      #alarm-clock .ac-btn.ghost { background:#1e293b; color:#cbd5e1; }
      #alarm-clock .ac-list { width:100%; max-width:420px; display:flex; flex-direction:column; gap:7px; }
      #alarm-clock .ac-item { display:flex; align-items:center; gap:10px; background:rgba(255,255,255,.05); border-left:4px solid #818cf8; border-radius:9px; padding:9px 12px; }
      #alarm-clock .ac-item .t { font:800 18px ui-monospace,monospace; }
      #alarm-clock .ac-item .l { flex:1; font:600 13px system-ui; color:#cbd5e1; }
      #alarm-clock .ac-del { background:transparent; color:#64748b; border:0; cursor:pointer; font:800 14px system-ui; }
      @keyframes ac-flash { 0%,100%{filter:none} 50%{filter:brightness(1.5) drop-shadow(0 0 20px #f87171)} }
      #alarm-clock.ac-timer-done { animation:ac-flash .7s ease-in-out 6; }
    `;
    document.head.appendChild(s);
  }

  _clockSvg() {
    let ticks = "";
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const r1 = i % 5 === 0 ? 80 : 86, r2 = 90, w = i % 5 === 0 ? 2.4 : 1;
      const x1 = 100 + Math.sin(a) * r1, y1 = 100 - Math.cos(a) * r1;
      const x2 = 100 + Math.sin(a) * r2, y2 = 100 - Math.cos(a) * r2;
      ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${i % 5 === 0 ? "#c7d2fe" : "#475569"}" stroke-width="${w}"/>`;
    }
    let nums = "";
    for (let h = 1; h <= 12; h++) {
      const a = (h / 12) * Math.PI * 2;
      const x = 100 + Math.sin(a) * 68, y = 100 - Math.cos(a) * 68;
      nums += `<text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle" font-family="system-ui" font-weight="800" font-size="13" fill="#aab6e8">${h}</text>`;
    }
    return `<svg class="ac-clock" viewBox="0 0 200 200">
      <defs>
        <radialGradient id="ac-face" cx="42%" cy="38%" r="75%">
          <stop offset="0%" stop-color="#1b2552"/><stop offset="70%" stop-color="#0d1430"/><stop offset="100%" stop-color="#070b1c"/>
        </radialGradient>
        <filter id="ac-glow"><feGaussianBlur stdDeviation="1.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <circle cx="100" cy="100" r="96" fill="url(#ac-face)" stroke="#3b4a8a" stroke-width="3"/>
      ${ticks}${nums}
      <g filter="url(#ac-glow)">
        <line id="ac-h-hour" x1="100" y1="100" x2="100" y2="52" stroke="#e6ebff" stroke-width="5" stroke-linecap="round"/>
        <line id="ac-h-min" x1="100" y1="100" x2="100" y2="30" stroke="#a5b4fc" stroke-width="3.4" stroke-linecap="round"/>
        <line id="ac-h-sec" x1="100" y1="108" x2="100" y2="22" stroke="#f472b6" stroke-width="1.6" stroke-linecap="round"/>
      </g>
      <line id="ac-h-alarm" x1="100" y1="100" x2="100" y2="40" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 3" opacity="0"/>
      <circle cx="100" cy="100" r="4.5" fill="#e6ebff"/>
    </svg>`;
  }

  _build() {
    if (this._el) return;
    this._injectStyles();
    const el = document.createElement("div");
    el.id = "alarm-clock";
    el.innerHTML = `
      <div class="ac-head">
        <div class="ac-title">⏰ Alarm Clock</div>
        <button class="ac-x" title="Close">✕</button>
      </div>
      <div class="ac-tabs">
        <button class="ac-tab" data-tab="clock">Clock</button>
        <button class="ac-tab" data-tab="alarm">Alarm</button>
        <button class="ac-tab" data-tab="stopwatch">Stopwatch</button>
        <button class="ac-tab" data-tab="timer">Timer</button>
      </div>
      <div class="ac-body">
        ${this._clockSvg()}
        <div class="ac-digital">--:--:--</div>
        <div class="ac-sub"></div>
        <div class="ac-controls"></div>
        <div class="ac-list"></div>
      </div>`;
    document.body.appendChild(el);
    this._el = el;
    this._digital = el.querySelector(".ac-digital");
    this._subEl = el.querySelector(".ac-sub");
    this._controls = el.querySelector(".ac-controls");
    this._listEl = el.querySelector(".ac-list");
    this._svg = el.querySelector(".ac-clock");

    el.querySelector(".ac-x").addEventListener("click", () => this.hide());
    el.querySelectorAll(".ac-tab").forEach((b) => b.addEventListener("click", () => this._setTab(b.dataset.tab)));
    // Tap the standstill face (Alarm mode): 1st tap = HOUR hand, 2nd = MINUTE.
    this._svg.addEventListener("click", (e) => {
      if (this._tab !== "alarm") return;
      const r = this._svg.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      let deg = Math.atan2(dx, -dy) * 180 / Math.PI;
      if (deg < 0) deg += 360;
      if (this._settingPhase === "hour") {
        let h12 = Math.round(deg / 30) % 12;
        if (h12 === 0) h12 = 12;
        this._alarmH = this._ampm === "PM" ? (h12 % 12) + 12 : h12 % 12;
        this._settingPhase = "minute";
      } else {
        this._alarmM = Math.round(deg / 6) % 60;
        this._settingPhase = "hour";
      }
      this._renderControls();
      this._tick();
    });
  }

  // ---------- tabs ----------

  _setTab(tab) {
    this._tab = tab;
    this._el.classList.toggle("ac-set", tab === "alarm");
    this._el.querySelectorAll(".ac-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    this._renderControls();
    this._tick();
  }

  _renderControls() {
    const c = this._controls;
    const list = this._listEl;
    c.innerHTML = ""; list.innerHTML = "";
    if (this._tab === "clock") {
      this._subEl.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    } else if (this._tab === "alarm") {
      this._subEl.innerHTML = this._settingPhase === "hour"
        ? "First tap the clock to set the <b style='color:#22d3ee'>HOUR</b>"
        : "Now tap to set the <b style='color:#22d3ee'>MINUTE</b>";
      if (!this._alarmDate) this._alarmDate = isoToday();
      c.innerHTML = `
        <div class="ac-row">
          <label style="font-size:12px;color:#94a3b8">On</label>
          <input type="date" class="ac-date" value="${this._alarmDate}" min="${isoToday()}"/>
        </div>
        <div class="ac-row">
          <input type="time" class="ac-time" value="${pad(this._alarmH)}:${pad(this._alarmM)}"/>
          <button class="ac-btn ghost ac-ampm" title="AM / PM">${this._ampm}</button>
        </div>
        <div class="ac-row">
          <input type="text" class="ac-label" placeholder="Label (optional)" style="min-width:170px"/>
          <button class="ac-btn ac-set-alarm">Set alarm</button>
        </div>`;
      c.querySelector(".ac-date").addEventListener("input", (e) => {
        if (e.target.value) this._alarmDate = e.target.value;
      });
      c.querySelector(".ac-time").addEventListener("input", (e) => {
        const [h, m] = e.target.value.split(":").map(Number);
        if (Number.isFinite(h)) { this._alarmH = h; this._ampm = h >= 12 ? "PM" : "AM"; }
        if (Number.isFinite(m)) this._alarmM = m;
        this._renderControls();
        this._tick();
      });
      c.querySelector(".ac-ampm").addEventListener("click", () => {
        this._ampm = this._ampm === "AM" ? "PM" : "AM";
        const h12 = this._alarmH % 12;
        this._alarmH = this._ampm === "PM" ? h12 + 12 : h12;
        this._renderControls();
        this._tick();
      });
      c.querySelector(".ac-set-alarm").addEventListener("click", () => this._addAlarm(c.querySelector(".ac-label").value));
      this._renderAlarmList();
    } else if (this._tab === "stopwatch") {
      this._subEl.textContent = "";
      c.innerHTML = `
        <div class="ac-row">
          <button class="ac-btn ac-sw-toggle">${this._swRunning ? "Stop" : "Start"}</button>
          <button class="ac-btn ghost ac-sw-lap">Lap</button>
          <button class="ac-btn ghost ac-sw-reset">Reset</button>
        </div>`;
      c.querySelector(".ac-sw-toggle").addEventListener("click", () => this._swToggle());
      c.querySelector(".ac-sw-lap").addEventListener("click", () => this._swLap());
      c.querySelector(".ac-sw-reset").addEventListener("click", () => this._swReset());
    } else if (this._tab === "timer") {
      this._subEl.textContent = "";
      const total = Math.round(this._timerDur / 1000);
      c.innerHTML = `
        <div class="ac-row">
          <input type="number" class="ac-th" min="0" max="23" value="${Math.floor(total / 3600)}" style="width:64px"/> :
          <input type="number" class="ac-tm" min="0" max="59" value="${Math.floor((total % 3600) / 60)}" style="width:64px"/> :
          <input type="number" class="ac-ts" min="0" max="59" value="${total % 60}" style="width:64px"/>
        </div>
        <div class="ac-row">
          <button class="ac-btn ac-timer-toggle">${this._timerRunning ? "Pause" : "Start"}</button>
          <button class="ac-btn ghost ac-timer-reset">Reset</button>
        </div>`;
      const readDur = () => {
        const h = +c.querySelector(".ac-th").value || 0, m = +c.querySelector(".ac-tm").value || 0, s = +c.querySelector(".ac-ts").value || 0;
        return (h * 3600 + m * 60 + s) * 1000;
      };
      c.querySelectorAll("input").forEach((i) => i.addEventListener("input", () => { if (!this._timerRunning) this._timerDur = readDur(); }));
      c.querySelector(".ac-timer-toggle").addEventListener("click", () => this._timerToggle(readDur));
      c.querySelector(".ac-timer-reset").addEventListener("click", () => this._timerReset());
    }
  }

  // ---------- alarms ----------

  _addAlarm(label) {
    const now = new Date();
    const today = isoToday();
    let dateIso = this._alarmDate || today;
    const [Y, Mo, Da] = dateIso.split("-").map(Number);
    const d = new Date(Y, (Mo || 1) - 1, Da || 1, this._alarmH, this._alarmM, 0, 0);
    // Only auto-roll to tomorrow when the user left the date on TODAY and the
    // chosen time has already passed (preserves the old quick-set convenience).
    if (d.getTime() <= now.getTime() && dateIso === today) {
      d.setDate(d.getDate() + 1);
      dateIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    const time = `${pad(this._alarmH)}:${pad(this._alarmM)}`;
    const labelText = String(label || "").trim();
    try {
      addAlert(createAlert({
        time,
        date: dateIso,
        text: labelText || "Alarm",
        category: "reminder",
        kind: "sound",
        priority: 0
      }));
      recomputeSchedule();
    } catch { /* ignore */ }
    // Join with Inkling: let it acknowledge the alarm (it also shows in the
    // Inkling alerts panel since both read the same alerts store).
    try {
      this.app?.inklingPanel?.notifyProactive?.(`⏰ Alarm set for ${fmtDay(dateIso)} at ${time}${labelText ? ` — “${labelText}”` : ""}. I'll wake you.`);
    } catch { /* ignore */ }
    this._renderAlarmList();
  }

  _renderAlarmList() {
    if (this._tab !== "alarm" || !this._listEl) return;
    let rows = [];
    try { rows = getUpcomingAlerts(Date.now(), { withinMs: 14 * 24 * 3600 * 1000 }); } catch { /* ignore */ }
    this._listEl.innerHTML = "";
    if (!rows.length) {
      this._listEl.innerHTML = `<div style="color:#64748b;text-align:center;font-size:13px">No alarms set.</div>`;
      return;
    }
    for (const { alert } of rows) {
      const row = document.createElement("div");
      row.className = "ac-item";
      const dayLabel = alert.date === isoToday() ? "Today" : fmtDay(alert.date);
      row.innerHTML = `<span class="t">${alert.time}</span><span class="d" style="color:#7dd3fc;font-size:12px;min-width:84px">${dayLabel}</span><span class="l">${(alert.text || "Alarm").replace(/[<>&]/g, "")}</span><button class="ac-del" title="Delete">✕</button>`;
      row.querySelector(".ac-del").addEventListener("click", () => {
        try { dismissAlert(alert.id); recomputeSchedule(); } catch { /* ignore */ }
        this._renderAlarmList();
      });
      this._listEl.appendChild(row);
    }
  }

  // ---------- stopwatch ----------

  _swElapsed() { return this._swAcc + (this._swRunning ? Date.now() - this._swStart : 0); }
  _swToggle() {
    if (this._swRunning) { this._swAcc = this._swElapsed(); this._swRunning = false; }
    else { this._swStart = Date.now(); this._swRunning = true; }
    this._renderControls();
  }
  _swLap() { if (this._swRunning || this._swAcc) { this._laps.unshift(this._swElapsed()); this._renderLaps(); } }
  _swReset() { this._swRunning = false; this._swAcc = 0; this._laps = []; this._renderControls(); this._tick(); }
  _renderLaps() {
    if (this._tab !== "stopwatch") return;
    this._listEl.innerHTML = this._laps.map((ms, i) => `<div class="ac-item"><span class="t">${fmtSW(ms)}</span><span class="l">Lap ${this._laps.length - i}</span></div>`).join("");
  }

  // ---------- timer ----------

  _timerToggle(readDur) {
    if (this._timerRunning) {
      this._timerDur = Math.max(0, this._timerEnd - Date.now());
      this._timerRunning = false;
    } else {
      if (typeof readDur === "function") this._timerDur = readDur();
      if (this._timerDur <= 0) return;
      this._timerEnd = Date.now() + this._timerDur;
      this._timerRunning = true;
      this._timerFired = false;
    }
    this._renderControls();
  }
  _timerReset() { this._timerRunning = false; this._timerFired = false; this._el.classList.remove("ac-timer-done"); this._renderControls(); this._tick(); }

  // ---------- tick ----------

  _tick() {
    if (!this._el) return;
    const now = new Date();
    const set = (id, deg) => { const e = this._svg.querySelector(id); if (e) e.setAttribute("transform", `rotate(${deg} 100 100)`); };
    const secEl = this._svg.querySelector("#ac-h-sec");
    const hourEl = this._svg.querySelector("#ac-h-hour");
    const minEl = this._svg.querySelector("#ac-h-min");
    const alarmHand = this._svg.querySelector("#ac-h-alarm");
    if (alarmHand) alarmHand.setAttribute("opacity", "0");

    if (this._tab === "alarm") {
      // STANDSTILL clock: the hands show the alarm time you're setting; the hand
      // for the active phase glows cyan.
      set("#ac-h-hour", (this._alarmH % 12) * 30 + (this._alarmM / 60) * 30);
      set("#ac-h-min", this._alarmM * 6);
      if (secEl) secEl.setAttribute("opacity", "0");
      if (hourEl) { hourEl.setAttribute("stroke", this._settingPhase === "hour" ? "#22d3ee" : "#e6ebff"); hourEl.setAttribute("stroke-width", this._settingPhase === "hour" ? "6" : "5"); }
      if (minEl) { minEl.setAttribute("stroke", this._settingPhase === "minute" ? "#22d3ee" : "#a5b4fc"); minEl.setAttribute("stroke-width", this._settingPhase === "minute" ? "4.6" : "3.4"); }
    } else {
      const sec = now.getSeconds() + now.getMilliseconds() / 1000;
      const min = now.getMinutes() + sec / 60;
      const hr = (now.getHours() % 12) + min / 60;
      set("#ac-h-hour", hr * 30);
      set("#ac-h-min", min * 6);
      set("#ac-h-sec", sec * 6);
      if (secEl) secEl.setAttribute("opacity", "1");
      if (hourEl) { hourEl.setAttribute("stroke", "#e6ebff"); hourEl.setAttribute("stroke-width", "5"); }
      if (minEl) { minEl.setAttribute("stroke", "#a5b4fc"); minEl.setAttribute("stroke-width", "3.4"); }
    }

    if (this._el.style.display === "none") return;
    if (this._tab === "stopwatch") this._digital.textContent = fmtSW(this._swElapsed());
    else if (this._tab === "timer") {
      const left = this._timerRunning ? Math.max(0, this._timerEnd - Date.now()) : this._timerDur;
      this._digital.textContent = fmtTimer(left);
    } else if (this._tab === "alarm") {
      this._digital.textContent = `${pad(this._alarmH)}:${pad(this._alarmM)}`; // the alarm being set
    } else this._digital.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  _heartbeat() {
    // fires even when hidden so the timer still goes off
    if (this._timerRunning && Date.now() >= this._timerEnd && !this._timerFired) {
      this._timerFired = true;
      this._timerRunning = false;
      try { playAlertSound(3); } catch { /* ignore */ }
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("⏰ Timer done", { body: "Your timer finished." });
        }
      } catch { /* ignore */ }
      if (this._el) { this._el.classList.add("ac-timer-done"); if (this._el.style.display !== "none") this._renderControls(); }
    }
    this._tick();
  }

  // ---------- lifecycle ----------

  show() {
    this._build();
    this._el.style.display = "flex";
    this._setTab("clock");
    if (!this._interval) this._interval = setInterval(() => this._heartbeat(), 200);
    // alarms fire via the alert scheduler; prompt for notification permission.
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission?.(); } catch { /* ignore */ }
  }

  hide() {
    if (this._el) this._el.style.display = "none";
  }

  isOpen() { return !!this._el && this._el.style.display !== "none"; }
}

function fmtSW(ms) {
  const t = Math.floor(ms / 10);
  const cs = t % 100, s = Math.floor(t / 100) % 60, m = Math.floor(t / 6000);
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}
function fmtTimer(ms) {
  const t = Math.ceil(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
