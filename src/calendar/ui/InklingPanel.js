import { processUserInput } from "../ai/AIBrain.js";
import { parseInklingMessage } from "../ai/inklingParser.js";
import { getInklingWelcomeMessage } from "../ai/inklingWelcome.js";
import { buildNotebookReaderItems } from "../notebookReaderFeed.js";
import { applyScheduleIntentAndRefresh } from "../ai/scheduleIntent.js";
import { getDisplayName } from "./userProfile.js";
import { submitFeedback } from "../../auth/userAccount.js";
import { registerInklingApp, installWriterNavigation } from "./Writer.js";
import { openPanel } from "./AppLauncher.js";
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

    document.getElementById("inkling-fab")?.addEventListener("click", () => this.expand());

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

    document.getElementById("inkling-bottom-nav")?.addEventListener(
      "click",
      (event) => {
        const tab = event.target.closest?.("[data-tab]")?.getAttribute("data-tab");
        if (!tab) return;
        this._closeSiblingPanels();
      },
      true
    );
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
        this.app?.wordWeaverEmbed?.setSize?.("minimized");
        this.app?.layerManager?.close("wordweaver");
        this._returnToHomeSurface();
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

  showWelcomeIfNeeded() {
    if (this.messagesEl?.childElementCount > 0) return;
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
    await this._handleIntent(intent);
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
      if (brain.aiResponse) {
        this._appendBubble("inkling", escapeHtml(brain.aiResponse));
      }
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

    if (brain.action === "none" && brain.aiResponse) {
      this._appendBubble("inkling", escapeHtml(brain.aiResponse));
      return true;
    }

    return false;
  }

  async _handleIntent(intent) {
    this._hideConfirm();

    if (intent.type === "chat") {
      this._appendBubble("inkling", escapeHtml(intent.reply));
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
    if (!this.isOpen()) {
      document.getElementById("inkling-fab")?.classList.add("inkling-fab--pulse");
    }
    this._appendBubble(
      "inkling",
      `⏰ <strong>Heads up</strong> — ${n} thing${n > 1 ? "s" : ""} in the next 24h. Next: ${escapeHtml(first.title)} at ${escapeHtml(first.timeLabel)}.`,
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
