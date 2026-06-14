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
    this._startCron();
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
    // Sit above the Schedule day overlay (z 11000) so the panel is usable when
    // opened from the floating avatar while on Schedule.
    this.el?.style.setProperty("z-index", "11060", "important");
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
      if (!moved && Math.hypot(dx, dy) > 6) { moved = true; orb.classList.add("inkling-orb--dragging"); }
      if (moved) {
        const left = Math.max(6, Math.min(window.innerWidth - orb.offsetWidth - 6, originLeft + dx));
        const top = Math.max(6, Math.min(window.innerHeight - orb.offsetHeight - 6, originTop + dy));
        this._placeOrb(left, top);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
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
    this._orbItems = [
      mk("💬", "Chat with Inkling", () => this.openWithContext()),
      mk("🔔", "Alerts", () => this.alerts?.show()),
      mk("＋", "New event", () => this._orbNewEvent()),
      mk("🎨", "Text style", () => openTextStylePicker()),
      mk("📅", "Go to today", () => this._orbToday())
    ];
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
    const email = document.getElementById("auth-account-label")?.textContent?.trim() || "";
    const html = escapeHtml(getInklingWelcomeMessage(getDisplayName(email))).replace(/\n/g, "<br>");
    this._appendBubble("inkling", html);
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
      const res = await fetchInklingChat({
        message: text,
        history: this._chatHistory(),
        referenceDate:
          this.app?._getTodayDate?.() ?? new Date().toISOString().slice(0, 10),
        userName: getDisplayName(),
        awaitingConfirm: Boolean(this._pending)
      });
      typing?.remove();
      const reply = res?.reply || "I’m here — what would you like to do?";
      this._appendBubble("inkling", this._formatReply(reply));
    } catch (err) {
      typing?.remove();
      console.warn("[Inkling] LLM turn failed", err);
      this._appendBubble(
        "inkling",
        escapeHtml("I couldn’t reach the server just now — try again in a moment.")
      );
    }
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

  async _send() {
    const text = this.inputEl?.value?.trim();
    if (!text) return;
    this.inputEl.value = "";
    this._appendBubble("user", escapeHtml(text));

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
