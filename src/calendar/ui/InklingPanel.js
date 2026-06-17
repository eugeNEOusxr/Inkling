import { processUserInput } from "../ai/AIBrain.js";
import { parseInklingMessage } from "../ai/inklingParser.js";
import { fetchInklingChat } from "../ai/fetchInklingChat.js";
import { openTextStylePicker } from "./TextStylePicker.js";
import { getInklingWelcomeMessage } from "../ai/inklingWelcome.js";
import { buildNotebookReaderItems } from "../notebookReaderFeed.js";
import { applyScheduleIntentAndRefresh } from "../ai/scheduleIntent.js";
import { getDisplayName } from "./userProfile.js";
import { submitFeedback } from "../../auth/userAccount.js";
import { registerInklingApp, installWriterNavigation } from "./Writer.js";
import { openPanel } from "./AppLauncher.js";
import { InklingAlerts, colorizeAlertWords } from "./InklingAlertsPanel.js";
import { analyzePatterns, patternInsights, dataNudge, reportSuggestions, CONNECTIONS_PROMPT, checkInQuestions, followUpSuggestions, recentRemarks } from "../ai/patternBrain.js";
import { GoalsPanel } from "./GoalsPanel.js";
import { Connections2D } from "./Connections2D.js";
import { InklingMindPanel } from "./InklingMindPanel.js";
import { StudyMapPanel } from "./StudyMapPanel.js";
import { FlashcardsPanel } from "./FlashcardsPanel.js";
import { createEvent } from "../../wordweaver/timelineModel.js";
import { VoiceDictation, isVoiceInputSupported } from "./voiceInput.js";
import { appendTurn, ingestText, mindInsights, mindGraph, connectConcepts, extractConcepts, ingestCalendar, enrichFromServer } from "../../inkling/mind/index.js";

const CHECKIN_HTML =
  "✦ Hey — been a little while. <b>What are you up to right now?</b><br>" +
  "<span style='opacity:.7;font-size:12px'>Tell me in a line and I can jot it down as today's note. (Say “stop check-ins” to turn these off.)</span>";
import { createAlert, addAlert, AlertPriority } from "../alerts/alertsModel.js";
import { recomputeSchedule } from "../alerts/alertsScheduler.js";
const INKLING_CRON_KEY = "calendar3d-inkling-cron-v1";

/**
 * Inkling — floating calendar assistant (hybrid NL, not rigid commands).
 */
export class InklingPanel {
  /**
   * @param {import("../CalendarApp.js").CalendarApp} calendarApp
   */
  constructor(calendarApp) {
    this.app = calendarApp;
    this.el = document.getElementById("inkling-panel");
    this.messagesEl = document.getElementById("inkling-messages");
    this.inputEl = document.getElementById("inkling-input");
    this.formEl = document.getElementById("inkling-form");
    this.confirmEl = document.getElementById("inkling-confirm");
    this._pending = null;
    this._minimized = false;
    this._attachedImage = null;
    this._sideThreadActive = false;
    this._messageSeq = 0;
    this._welcomed = false;
    this._lastDigestKey = null;

    document.getElementById("inkling-minimize")?.classList.add("minimize-btn");
    document.getElementById("inkling-minimize")?.addEventListener("click", () => this.minimize());
    document.getElementById("inkling-close")?.addEventListener("click", () => this.minimize());

    registerInklingApp(calendarApp);
    installWriterNavigation();
    this._injectPanelMinimizeButtons();
    this._bindPanelShellEvents();

    this.formEl?.addEventListener("submit", (e) => {
      e.preventDefault();
      this._send();
    });

    document.getElementById("inkling-attach")?.addEventListener("click", () => {
      document.getElementById("inkling-file")?.click();
    });

    // Voice-to-text: a mic in the composer dictates speech into the input.
    this._voice = new VoiceDictation({ onStateChange: (state) => this._setMicState(state) });
    this._micBtn = document.getElementById("inkling-mic");
    if (this._micBtn && isVoiceInputSupported()) {
      this._micBtn.classList.remove("hidden");
      this._micBtn.addEventListener("click", () => {
        if (this.inputEl) this._voice.toggle(this.inputEl);
      });
    }

    document.getElementById("inkling-file")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        this._attachedImage = { name: file.name, dataUrl: reader.result };
        this._appendBubble("system", `📷 Attached: ${file.name}`);
      };
      reader.readAsDataURL(file);
    });

    document.getElementById("inkling-confirm-yes")?.addEventListener("click", () => this._confirmSchedule(true));
    document.getElementById("inkling-confirm-no")?.addEventListener("click", () => this._confirmSchedule(false));

    this._initOrb();
    // Inkling's dedicated alerts surface: a count badge on the orb + a colour-
    // coded panel, kept out of the chat so conversation isn't buried.
    this.alerts = new InklingAlerts(this._orb ?? document.getElementById("inkling-fab"));

    // Seed the welcome message first so it can never be buried by a proactive
    // digest or alert bubble that fires before the user opens the panel.
    this.showWelcomeIfNeeded();
    // Warm the Mind store now (rebuild graph from prior history) so a turn typed
    // this session ingests cleanly and reports an accurate "what's new" delta —
    // otherwise the first message's rebuild would absorb it and the chip vanishes.
    void mindInsights().catch(() => {});
    // Study Map sections jump into a generated deck via this event.
    document.addEventListener("inkling:open-flashcards", (e) => {
      this.minimize();
      this.showFlashcards(e.detail?.setId);
    });
    this._startCron();

    // Gentle in-app check-in: if the user's been away a while, Inkling asks what
    // they're up to when they come back (no push, no permissions). Delayed so the
    // app settles first.
    this._awaitingCheckInReply = false;
    setTimeout(() => this._initCheckIn(), 1800);
  }

  _bindPanelShellEvents() {
    window.addEventListener("inkling:close-all-panels", () => this._closeSiblingPanels());
    window.addEventListener("inkling:open-panel", (event) => {
      const panelId = event.detail?.panelId;
      if (panelId === "inkling") {
        void this._openInklingHome();
      }
    });

    // NOTE: do NOT intercept #inkling-bottom-nav clicks here. A capture-phase
    // listener used to call _closeSiblingPanels() (→ setActiveTab(null)) before
    // InklingBottomNav computed `toggle = activeTab === tab`, which permanently
    // defeated re-tap-to-minimize. CalendarApp._handleBottomNavTab now owns all
    // sibling-closing, so this interception is both redundant and harmful.
  }

  async _openInklingHome() {
    this.app?.wordWeaverEmbed?.exitImmersive?.();
    this.app?.wordWeaverEmbed?.hide?.();
    this.app?.layerManager?.close("wordweaver");
    this.app?.closePanels?.();
    this.app?.exitCalendarMaxLayer?.();
    this.app?.notebookWriterPanel?.close?.();
    this.app?.threadPanel?.close?.();
    this.app?.layerManager?.open("inkling");
    this.app?.bottomNav?.setActiveTab("inkling");
    this.app?._showStageBackdrop?.(true);
    document.body.classList.add("inkling-stage-open", "inkling-tab-inkling");
    document.getElementById("inkling-fab")?.classList.add("hidden");
    this.expand();
  }

  _closeSiblingPanels() {
    this.app?.closePanels?.();
    this.app?.exitCalendarMaxLayer?.();
    this.app?.layerManager?.closeAll?.();
    this.app?.notebookWriterPanel?.close?.();
    this.app?.threadPanel?.close?.();
    this.app?.wordWeaverEmbed?.exitImmersive?.();
    this.app?.wordWeaverEmbed?.hide?.();
    this.app?.bottomNav?.setActiveTab(null);
    this.app?._showStageBackdrop?.(false);
    document.body.classList.remove(
      "inkling-stage-open",
      "inkling-tab-calendar",
      "inkling-tab-writer",
      "inkling-tab-wordweaver",
      "inkling-tab-inkling",
      "notebook-writer-panel-open",
      "appointment-writer-panel-open"
    );
  }

  /**
   * Shared minimize control for stage panels (writer, notes, WordWeaver).
   */
  _injectPanelMinimizeButtons() {
    this._attachMinimizeButton(
      document.querySelector("#thread-panel .thread-header-row"),
      () => {
        this.app?.threadPanel?.close?.();
        this.app?.layerManager?.close("day-notes");
        this._returnToHomeSurface();
      }
    );

    const wwBar = document.querySelector(".wordweaver-embed__bar");
    if (wwBar && !wwBar.querySelector(".minimize-btn")) {
      this._attachMinimizeButton(wwBar, () => {
        // Single-panel model: minimizing WordWeaver closes the surface to the
        // idle cosmos backdrop (same path as re-tapping the bottom WordWeaver
        // icon). Must exit immersive — setSize() alone left it full-screen.
        void this.app?._handleBottomNavTab?.("wordweaver", { toggle: true });
      });
    }

    const writerHeader = document.querySelector(
      "#notebook-writer-panel .thread-header-row"
    );
    if (writerHeader) {
      const existing = writerHeader.querySelector(".notebook-writer-minimize-btn");
      existing?.classList.add("minimize-btn");
    }
  }

  /**
   * @param {HTMLElement | null} host
   * @param {() => void} onMinimize
   */
  _attachMinimizeButton(host, onMinimize) {
    if (!host || host.querySelector(".minimize-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "minimize-btn";
    btn.title = "Minimize";
    btn.setAttribute("aria-label", "Minimize panel");
    btn.textContent = "–";
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      onMinimize();
    });
    host.appendChild(btn);
  }

  _returnToHomeSurface() {
    this.app?.bottomNav?.setActiveTab(null);
    this.app?._showStageBackdrop?.(false);
    void this.app?._frameOverviewCamera?.(false);
    openPanel("inkling");
  }

  toggle() {
    if (this._minimized) this.expand();
    else this.minimize();
  }

  expand() {
    this._minimized = false;
    this.el?.classList.remove("hidden", "inkling-panel--minimized");
    // Sit above the Schedule day overlay (z 11000) AND the Mind panel (z 11086)
    // so the chat floats over the mind map when you open it to ask about it.
    this.el?.style.setProperty("z-index", "11090", "important");
    document.getElementById("inkling-fab")?.classList.add("hidden");
    document.body.classList.add("inkling-open", "inkling-stage-open", "inkling-tab-inkling");
    this.app?._showStageBackdrop?.(true);
    this.showWelcomeIfNeeded();
    this.inputEl?.focus();
  }

  minimize() {
    if (this._minimized) return;
    this._minimized = true;
    this.el?.classList.add("inkling-panel--minimized");
    this.el?.classList.remove("hidden");
    document.getElementById("inkling-fab")?.classList.remove("hidden");
    document.body.classList.remove("inkling-open", "inkling-stage-open", "inkling-tab-inkling");
    this.app?._showStageBackdrop?.(false);
    this.app?.bottomNav?.setActiveTab(null);
  }

  isOpen() {
    return this.el && !this.el.classList.contains("hidden");
  }

  // --- Inkling orb (draggable metallic sphere + options menu) ---

  _initOrb() {
    const orb = document.getElementById("inkling-fab");
    if (!orb) return;
    this._orb = orb;
    try {
      const pos = JSON.parse(localStorage.getItem("inkling-orb-pos") || "null");
      if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) this._placeOrb(pos.left, pos.top);
    } catch { /* ignore */ }

    let startX = 0, startY = 0, originLeft = 0, originTop = 0, moved = false;
    const onMove = (e) => {
      const dx = e.clientX - startX, dy = e.clientY - startY;
      // Higher threshold so a jittery finger TAP on mobile still opens the menu
      // (a real drag moves much further than this).
      if (!moved && Math.hypot(dx, dy) > 12) { moved = true; orb.classList.add("inkling-orb--dragging"); }
      if (moved) {
        const left = Math.max(6, Math.min(window.innerWidth - orb.offsetWidth - 6, originLeft + dx));
        const top = Math.max(6, Math.min(window.innerHeight - orb.offsetHeight - 6, originTop + dy));
        this._placeOrb(left, top);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      orb.classList.remove("inkling-orb--dragging");
      if (moved) {
        const r = orb.getBoundingClientRect();
        try { localStorage.setItem("inkling-orb-pos", JSON.stringify({ left: r.left, top: r.top })); } catch { /* ignore */ }
      } else {
        this._toggleOrbMenu();
      }
    };
    orb.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      const r = orb.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY; originLeft = r.left; originTop = r.top; moved = false;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp); // some mobile browsers fire this
    });
  }

  _placeOrb(left, top) {
    const orb = this._orb;
    if (!orb) return;
    orb.style.left = `${left}px`;
    orb.style.top = `${top}px`;
    orb.style.right = "auto";
    orb.style.bottom = "auto";
    if (this._orbMenu?.classList.contains("open")) this._positionOrbMenu();
  }

  _buildOrbMenu() {
    if (this._orbMenu) return;
    const menu = document.createElement("div");
    menu.id = "inkling-orb-menu";
    const mk = (icon, label, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "inkling-orb-action";
      b.textContent = icon;
      b.title = label;
      b.dataset.label = label;
      b.setAttribute("aria-label", label);
      b.addEventListener("click", () => { menu.classList.remove("open"); fn(); });
      return b;
    };
    // Orb = Inkling's own quick actions. Connections-map, Goals, Alerts and
    // Alarm now live in the bottom nav, so they're dropped here to keep the
    // orb cluster legible (was 9 cramped icons).
    this._orbItems = [
      mk("💬", "Chat with Inkling", () => this.openWithContext()),
      mk("🎤", "Voice message", () => this.openWithVoice()),
      mk("🧠", "Mind", () => { this.minimize(); this.showMind(); }),
      mk("📚", "Study", () => { this.minimize(); this.showStudy(); }),
      mk("📇", "Flashcards", () => { this.minimize(); this.showFlashcards(); }),
      mk("🔔", "Alarm", () => this.app?.openAlarmClock?.()),
      mk("🔗", "Connections", () => this.showConnections()),
      mk("＋", "New event", () => this._orbNewEvent()),
      mk("🎨", "Text style", () => openTextStylePicker()),
      mk("📅", "Go to today", () => this._orbToday())
    ];
    if (!isVoiceInputSupported()) {
      // Drop the voice action where the browser can't do speech-to-text.
      this._orbItems = this._orbItems.filter((b) => b.dataset.label !== "Voice message");
    }
    for (const b of this._orbItems) menu.appendChild(b);
    document.body.appendChild(menu);
    this._orbMenu = menu;
    document.addEventListener("pointerdown", (e) => {
      if (menu.classList.contains("open") && !menu.contains(e.target) && e.target !== this._orb) {
        menu.classList.remove("open");
      }
    });
  }

  _toggleOrbMenu() {
    this._buildOrbMenu();
    const open = this._orbMenu.classList.toggle("open");
    if (open) this._positionOrbMenu();
  }

  _positionOrbMenu() {
    const orb = this._orb;
    const items = this._orbItems;
    if (!orb || !items?.length) return;
    const r = orb.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const radius = r.width / 2 + 36; // hug just outside the orb's circumference
    const n = items.length;
    items.forEach((b, i) => {
      const t = n === 1 ? 0.5 : i / (n - 1);
      // Arc the bubbles around the LEFT edge: screen angle 270° (top) → 180°
      // (left) → 90° (bottom), so they read top → left → bottom.
      const deg = 270 - t * 180;
      const rad = (deg * Math.PI) / 180;
      const x = cx + radius * Math.cos(rad);
      const y = cy + radius * Math.sin(rad);
      b.style.left = `${x}px`;
      b.style.top = `${y}px`;
      b.style.transitionDelay = `${i * 0.035}s`;
    });
  }

  async _orbNewEvent() {
    await this.app?._handleBottomNavTab?.("writer", { toggle: false });
    this.app?._cal2dDay?._openEditor?.(null, 9 * 60);
  }

  async _orbToday() {
    await this.app?._handleBottomNavTab?.("writer", { toggle: false });
    const cal = this.app?._cal2dDay;
    if (cal) { cal.iso = new Date().toISOString().slice(0, 10); cal.setView?.("day"); }
  }

  /** Detect "take me to <date>" navigation and return {iso,label} or null. */
  _parseNavDate(text) {
    const s = String(text).toLowerCase();
    if (!/\b(take me to|go to|show me|jump to|navigate to|bring me to)\b/.test(s)) return null;
    const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    let mo = -1;
    for (let i = 0; i < 12; i++) {
      if (s.includes(MON[i].toLowerCase()) || new RegExp(`\\b${MON[i].slice(0, 3).toLowerCase()}\\b`).test(s)) { mo = i; break; }
    }
    let day = -1;
    const dm = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (dm) day = +dm[1];
    const md = s.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (md) { mo = +md[1] - 1; day = +md[2]; }
    if (mo < 0 || day < 1 || day > 31) return null;
    const y = new Date().getFullYear();
    const iso = `${y}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { iso, label: `${MON[mo]} ${day}` };
  }

  /** Avatar tap → open Inkling aware of the page you're on, with title help. */
  openWithContext() {
    this.expand();
    try { this._postContextPrompt(); } catch { /* ignore */ }
  }

  /** Orb "🎤 Voice message" → open the chat and start dictating into the input. */
  openWithVoice() {
    this.expand();
    // Let the panel mount/animate, then begin listening. The orb tap is the user
    // gesture; mic permission (once granted) carries through.
    setTimeout(() => {
      if (this.inputEl && this._voice?.supported) this._voice.start(this.inputEl);
      this.inputEl?.focus();
    }, 320);
  }

  /** Reflect dictation state on the mic buttons (composer + visual pulse). */
  _setMicState(state) {
    const recording = state === "recording";
    this._micBtn?.classList.toggle("is-recording", recording);
    this._micBtn?.setAttribute("aria-pressed", String(recording));
    if (state === "error" && this.messagesEl) {
      this._appendBubble("system", "🎤 Microphone access is blocked. Allow it in your browser/app settings to use voice.");
    }
  }

  /** Open the Goals surface (capture + review goals). */
  showGoals(opts = {}) {
    if (!this._goals) this._goals = new GoalsPanel();
    this._goals.show(opts);
  }

  /** Open the Mind surface — the live knowledge graph WordWeaver has built. */
  showMind(opts = {}) {
    if (!this._mindPanel) this._mindPanel = new InklingMindPanel();
    this._mindPanel.show(opts);
  }

  /** Open the Study Maps surface — Haiku-built study paths with mastery tracking. */
  showStudy() {
    if (!this._studyPanel) this._studyPanel = new StudyMapPanel();
    this._studyPanel.show();
  }

  /** Open the Flashcards surface (optionally jump straight to a deck). */
  showFlashcards(setId) {
    if (!this._flashcards) this._flashcards = new FlashcardsPanel();
    this._flashcards.show(setId);
  }

  /**
   * Mind-graph conversation: "connect X and Y" creates a link; questions about
   * what I notice / patterns / my mind map get answered from the live graph.
   * @returns {Promise<boolean>} handled
   */
  async _tryMindIntent(text) {
    const trimmed = text.trim();
    const link = trimmed.match(/^(?:connect|link|relate)\s+(.+?)\s+(?:and|to|with|&)\s+(.+?)[.?!]*$/i);
    if (link) {
      const a = link[1].trim().replace(/^(the|my)\s+/i, "");
      const b = link[2].trim().replace(/^(the|my)\s+/i, "");
      try { await connectConcepts(a, b); } catch { /* ignore */ }
      this._appendBubble("inkling",
        escapeHtml(`Done — I linked “${a}” and “${b}” in your Mind. Open 🧠 Mind to see the connection.`),
        "inkling-msg--proactive");
      return true;
    }
    // Calendar ↔ memory: explain the link and actually weave the calendar in.
    if (/\b(calendar|schedule|alerts?|alarms?)\b/i.test(text) &&
        /\b(connect|link|tie|relate|related|combine|together|hook (it )?up)\b/i.test(text) &&
        /\b(mind|memory|graph|notes?|each other|them|these)\b/i.test(text)) {
      await this._postCalendarLink();
      return true;
    }

    const asksAboutMind =
      /\b(mind ?map)\b/i.test(text) ||
      /\bwhat (do |have )?you('ve)? ?(notice|noticed|see|seen|learn|learned|know|found)\b.*\bme\b/i.test(text) ||
      /\bwhat (patterns?|connections?|themes?)\b/i.test(text) ||
      /\b(my )?(patterns?|connections?|themes?)\b.*\b(see|notice|find|spot)\b/i.test(text) ||
      /^(my )?(mind|connections?|patterns?)\??$/i.test(trimmed);
    if (asksAboutMind) {
      await this._postMindReflection();
      return true;
    }
    return false;
  }

  /** Explain that I build the graph as we talk, then show the current read. */
  async _postMindReflection() {
    this._appendBubble("inkling",
      escapeHtml("As we talk I'm quietly building your Mind — I turn the concepts you mention into nodes and draw connections between the ones that come up together. Here's what I'm seeing so far:"),
      "inkling-msg--proactive");
    try {
      const ins = await mindInsights();
      const body = ins.lines?.length
        ? ins.lines.map((l) => escapeHtml(l)).join("<br>")
        : "Not much yet — keep talking and the map will fill in.";
      this._appendBubble("inkling", body, "inkling-msg--proactive");
    } catch { /* ignore */ }
    this._appendBubble("inkling",
      escapeHtml('Tap 🧠 Mind in the bottom bar for the full map. Want me to link two ideas? Just say “connect X and Y”.'),
      "inkling-msg--proactive");
  }

  /** Calendar ↔ memory: explain the link, then weave recent calendar into the graph. */
  async _postCalendarLink() {
    this._appendBubble("inkling",
      escapeHtml("Your calendar and your Mind are the same memory seen two ways: when you add notes, events or alerts, I weave their topics into the graph — and you can link them to anything else. Let me pull your recent calendar in now…"),
      "inkling-msg--proactive");
    try {
      const r = await ingestCalendar();
      const msg = r.added?.length
        ? `Done — pulled ${r.count} item${r.count === 1 ? "" : "s"} from your calendar and added ${this._humanList(r.added.slice(0, 5))}${r.added.length > 5 ? ` +${r.added.length - 5} more` : ""} to your Mind.`
        : `I checked ${r.count} calendar item${r.count === 1 ? "" : "s"}. As you log notes with real topics, the overlaps with our chats will show up in your Mind.`;
      this._appendBubble("inkling", escapeHtml(msg), "inkling-msg--proactive");
    } catch { /* ignore */ }
    this._appendBubble("inkling",
      escapeHtml('Open 🧠 Mind to see it — or say “connect X and Y” to draw a link yourself.'),
      "inkling-msg--proactive");
  }

  /** Open the 2D connections node map. */
  showConnectionsMap(opts = {}) {
    if (!this._connMap) this._connMap = new Connections2D();
    this._connMap.show(opts);
  }

  /** Open Inkling and show the patterns it has spotted + reports it could make. */
  showConnections() {
    this.expand();
    try { this._postConnections(); } catch { /* ignore */ }
  }

  _postConnections() {
    if (!this.messagesEl) return;
    const p = analyzePatterns();
    // 1) the orb's invitation
    this._appendBubble("inkling", escapeHtml(CONNECTIONS_PROMPT), "inkling-msg--proactive");
    // 2) the patterns it sees
    this._appendBubble("inkling", patternInsights(p).join("<br>"), "inkling-msg--proactive");
    // 3) the honest "log more" nudge (scaled to data)
    const nudge = dataNudge(p);
    if (nudge) {
      this._appendBubble("inkling", `<span style="opacity:.85">${nudge}</span>`, "inkling-msg--proactive");
    }
    // 4) PEOPLE — casual check-ins about recent hangouts + follow-up nudges.
    const checkins = checkInQuestions();
    if (checkins.length) {
      this._appendBubble("inkling", checkins.map((q) => `💬 ${escapeHtml(q)}`).join("<br>"), "inkling-msg--proactive");
    }
    const follows = followUpSuggestions();
    if (follows.length) {
      this._appendBubble("inkling", "Want me to remind you to circle back with anyone?", "inkling-msg--proactive");
      const pwrap = document.createElement("div");
      pwrap.className = "inkling-title-ideas";
      pwrap.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 10px";
      for (const f of follows) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = `➕ ${f.label}`;
        b.style.cssText =
          "background:#ecfeff;color:#0e7490;border:1px solid #a5f3fc;border-radius:999px;padding:6px 12px;font:600 12px system-ui;cursor:pointer";
        b.addEventListener("click", () => {
          try {
            addAlert(createAlert({ time: "10:00", text: f.label, category: "personal", date: f.dueIso, priority: AlertPriority.LOW }));
            recomputeSchedule();
            this.alerts?._refresh?.();
            b.textContent = `✓ ${f.name} · ${f.dueIso}`;
            b.disabled = true;
            b.style.opacity = "0.7";
          } catch { /* ignore */ }
        });
        pwrap.appendChild(b);
      }
      this.messagesEl.appendChild(pwrap);
    }

    // 5) Saved remarks (the "no show" notes) — surfaced back so they're visible.
    const remarks = recentRemarks();
    if (remarks.length) {
      const icon = (s) => (s === "done" ? "✓" : s === "missed" ? "✗" : "•");
      this._appendBubble("inkling",
        "📝 <b>Your remarks</b><br>" + remarks.map((r) => `${icon(r.status)} ${escapeHtml(r.text)} — <i>${escapeHtml(r.remark)}</i>`).join("<br>"),
        "inkling-msg--proactive");
    }

    // 6) reports it could build — tappable; each explains what to log
    const wrap = document.createElement("div");
    wrap.className = "inkling-title-ideas";
    wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 10px";
    for (const r of reportSuggestions()) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = r.label;
      b.style.cssText =
        "background:#eef2ff;color:#4338ca;border:0;border-radius:999px;padding:6px 12px;font:600 12px system-ui;cursor:pointer";
      b.addEventListener("click", () => {
        this._appendBubble("inkling",
          `<b>${escapeHtml(r.label)}</b><br>To unlock this, ${escapeHtml(r.need)}. Keep it up and I'll build the report from your own logs.`,
          "inkling-msg--proactive");
      });
      wrap.appendChild(b);
    }
    this.messagesEl.appendChild(wrap);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  _scheduleIsOpen() {
    const cal = this.app?._cal2dDay;
    return !!(cal?.root && cal.root.style.display !== "none");
  }

  _postContextPrompt() {
    const tabKey = document.body.dataset.inklingBottomTab || "";
    const onSchedule = tabKey === "writer" || this._scheduleIsOpen();
    const pageName = onSchedule
      ? "Schedule"
      : tabKey === "wordweaver"
        ? "the 3D Calendar"
        : tabKey === "constellation"
          ? "WordWeaver"
          : "Inkling";

    if (onSchedule) {
      const date = this.app?._cal2dDay?.iso;
      this._appendBubble(
        "inkling",
        escapeHtml(`You're on Schedule${date ? ` · ${date}` : ""}. Want a hand titling something? Tap an idea and I'll start it for you:`),
        "inkling-msg--proactive"
      );
      this._appendTitleIdeas();
    } else {
      this._appendBubble(
        "inkling",
        escapeHtml(`You're on ${pageName}. I can add an event, set a reminder, jump you to a day, or just talk — what's up?`),
        "inkling-msg--proactive"
      );
    }
  }

  _appendTitleIdeas() {
    if (!this.messagesEl) return;
    const ideas = ["Team meeting", "Lunch", "Workout", "Doctor appointment", "Call", "Reminder"];
    const wrap = document.createElement("div");
    wrap.className = "inkling-title-ideas";
    wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 10px";
    for (const t of ideas) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = t;
      b.style.cssText =
        "background:#eef2ff;color:#4338ca;border:0;border-radius:999px;padding:6px 12px;font:600 12px system-ui;cursor:pointer";
      b.addEventListener("click", () => this._startTitledEvent(t));
      wrap.appendChild(b);
    }
    this.messagesEl.appendChild(wrap);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  async _startTitledEvent(title) {
    this.minimize();
    if (!this._scheduleIsOpen()) {
      await this.app?._handleBottomNavTab?.("writer", { toggle: false });
    }
    const cal = this.app?._cal2dDay;
    cal?._openEditor?.({ title }, 9 * 60);
  }

  showWelcomeIfNeeded() {
    if (this._welcomed) return;
    this._welcomed = true;
    const KEY = "inkling-welcome-v1";
    let meta = {};
    try { meta = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { /* ignore */ }
    const today = new Date().toISOString().slice(0, 10);
    const email = document.getElementById("auth-account-label")?.textContent?.trim() || "";
    const who = getDisplayName(email);

    if (!meta.firstSeen) {
      // First visit ever — full orientation, and point them to the orb for next time.
      // Marked proactive so this boilerplate greeting isn't captured into the graph.
      const html = escapeHtml(getInklingWelcomeMessage(who)).replace(/\n/g, "<br>") +
        `<br><br>✦ Tap the <b>Inkling</b> orb (the ✦ icon) anytime to find me again.`;
      this._appendBubble("inkling", html, "inkling-msg--proactive");
    } else if (meta.lastDay !== today) {
      // Returning on a new day — a short, warm hello (no wall of text).
      this._appendBubble("inkling", escapeHtml(`Welcome back${who ? `, ${who}` : ""}. What's on your mind?`), "inkling-msg--proactive");
    }
    // Same-day reopen → stay quiet; the cosmic backdrop is the welcome, not a
    // repeated chat message (no nagging for frequent openers).
    try {
      localStorage.setItem(KEY, JSON.stringify({ firstSeen: meta.firstSeen || today, lastDay: today }));
    } catch { /* ignore */ }
  }

  _appendBubble(role, html, extraClass = "") {
    if (!this.messagesEl) return;
    const div = document.createElement("div");
    div.className = `inkling-msg inkling-msg--${role} ${extraClass}`.trim();
    div.innerHTML = html;
    if (role === "inkling" && !extraClass.includes("inkling-msg--proactive")) {
      const messageId = `msg-${++this._messageSeq}`;
      div.dataset.messageId = messageId;
      const feedback = document.createElement("div");
      feedback.className = "inkling-msg__feedback";
      feedback.innerHTML = `
        <button type="button" class="inkling-feedback-btn" data-rating="thumbs_up" title="Helpful">👍</button>
        <button type="button" class="inkling-feedback-btn" data-rating="thumbs_down" title="Not helpful">👎</button>
        <select class="inkling-feedback-category" aria-label="Category">
          <option value="">Category…</option>
          <option value="helpful">Helpful</option>
          <option value="incorrect">Incorrect</option>
          <option value="incomplete">Incomplete</option>
          <option value="confusing">Confusing</option>
          <option value="other">Other</option>
        </select>`;
      feedback.querySelectorAll(".inkling-feedback-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          void this._sendFeedback(messageId, btn.getAttribute("data-rating"), feedback);
        });
      });
      div.appendChild(feedback);
    }
    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;

    // Layer 0 capture + graph ingest: persist real dialogue turns (user + Inkling
    // replies, not system chrome or proactive nudges) to the local-first Mind
    // store, then grow the on-device knowledge graph from the turn.
    if ((role === "user" || role === "inkling") && !extraClass.includes("inkling-msg--proactive")) {
      const content = div.textContent || "";
      appendTurn({ speaker: role, content, source: "text" })
        .then((rec) => (rec ? ingestText({ sessionId: rec.sessionId, speaker: role, content, ts: rec.ts }) : null))
        .then((delta) => {
          if (delta) this._showMindChip(delta, role, content);
          // Stage 2b: ask the server's Haiku extractor to catch concepts the local
          // lexicon missed (your own messages only, to keep it cheap). No-op without a key.
          if (role === "user" && content.trim().length > 10) {
            enrichFromServer(content)
              .then((ex) => { if (ex && (ex.addedNodes.length || ex.addedEdges.length)) this._appendAiMindChip(ex); })
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
    return div;
  }

  /**
   * Real conversational turn via the server LLM (falls back to local on failure).
   * @param {string} text
   */
  async _respondViaLlm(text) {
    const typing = this._appendBubble(
      "inkling",
      "<em style=\"opacity:.55\">Inkling is thinking…</em>",
      "inkling-msg--proactive"
    );
    try {
      const mindSummary = await this._buildMindSummary();
      const res = await fetchInklingChat({
        message: text,
        history: this._chatHistory(),
        referenceDate:
          this.app?._getTodayDate?.() ?? new Date().toISOString().slice(0, 10),
        userName: getDisplayName(),
        awaitingConfirm: Boolean(this._pending),
        mindSummary
      });
      typing?.remove();
      const reply = res?.reply || "I’m here — what would you like to do?";
      this._appendBubble("inkling", this._formatReply(reply));
      // Record any connections Inkling proposed into the Mind.
      if (Array.isArray(res?.links) && res.links.length) this._applyChatLinks(res.links);
    } catch (err) {
      typing?.remove();
      console.warn("[Inkling] LLM turn failed", err);
      this._appendBubble(
        "inkling",
        escapeHtml("I couldn’t reach the server just now — try again in a moment.")
      );
    }
  }

  /** Compact snapshot of the Mind (top concepts + recent links) for the chat prompt. */
  async _buildMindSummary() {
    try {
      const g = await mindGraph();
      if (!g.nodes.length) return "";
      const byId = new Map(g.nodes.map((n) => [n.id, n.label]));
      const top = [...g.nodes].sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 18).map((n) => n.label);
      const links = g.edges
        .filter((e) => e.rel !== "CONTRADICTS")
        .slice(-12)
        .map((e) => { const a = byId.get(e.from), b = byId.get(e.to); return a && b ? `${a}—${b}` : null; })
        .filter(Boolean);
      return `Concepts: ${top.join(", ")}.` + (links.length ? ` Existing links: ${links.join("; ")}.` : "");
    } catch { return ""; }
  }

  /** Record connections Inkling proposed in chat into the Mind + show a chip. */
  async _applyChatLinks(links) {
    const made = [];
    for (const pair of links.slice(0, 8)) {
      const a = String(pair?.[0] || "").trim(), b = String(pair?.[1] || "").trim();
      if (!a || !b) continue;
      try { await connectConcepts(a, b); made.push([a, b]); } catch { /* ignore */ }
    }
    if (!made.length || !this.messagesEl) return;
    const chip = document.createElement("div");
    chip.className = "inkling-mind-chip";
    chip.style.cssText =
      "display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:-2px 0 12px;padding:6px 10px;" +
      "border-radius:14px;background:rgba(160,107,255,0.10);border:1px solid rgba(160,107,255,0.32);" +
      "font:600 11px system-ui;color:#c9b6ff;max-width:100%";
    const span = document.createElement("span");
    span.textContent = `✦ Connected in your Mind: ${made.map(([a, b]) => `${a} ↔ ${b}`).join(", ")}`;
    chip.appendChild(span);
    const view = document.createElement("button");
    view.type = "button"; view.textContent = "🧠 View";
    view.style.cssText = "background:rgba(160,107,255,0.24);color:#e9deff;border:0;border-radius:999px;padding:3px 11px;font:700 11px system-ui;cursor:pointer";
    const labels = [...new Set(made.flat())];
    view.addEventListener("click", () => { this.minimize(); this.showMind({ focus: labels }); });
    chip.appendChild(view);
    this.messagesEl.appendChild(chip);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /** Light markdown → HTML for LLM replies (bold + line breaks), safely escaped. */
  _formatReply(text) {
    return escapeHtml(String(text))
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  async _sendFeedback(messageId, rating, containerEl) {
    const category = containerEl?.querySelector(".inkling-feedback-category")?.value || null;
    const comment = containerEl?.querySelector(".inkling-feedback-comment")?.value || null;
    try {
      await submitFeedback({
        rating,
        category: category || (rating === "thumbs_up" ? "helpful" : null),
        comment,
        messageId,
        conversationId: "inkling-main"
      });
      containerEl?.classList.add("inkling-msg__feedback--sent");
    } catch {
      this._appendBubble("system", "Could not save feedback — try again when signed in.", "");
    }
  }

  // ── Gentle in-app check-in ────────────────────────────────────────────────
  // When the user returns after a gap, Inkling asks what they're up to and offers
  // to jot it down. In-app only — no push, no permissions. Opt-out: "stop check-ins".
  _initCheckIn() {
    // Restore an unanswered check-in from a previous load so (a) the question is
    // visible in chat for context and (b) the reply still gets captured/saved.
    try {
      if (localStorage.getItem("inkling-checkin-pending") === "1") {
        this._awaitingCheckInReply = true;
        this._appendBubble("inkling", CHECKIN_HTML, "inkling-msg--proactive");
        this._showCheckInNudge();
      }
    } catch { /* ignore */ }
    try { this.maybeCheckIn(); } catch { /* ignore */ }
    const bump = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try { localStorage.setItem("inkling-last-seen", String(Date.now())); } catch { /* ignore */ }
    };
    bump();
    this._checkInTimer = setInterval(bump, 60000);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") { try { this.maybeCheckIn(); } catch { /* ignore */ } }
      });
    }
  }

  _checkInDue() {
    try {
      if (localStorage.getItem("inkling-checkin-off") === "1") return false;
      const last = Number(localStorage.getItem("inkling-last-seen")) || 0;
      if (!last) return false; // first ever visit — don't pounce
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem("inkling-last-checkin") === today) return false; // ≤ once/day
      return (Date.now() - last) / 3600000 >= 6; // away ≥ 6h
    } catch { return false; }
  }

  maybeCheckIn() {
    if (this._awaitingCheckInReply || !this._checkInDue()) return;
    try {
      localStorage.setItem("inkling-last-checkin", new Date().toISOString().slice(0, 10));
      localStorage.setItem("inkling-checkin-pending", "1"); // survives reloads
    } catch { /* ignore */ }
    this._awaitingCheckInReply = true;
    this._appendBubble("inkling", CHECKIN_HTML, "inkling-msg--proactive");
    this._showCheckInNudge();
  }

  _showCheckInNudge() {
    if (typeof document === "undefined") return;
    document.getElementById("inkling-checkin-nudge")?.remove();
    const n = document.createElement("button");
    n.id = "inkling-checkin-nudge";
    n.type = "button";
    n.textContent = "✦ What are you up to?";
    n.style.cssText =
      "position:fixed;right:16px;bottom:84px;z-index:11090;background:rgba(15,23,42,.95);color:#e2e8f0;" +
      "border:1px solid rgba(129,140,248,.55);border-radius:999px;padding:9px 14px;font:700 12px system-ui;" +
      "cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.5)";
    n.addEventListener("click", () => { n.remove(); try { this.expand(); } catch { /* ignore */ } });
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 14000);
  }

  /**
   * Reply to one of Inkling's check-ins. Instead of offering to save it as a
   * calendar note (the old behavior), let it flow as conversation and confirm
   * what got woven into the Mind graph — so it's clear the thread is remembered
   * and can be picked up later, not filed away.
   */
  _ackCheckInReply(text) {
    let concepts = [];
    try { concepts = [...new Set(extractConcepts(text).map((c) => c.label))]; } catch { /* ignore */ }
    if (concepts.length) {
      this._appendBubble("inkling",
        escapeHtml(`Love that — I've woven ${this._humanList(concepts)} into your Mind, so we can pick this thread back up anytime. What's pulling your focus most right now?`),
        "inkling-msg--proactive");
    } else {
      this._appendBubble("inkling",
        escapeHtml("Thanks for sharing that — I'm keeping it in mind. What's on your plate today?"),
        "inkling-msg--proactive");
    }
  }

  /** "a", "a and b", or "a, b, and c". */
  _humanList(arr) {
    const a = arr.map((s) => `“${s}”`);
    if (a.length <= 1) return a[0] || "";
    if (a.length === 2) return `${a[0]} and ${a[1]}`;
    return `${a.slice(0, -1).join(", ")}, and ${a[a.length - 1]}`;
  }

  /**
   * Passive proof that a turn became graph structure: a small chip under the
   * message naming what was mapped/linked, with one-tap View + (for your own
   * messages) an optional "Save as note" — no nagging yes/no prompt.
   */
  _showMindChip(delta, role, srcText) {
    if (!this.messagesEl || !delta) return;
    const added = delta.addedNodes || [];
    const linked = delta.addedEdges || [];
    if (!added.length && !linked.length) return; // only when the Mind actually grew

    const chip = document.createElement("div");
    chip.className = "inkling-mind-chip";
    chip.style.cssText =
      "display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:-2px 0 12px;padding:6px 10px;" +
      "border-radius:14px;background:rgba(88,166,255,0.10);border:1px solid rgba(88,166,255,0.30);" +
      "font:600 11px system-ui;color:#9ecbff;max-width:100%";

    const cap = (arr, n) => arr.length > n ? `${arr.slice(0, n).join(", ")} +${arr.length - n} more` : arr.join(", ");
    let txt = "";
    if (added.length) txt = `🧠 Mapped to your Mind: ${cap(added, 4)}`;
    else if (linked.length) txt = `🔗 Linked ${linked.slice(0, 2).map(([a, b]) => `${a} ↔ ${b}`).join(", ")}`;
    if (added.length && linked.length) txt += ` · ${linked.length} link${linked.length > 1 ? "s" : ""}`;
    const span = document.createElement("span");
    span.textContent = txt;
    chip.appendChild(span);

    const view = document.createElement("button");
    view.type = "button"; view.textContent = "🧠 View";
    view.style.cssText = "background:rgba(88,166,255,0.22);color:#cfe5ff;border:0;border-radius:999px;padding:3px 11px;font:700 11px system-ui;cursor:pointer";
    // Minimize the chat first (the Mind panel sits below it), then land directly
    // on the concepts from THIS message, ringed — not a generic graph view.
    let focusLabels = [];
    try { focusLabels = extractConcepts(srcText).map((c) => c.label); } catch { /* ignore */ }
    view.addEventListener("click", () => { this.minimize(); this.showMind({ focus: focusLabels }); });
    chip.appendChild(view);

    if (role === "user") {
      const note = document.createElement("button");
      note.type = "button"; note.textContent = "📌 Note";
      note.title = "Also save this to today's calendar";
      note.style.cssText = "background:transparent;color:#9ecbff;border:1px solid rgba(88,166,255,0.35);border-radius:999px;padding:3px 11px;font:600 11px system-ui;cursor:pointer";
      note.addEventListener("click", () => {
        const ok = this._saveTodayNote(srcText);
        note.textContent = ok ? "Noted ✓" : "Couldn't save";
        note.disabled = true; note.style.opacity = "0.7"; note.style.cursor = "default";
        if (ok) {
          // Connect the note to the day: one tap opens it in the Schedule.
          const open = document.createElement("button");
          open.type = "button"; open.textContent = "📅 View in Schedule";
          open.style.cssText = "background:rgba(88,166,255,0.22);color:#cfe5ff;border:0;border-radius:999px;padding:3px 11px;font:700 11px system-ui;cursor:pointer";
          const now = new Date(); const pad = (n) => String(n).padStart(2, "0");
          const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
          open.addEventListener("click", () => this.app?.navigateToWordWeaverDate?.(iso));
          chip.appendChild(open);
        }
      });
      chip.appendChild(note);
    }

    this.messagesEl.appendChild(chip);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /** Extra chip when Haiku finds concepts the local lexicon missed. */
  _appendAiMindChip(ex) {
    if (!this.messagesEl) return;
    const labels = ex.addedNodes || [];
    if (!labels.length) return;
    const cap = (arr, n) => arr.length > n ? `${arr.slice(0, n).join(", ")} +${arr.length - n} more` : arr.join(", ");
    const chip = document.createElement("div");
    chip.className = "inkling-mind-chip";
    chip.style.cssText =
      "display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:-6px 0 12px;padding:6px 10px;" +
      "border-radius:14px;background:rgba(160,107,255,0.10);border:1px solid rgba(160,107,255,0.32);" +
      "font:600 11px system-ui;color:#c9b6ff;max-width:100%";
    const span = document.createElement("span");
    span.textContent = `✦ Inkling also mapped: ${cap(labels, 4)}`;
    chip.appendChild(span);
    const view = document.createElement("button");
    view.type = "button"; view.textContent = "🧠 View";
    view.style.cssText = "background:rgba(160,107,255,0.24);color:#e9deff;border:0;border-radius:999px;padding:3px 11px;font:700 11px system-ui;cursor:pointer";
    view.addEventListener("click", () => { this.minimize(); this.showMind({ focus: labels }); });
    chip.appendChild(view);
    this.messagesEl.appendChild(chip);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /** Save a message to today's calendar (only when the user taps 📌 Note). */
  _saveTodayNote(text) {
    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      createEvent({
        title: text.slice(0, 80), text,
        startTime: now.toISOString(),
        endTime: new Date(now.getTime() + 30 * 60000).toISOString(),
        category: "personal", date: iso
      });
      return true;
    } catch { return false; }
  }

  /**
   * Catch explicit reminders ("remind me at 7pm to call mom") BEFORE the brain/LLM
   * so they always register in 🔔 Alerts — with a clear when/where confirmation.
   * Defaults to today (or tomorrow if the time has passed); no date required.
   * @returns {boolean} handled
   */
  _tryReminder(text) {
    const lower = text.toLowerCase();
    if (!/\b(remind me|set (a |an )?(reminder|alarm)|reminder to|alert me|wake me)\b/.test(lower)) return false;

    const tm = lower.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/) || lower.match(/\b(?:at|@)?\s*(\d{1,2})\s*(am|pm)\b/);
    if (!tm) {
      this._appendBubble("inkling", "Sure — what time should I remind you? (e.g. “7pm” or “14:30”)", "inkling-msg--proactive");
      return true;
    }
    let h = parseInt(tm[1], 10);
    let m = /^\d{2}$/.test(tm[2] || "") ? parseInt(tm[2], 10) : 0;
    const ap = String(tm[3] || tm[2] || "").toLowerCase();
    if (ap.includes("pm") && h < 12) h += 12;
    if (ap.includes("am") && h === 12) h = 0;

    const now = new Date();
    const d = new Date(now);
    const wd = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    if (/\btomorrow\b/.test(lower)) d.setDate(d.getDate() + 1);
    else {
      for (let i = 0; i < 7; i++) {
        if (lower.includes(wd[i])) { let diff = (i - now.getDay() + 7) % 7; if (diff === 0) diff = 7; d.setDate(d.getDate() + diff); break; }
      }
    }
    d.setHours(h, m, 0, 0);
    if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 1); // already passed today → next day

    const pad = (n) => String(n).padStart(2, "0");
    const dateIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    let body = text
      .replace(/\d{1,2}(:\d{2})?\s*(am|pm)/gi, " ")  // glued "7pm" / "7:30 pm"
      .replace(/\b(remind me|set (a |an )?(reminder|alarm)|reminder|alert me|wake me|to|at|on|tonight|today|tomorrow|am|pm|@)\b/gi, " ")
      .replace(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, " ")
      .replace(/\b\d{1,2}(:\d{2})?\b/g, " ")
      .replace(/\s+/g, " ").trim();
    if (!body) body = "Reminder";

    try {
      addAlert(createAlert({ time, text: body, category: "reminder", date: dateIso, priority: AlertPriority.LOW }));
      recomputeSchedule();
      this.alerts?._refresh?.();
    } catch { /* ignore */ }
    try {
      if ("Notification" in window && Notification.permission === "default") this.app?.notificationService?.requestPermission?.();
    } catch { /* ignore */ }

    const when = d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    this._appendBubble("inkling", `✓ Reminder set: <b>${escapeHtml(body)}</b><br>🔔 ${escapeHtml(when)} — find it under <b>Alerts</b>.`, "inkling-msg--proactive");
    if (this.messagesEl) {
      const b = document.createElement("button");
      b.textContent = "Open Alerts";
      b.style.cssText = "background:#1e293b;color:#cbd5e1;border:0;border-radius:999px;padding:6px 12px;font:700 12px system-ui;cursor:pointer;margin:2px 0 10px";
      b.addEventListener("click", () => this.alerts?.show?.());
      this.messagesEl.appendChild(b);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
    return true;
  }

  async _send() {
    const text = this.inputEl?.value?.trim();
    if (!text) return;
    this.inputEl.value = "";
    this._appendBubble("user", escapeHtml(text));

    // Mind graph: let the user ask what I'm noticing, or link two concepts.
    if (await this._tryMindIntent(text)) return;

    // Explicit reminder → always register in Alerts with a clear confirmation.
    if (!this._awaitingCheckInReply && this._tryReminder(text)) return;

    // Check-in reply: capture what they're up to (or honor an opt-out) instead of
    // routing it as a command.
    const checkInPending = this._awaitingCheckInReply || (() => { try { return localStorage.getItem("inkling-checkin-pending") === "1"; } catch { return false; } })();
    if (checkInPending) {
      this._awaitingCheckInReply = false;
      try { localStorage.removeItem("inkling-checkin-pending"); } catch { /* ignore */ }
      if (/\b(stop|turn off|no more|disable)\b.*check|check.?ins?\s*(off|stop)/i.test(text)) {
        try { localStorage.setItem("inkling-checkin-off", "1"); } catch { /* ignore */ }
        this._appendBubble("inkling", "Got it — I won't check in like that anymore. Flip it back on whenever you like.", "inkling-msg--proactive");
        return;
      }
      this._ackCheckInReply(text);
      return;
    }

    // "Take me to <date>" → open that day in the Schedule.
    const nav = this._parseNavDate(text);
    if (nav) {
      this._appendBubble("inkling", escapeHtml(`Opening ${nav.label} in your Schedule 🗓️`));
      this.app?.navigateToWordWeaverDate?.(nav.iso);
      return;
    }

    const brain = processUserInput(text, {
      userName: getDisplayName(),
      awaitingConfirm: Boolean(this._pending),
      history: this._chatHistory(),
      sideThread: this._sideThreadActive ? { active: true } : undefined
    });

    if (await this._handleBrainResult(brain, text)) {
      if (brain.action === "sideConversation" || brain.action === "askClarification") {
        this._sideThreadActive = true;
      } else if (["openWriter", "openCalendar", "openWordWeaver", "storeNote", "createAlert"].includes(brain.action)) {
        this._sideThreadActive = false;
      }
      return;
    }

    const intent = parseInklingMessage(text);
    await this._handleIntent(intent, text);
    this._sideThreadActive = false;
  }

  /**
   * @returns {{ role: string, content: string }[]}
   */
  _chatHistory() {
    if (!this.messagesEl) return [];
    const turns = [];
    this.messagesEl.querySelectorAll(".inkling-msg").forEach((el) => {
      const role = el.classList.contains("inkling-msg--user")
        ? "user"
        : el.classList.contains("inkling-msg--inkling")
          ? "assistant"
          : null;
      if (!role) return;
      turns.push({ role, content: el.textContent?.trim() ?? "" });
    });
    return turns.slice(-12);
  }

  /**
   * @param {import("../ai/AIBrain.js").BrainResult} brain
   * @param {string} text
   */
  async _handleBrainResult(brain, text) {
    if (brain.action === "sideConversation" || brain.action === "askClarification") {
      // Real conversation → server LLM (the local brain only routed us here).
      await this._respondViaLlm(text);
      return true;
    }

    if (brain.action === "openWriter") {
      const date =
        this.app?.notebookCalendarDock?.getDate?.() ??
        this.app?._getTodayDate?.() ??
        new Date().toISOString().slice(0, 10);
      await this.app?.openNotebookDayByDate?.(date);
      if (brain.aiResponse) this._appendBubble("inkling", escapeHtml(brain.aiResponse));
      return true;
    }

    if (brain.action === "openCalendar") {
      await this.app?._handleBottomNavTab?.("calendar", { toggle: false });
      if (brain.aiResponse) this._appendBubble("inkling", escapeHtml(brain.aiResponse));
      return true;
    }

    if (brain.action === "openWordWeaver") {
      await this.app?._handleBottomNavTab?.("wordweaver", { toggle: false });
      if (brain.aiResponse) this._appendBubble("inkling", escapeHtml(brain.aiResponse));
      return true;
    }

    if (brain.action === "createAlert") {
      const { registerAlertFromPayload } = await import("../alerts/alertsModel.js");
      const p = brain.payload ?? {};
      registerAlertFromPayload({
        time: String(p.time ?? "09:00"),
        text: String(p.text ?? text),
        category: String(p.category ?? "reminder")
      });
      // Prompt for notification permission so the alert can fire on time.
      try {
        if ("Notification" in window && Notification.permission === "default") {
          this.app?.notificationService?.requestPermission?.();
        }
      } catch { /* ignore */ }
      // Re-arm the scheduler so the new alert is picked up immediately.
      try {
        const { recomputeSchedule } = await import("../alerts/alertsScheduler.js");
        recomputeSchedule();
      } catch { /* ignore */ }
      this._appendBubble("inkling", escapeHtml(brain.aiResponse ?? "Okay, I'll alert you."));
      return true;
    }

    if (brain.action === "storeNote") {
      const intent = parseInklingMessage(text);
      if (intent.type === "propose_schedule" && intent.proposal) {
        await this._handleIntent(intent);
        return true;
      }
      if (brain.aiResponse) {
        this._appendBubble("inkling", escapeHtml(brain.aiResponse));
        return true;
      }
      return false;
    }

    if (brain.action === "none") {
      // No actionable command detected → treat as conversation via the LLM.
      await this._respondViaLlm(text);
      return true;
    }

    return false;
  }

  async _handleIntent(intent, originalText = "") {
    this._hideConfirm();

    if (intent.type === "chat") {
      // Defer plain chat to the server LLM instead of the canned reply.
      await this._respondViaLlm(originalText || intent.reply || "");
      return;
    }

    if (intent.type === "delete_item") {
      this._appendBubble("inkling", escapeHtml(intent.reply));
      return;
    }

    if (intent.type === "query_schedule") {
      const summary = this._summarizeSchedule(intent.date, intent.endDate);
      this._appendBubble("inkling", summary);
      return;
    }

    if (intent.type === "query_free_time") {
      const summary = this._findFreeSlots(intent.date);
      this._appendBubble("inkling", summary);
      return;
    }

    if (intent.type === "propose_schedule" && intent.proposal) {
      this._pending = intent.proposal;
      if (this._attachedImage) {
        this._pending.imageNote = `[image: ${this._attachedImage.name}]`;
      }
      this._appendBubble("inkling", intent.reply.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"));
      this._showConfirm();
      return;
    }

    this._appendBubble("inkling", "I’m still learning that phrase — try rewording or pick a day on the mini calendar.");
  }

  _summarizeSchedule(startIso, endIso) {
    const state = this.app.state;
    const items = buildNotebookReaderItems(state).filter(
      (i) => i.date >= startIso && i.date <= (endIso ?? startIso)
    );
    if (!items.length) {
      return `<p>Nothing scheduled for <strong>${startIso}</strong>${endIso !== startIso ? ` – ${endIso}` : ""}.</p>`;
    }
    const rows = items
      .slice(0, 12)
      .map(
        (i) =>
          `<li><strong>${escapeHtml(i.timeLabel)}</strong> ${escapeHtml(i.title)} — ${escapeHtml(i.message).slice(0, 80)}</li>`
      )
      .join("");
    const more = items.length > 12 ? `<p>…and ${items.length - 12} more in Notebook Reader.</p>` : "";
    return `<p>Here’s what I found:</p><ul class="inkling-list">${rows}</ul>${more}`;
  }

  _findFreeSlots(dateIso) {
    const busy = new Set();
    const items = buildNotebookReaderItems(this.app.state).filter((i) => i.date === dateIso);
    for (const i of items) {
      const h = Number(i.timeLabel.split(":")[0]);
      busy.add(h);
    }
    const free = [];
    for (let h = 8; h <= 20; h++) {
      if (!busy.has(h)) free.push(`${String(h).padStart(2, "0")}:00`);
    }
    if (!free.length) {
      return `<p>No open slots 8am–8pm on <strong>${dateIso}</strong> — pretty full day.</p>`;
    }
    return `<p>Open-ish hours on <strong>${dateIso}</strong>:</p><p>${free.join(", ")}</p>`;
  }

  _showConfirm() {
    this.confirmEl?.classList.remove("hidden");
  }

  _hideConfirm() {
    this.confirmEl?.classList.add("hidden");
    this._pending = null;
  }

  async _confirmSchedule(yes) {
    if (!yes || !this._pending) {
      this._appendBubble("inkling", "Okay — not added.");
      this._hideConfirm();
      this._attachedImage = null;
      return;
    }

    const p = this._pending;
    let text = p.text;
    if (p.imageNote) text = `${text}\n${p.imageNote}`;

    const result = await applyScheduleIntentAndRefresh(this.app, {
      kind: p.kind,
      date: p.date,
      time: p.time,
      text
    });

    if (result.ok) {
      this._appendBubble("inkling", "Added — check your calendar and timeline.");
    } else {
      this._appendBubble("inkling", `Couldn’t add: ${escapeHtml(result.error ?? "unknown")}. Try another date in this month.`);
    }

    this._attachedImage = null;
    this._hideConfirm();
  }

  /** Periodic digest (browser tab open) — not true OS cron. */
  _startCron() {
    const tick = () => {
      const cfg = loadCronConfig();
      if (!cfg.enabled) return;
      const now = Date.now();
      if (now - cfg.lastRun < cfg.intervalMs) return;
      saveCronConfig({ ...cfg, lastRun: now });
      this._proactiveDigest();
    };
    setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") tick();
    });
  }

  _proactiveDigest() {
    const state = this.app.state;
    const now = Date.now();
    const horizon = now + 24 * 60 * 60 * 1000;
    const upcoming = buildNotebookReaderItems(state, now).filter(
      (i) => i.triggerAt > now && i.triggerAt < horizon && i.status === "upcoming"
    );
    if (!upcoming.length) return;
    const n = upcoming.length;
    const first = upcoming[0];
    // Dedup: don't re-post an identical digest (the cron tick + visibilitychange
    // were appending the same "Heads up" bubble repeatedly).
    const digestKey = `${n}|${first.title}|${first.timeLabel}`;
    if (digestKey === this._lastDigestKey) return;
    this._lastDigestKey = digestKey;
    if (!this.isOpen()) {
      document.getElementById("inkling-fab")?.classList.add("inkling-fab--pulse");
    }
    this._appendBubble(
      "inkling",
      `⏰ <strong>Heads up</strong> — ${n} thing${n > 1 ? "s" : ""} in the next 24h. Next: ${colorizeAlertWords(escapeHtml(first.title))} at ${escapeHtml(first.timeLabel)}.`,
      "inkling-msg--proactive"
    );
  }

  notifyProactive(message) {
    this._appendBubble("inkling", escapeHtml(message), "inkling-msg--proactive");
  }
}

function loadCronConfig() {
  try {
    const raw = localStorage.getItem(INKLING_CRON_KEY);
    if (raw) return { enabled: true, intervalMs: 30 * 60 * 1000, lastRun: 0, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { enabled: true, intervalMs: 30 * 60 * 1000, lastRun: 0 };
}

function saveCronConfig(cfg) {
  try {
    localStorage.setItem(INKLING_CRON_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
