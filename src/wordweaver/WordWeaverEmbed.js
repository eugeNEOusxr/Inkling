import { segmentFromTime, buildSegmentModule } from "../inkling-core/timelineNode.js";
import { WordWeaverScene } from "./WordWeaverScene.js";
import { WordWeaverChrome } from "./WordWeaverChrome.js";
import { getCalendarMode } from "./calendarMode.js";
import * as bus from "../utils/EventBus.js";
import { WEAVE_LAYOUT_MODES } from "./layoutModes.js";
import { syncCalendarDayToWeaver, getWeaverNodesForSegment } from "./calendarWordWeaverSync.js";
import { getAllTimelineNodes } from "../inkling-core/timelineStorage.js";
import { buildRemarkNodes } from "./wordweaverRemarks.js";
import { buildDailySummary, renderDailySummaryHtml } from "./wordweaverDailyView.js";
import { buildDayContext } from "./dayContext.js";
import { resolveRemarkNodes } from "./fetchLlmRemarks.js";
import { CustomLayoutEditor } from "./CustomLayoutEditor.js";
import {
  loadCustomLayout,
  LAYOUT_MODE_KEY,
  setCustomLayoutOverride
} from "./customLayout.js";
import { scheduleWordWeaverCloudSync } from "./wordweaverCloudSync.js";

const SIZE_KEY = "inkling:wordweaverSize";

/** @typedef {'expanded' | 'minimized'} WordWeaverSize */

/**
 * WordWeaver — immersive 3D thought-weaving tied to the calendar.
 */
export class WordWeaverEmbed {
  /**
   * @param {{ getCalendarState?: () => import('../calendar/calendarState.js').CalendarState | null }} [opts]
   */
  constructor(opts = {}) {
    this.getCalendarState = opts.getCalendarState ?? (() => null);
    this.el = document.getElementById("wordweaver-embed");
    this.mountEl = document.getElementById("wordweaver-embed-mount");
    this.dateEl = document.getElementById("wordweaver-embed-date");
    this.headlineEl = document.getElementById("wordweaver-embed-headline");
    this.sizeBtn = document.getElementById("wordweaver-embed-size-btn");
    this.dailyEl = document.getElementById("wordweaver-daily-panel");
    this.remarksEl = document.getElementById("wordweaver-remarks");
    this.layoutSelect = document.getElementById("wordweaver-layout-mode");
    this._scene = null;
    this._date = null;
    this._segment = "afternoon";
    this._time = "12:00";
    this._immersive = false;
    /** @type {WordWeaverSize} */
    this._size = this._loadSize();
    /** @type {import('./layoutModes.js').WeaveLayoutMode} */
    this._layoutMode = this._loadLayout();
    this._remarksGen = 0;
    this._remarksSource = "local";
    /** @type {import('../inkling-core/timelineNode.js').SegmentModule | null} */
    this._cachedModule = null;
    /** @type {HTMLElement | null} */
    this._homeParent = null;
    /** @type {Node | null} */
    this._homeNext = null;
    /** @type {WordWeaverChrome | null} */
    this._chrome = new WordWeaverChrome(this);

    this.layoutEditor = new CustomLayoutEditor({
      onPreviewStart: () => this._beginCustomEdit(),
      onPreview: (params) => this._previewCustomLayout(params),
      onSave: (params) => {
        this._layoutMode = "custom";
        if (this.layoutSelect) this.layoutSelect.value = "custom";
        try {
          localStorage.setItem(LAYOUT_MODE_KEY, "custom");
        } catch {
          /* ignore */
        }
        if (this._date) {
          this._cachedModule = this._buildModule(this._date, this._segment);
          this.refresh();
        }
      }
    });

    this._bindSegmentTabs();
    this._bindLayoutSelect();
    this._bindDateNav();

    this.sizeBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleSize();
    });

    this.el?.querySelector(".wordweaver-embed__bar")?.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    document.getElementById("wordweaver-date-prev")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._shiftDate(-1);
    });
    document.getElementById("wordweaver-date-next")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._shiftDate(1);
    });
    document.getElementById("wordweaver-date-today")?.addEventListener("click", (e) => {
      e.stopPropagation();
      // In the 3D drill-down day view, jump the day there.
      if (getCalendarMode() === "3d" && this._scene?.goToTodayDay?.()) return;
      this.show(this._todayIso(), this._time, true, { immersive: this._immersive });
    });

    this.el?.classList.remove("hidden", "is-idle");
    document.body.classList.add("wordweaver-embed-open");
    this._applySize(this._size, false);

    if (this.layoutSelect) {
      this.layoutSelect.value = this._layoutMode;
    }

    this._onAppearanceChange = () => {
      if (this._scene && this._date) this.refresh();
    };
    window.addEventListener("inkling:appearance-change", this._onAppearanceChange);

    this._onShellForChrome = () => this._syncFlightChrome();
    document.addEventListener("inkling:shell-surface", this._onShellForChrome);
    this._offModeForChrome = bus.on("modeChanged", () => this._syncFlightChrome());

    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      const immersive = params.get("tab") === "wordweaver" || params.get("wordweaver") === "1";
      this.show(this._todayIso(), "12:00", false, { immersive });
    });
  }

  _bindSegmentTabs() {
    this.el?.querySelectorAll("[data-segment]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const seg = btn.getAttribute("data-segment");
        if (seg !== "morning" && seg !== "afternoon" && seg !== "night") return;
        this._segment = seg;
        this.el?.querySelectorAll("[data-segment]").forEach((b) => {
          const active = b.getAttribute("data-segment") === seg;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-pressed", String(active));
        });
        if (this._date) this.show(this._date, this._time, true, { immersive: this._immersive });
        this._syncScenicBackdrop();
      });
    });
  }

  _syncScenicBackdrop() {
    this._scene?.setScenicBackdropForSegment?.(this._segment);
  }

  _bindLayoutSelect() {
    if (!this.layoutSelect) return;
    if (!this.layoutSelect.options.length) {
      for (const m of WEAVE_LAYOUT_MODES) {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.label;
        this.layoutSelect.appendChild(opt);
      }
    }
    this.layoutSelect.addEventListener("change", () => {
      const v = this.layoutSelect.value;
      if (!WEAVE_LAYOUT_MODES.some((m) => m.id === v)) return;
      this._layoutMode = v;
      document.body.classList.toggle("wordweaver-layout-editing", v === "custom");
      try {
        localStorage.setItem(LAYOUT_MODE_KEY, v);
      } catch {
        /* ignore */
      }
      scheduleWordWeaverCloudSync({ layoutMode: v });
      this._scene?.setLayoutMode(v);
      if (this._date) this.show(this._date, this._time, true, { immersive: this._immersive });
    });
  }

  _bindDateNav() {
    /* handled in constructor */
  }

  _loadSize() {
    try {
      const v = localStorage.getItem(SIZE_KEY);
      return v === "minimized" ? "minimized" : "expanded";
    } catch {
      return "expanded";
    }
  }

  _loadLayout() {
    try {
      const v = localStorage.getItem(LAYOUT_MODE_KEY);
      if (WEAVE_LAYOUT_MODES.some((m) => m.id === v)) return v;
    } catch {
      /* ignore */
    }
    return "street";
  }

  _persistSize() {
    try {
      localStorage.setItem(SIZE_KEY, this._size);
    } catch {
      /* ignore */
    }
  }

  _applySize(size, resizeScene = true) {
    this._size = size;
    const minimized = size === "minimized";
    this.el?.classList.toggle("is-minimized", minimized);
    this.el?.classList.toggle("is-expanded", !minimized);
    document.body.classList.toggle("wordweaver-minimized", minimized);
    document.body.classList.toggle("wordweaver-expanded", !minimized);

    if (this.sizeBtn) {
      this.sizeBtn.textContent = minimized ? "▴" : "▾";
      this.sizeBtn.setAttribute(
        "aria-label",
        minimized ? "Expand WordWeaver" : "Minimize WordWeaver"
      );
    }

    this._persistSize();
    if (resizeScene) {
      requestAnimationFrame(() => this._scene?._resize?.());
      setTimeout(() => this._scene?._resize?.(), 120);
    }
    window.dispatchEvent(
      new CustomEvent("wordweaver:size-change", { detail: { size: this._size } })
    );
  }

  toggleSize() {
    // In full-screen/immersive mode there is no corner-preview to shrink to, so
    // the ▾ collapse control means "close WordWeaver to the idle surface". Ask
    // the app to run its close-to-idle path (CalendarApp listens for this).
    if (this._immersive) {
      window.dispatchEvent(new CustomEvent("wordweaver:request-exit"));
      return;
    }
    this._applySize(this._size === "minimized" ? "expanded" : "minimized");
  }

  setSize(size) {
    if (size !== "minimized" && size !== "expanded") return;
    this._applySize(size);
  }

  getSize() {
    return this._size;
  }

  _isStageActive() {
    return (
      this._immersive ||
      document.body.classList.contains("inkling-tab-wordweaver")
    );
  }

  _syncFlightChrome() {
    const active =
      Boolean(this._scene) &&
      this._isStageActive() &&
      getCalendarMode() === "3d";
    this._chrome?.setActive(active);
  }

  /**
   * Move panel to document.body so it stacks above the stage backdrop (top-chrome is z-index 10070).
   * @param {boolean} active
   */
  _attachToStage(active) {
    if (!this.el) return;

    if (active) {
      if (!this._homeParent) {
        this._homeParent = this.el.parentElement;
        this._homeNext = this.el.nextSibling;
      }
      if (this.el.parentElement !== document.body) {
        document.body.appendChild(this.el);
      }
      this.el.classList.add("wordweaver-embed--stage");
    } else {
      this.el.classList.remove("wordweaver-embed--stage");
      if (this._homeParent && this.el.parentElement !== this._homeParent) {
        if (this._homeNext?.parentElement === this._homeParent) {
          this._homeParent.insertBefore(this.el, this._homeNext);
        } else {
          this._homeParent.appendChild(this.el);
        }
      }
    }

    this._scheduleSceneResize();
  }

  _scheduleSceneResize() {
    requestAnimationFrame(() => this._scene?._resize?.());
    setTimeout(() => this._scene?._resize?.(), 80);
    setTimeout(() => this._scene?._resize?.(), 280);
  }

  /**
   * Full-screen 3D entry from bottom nav / home icon.
   */
  enterImmersive() {
    this._immersive = true;
    this._applySize("expanded");
    this._attachToStage(true);
    document.body.classList.add("wordweaver-immersive");
    const today = this._todayIso();
    this.show(today, this._time || "12:00", false, { immersive: true });
    this._syncFlightChrome();
  }

  exitImmersive() {
    this._immersive = false;
    document.body.classList.remove("wordweaver-immersive");
    document.body.classList.remove("wordweaver-layout-editing");
    this._attachToStage(this._isStageActive());
    this._syncFlightChrome();
  }

  _todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  _shiftDate(delta) {
    // In the 3D drill-down DAY view, the ‹ › arrows step the focused day there.
    if (getCalendarMode() === "3d" && this._scene?.stepDay?.(delta)) {
      const base = this._scene._dayIso ?? this._date;
      if (base) {
        this._date = base;
        const el = document.getElementById("wordweaver-embed-date");
        if (el) el.textContent = this._formatDateLabel(base);
      }
      return;
    }
    if (!this._date) return;
    const d = new Date(`${this._date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    this.show(iso, this._time, true, { immersive: this._immersive });
  }

  _formatDateLabel(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  _getAllDayNodes(dateStr) {
    const state = this.getCalendarState();
    if (state) syncCalendarDayToWeaver(state, dateStr);
    return state ? getAllTimelineNodes().filter((n) => n.date === dateStr) : [];
  }

  /**
   * @param {string} dateStr
   * @param {import('../inkling-core/timelineNode.js').DaySegment} segment
   * @param {import('../inkling-core/timelineNode.js').TimelineNode[]} [remarkNodes]
   */
  _buildModule(dateStr, segment, remarkNodes = null) {
    const state = this.getCalendarState();
    const allDay = this._getAllDayNodes(dateStr);
    const baseNodes = state
      ? getWeaverNodesForSegment(state, dateStr, segment)
      : allDay.filter((n) => n.segment === segment);

    const remarks =
      remarkNodes ??
      buildRemarkNodes(allDay, dateStr).filter((r) => r.segment === segment);
    const nodes = [...baseNodes, ...remarks];

    return buildSegmentModule(dateStr, segment, nodes);
  }

  async _fetchAndApplyRemarks(dateStr, segment) {
    const gen = ++this._remarksGen;
    this._updateRemarksLoading();

    const state = this.getCalendarState();
    const allDay = this._getAllDayNodes(dateStr);
    const dayContext = buildDayContext(state, dateStr, allDay);

    const { nodes, source } = await resolveRemarkNodes(dateStr, dayContext, allDay);
    if (gen !== this._remarksGen || this._date !== dateStr || this._segment !== segment) return;

    this._remarksSource = source;
    const segmentRemarks = nodes.filter((n) => n.segment === segment);
    const module = this._buildModule(dateStr, segment, segmentRemarks);
    this._updateRemarks(module, source);
    this._updateHeadline(module);
    this._renderScene(module, { immersive: this._immersive });
  }

  _updateRemarksLoading() {
    if (!this.remarksEl) return;
    this.remarksEl.innerHTML = `<p class="ww-remarks__loading">Weaving AI insights…</p>`;
  }

  _renderScene(module, opts = {}) {
    if (this._size !== "expanded" && !this._immersive) return;
    this._cachedModule = module;
    this._ensureScene();
    this._scene?.setLayoutMode(this._layoutMode);
    const customParams =
      opts.customParams ??
      (this._layoutMode === "custom" ? loadCustomLayout() : null);
    this._scene?.setModule(module, {
      immersive: Boolean(opts.immersive),
      skipEntrance: Boolean(opts.skipEntrance),
      customParams,
      editGuide: Boolean(opts.editGuide || this.layoutEditor?.isOpen?.()),
      keepGuide: Boolean(opts.keepGuide)
    });
    this._scene?.assertMonthGridLayout?.();
    this._scene?.setScenicBackdropForSegment?.(this._segment);
    this._syncFlightChrome();
    requestAnimationFrame(() => this._scene?._resize?.());
    setTimeout(() => this._scene?._resize?.(), 150);
  }

  _updateDailyPanel(dateStr) {
    const state = this.getCalendarState();
    if (!this.dailyEl || !state) {
      if (this.dailyEl) this.dailyEl.innerHTML = "";
      return;
    }
    const summary = buildDailySummary(state, dateStr);
    this.dailyEl.innerHTML = renderDailySummaryHtml(summary);
  }

  _updateRemarks(module, source = this._remarksSource) {
    if (!this.remarksEl) return;
    const insights = module.nodes.filter((n) => n.kind === "insight");
    const sourceLabel =
      source === "llm"
        ? "AI insights"
        : source === "mock"
          ? "Demo insights (add OPENAI_API_KEY for live AI)"
          : source === "cache"
            ? "Cached insights"
            : source === "rules" || source === "local"
              ? "Quick insights"
              : "Insights";

    if (!insights.length) {
      this.remarksEl.innerHTML = `<p class="ww-remarks__empty">Insights appear as your calendar fills up and deadlines approach.</p>`;
      return;
    }
    this.remarksEl.innerHTML =
      `<p class="ww-remarks__source">${sourceLabel}</p>` +
      insights.map((n) => `<p class="ww-remarks__item">${escapeHtml(n.text)}</p>`).join("");
  }

  _updateHeadline(module) {
    const dateLabel = this._formatDateLabel(module.date);
    const title = `${dateLabel} · ${module.label}`;
    if (this.headlineEl) {
      this.headlineEl.textContent = title;
      this.headlineEl.title = title;
    }
    if (this.dateEl) {
      const count = module.nodes.filter((n) => n.kind !== "insight").length;
      const layoutLabel =
        this._layoutMode === "custom"
          ? loadCustomLayout().name || "My layout"
          : WEAVE_LAYOUT_MODES.find((m) => m.id === this._layoutMode)?.label ?? "Street";
      this.dateEl.textContent =
        count > 0
          ? `${count} woven · ${layoutLabel}`
          : "Linked from your calendar & notes";
    }
  }

  _ensureScene() {
    if (!this.mountEl || this._scene) return;
    this._scene = new WordWeaverScene(this.mountEl, {
      onNodeClick: (detail) => {
        window.dispatchEvent(
          new CustomEvent("wordweaver:node-click", {
            detail: {
              date: detail.date,
              time: detail.time,
              text: detail.text,
              node: detail.node,
              segment: this._segment
            }
          })
        );
      }
    });
    this._scene.setLayoutMode(this._layoutMode);
    this._scene.assertMonthGridLayout?.();
    this._scene.setScenicBackdropForSegment?.(this._segment);
    this._syncFlightChrome();
  }

  /**
   * @param {string} dateStr YYYY-MM-DD
   * @param {string} [time HH:MM]
   * @param {boolean} [keepSegment]
   * @param {{ immersive?: boolean }} [opts]
   */
  show(dateStr, time, keepSegment = false, opts = {}) {
    if (!this.mountEl || !dateStr) return;

    if (opts.immersive) this._immersive = true;

    this._date = dateStr;
    this._time = time ?? this._time ?? "12:00";
    if (!keepSegment && time) {
      this._segment = segmentFromTime(time);
      this.el?.querySelectorAll("[data-segment]").forEach((b) => {
        const active = b.getAttribute("data-segment") === this._segment;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
    }

    this.el?.classList.remove("hidden", "is-idle");
    document.body.classList.add("wordweaver-embed-open");
    if (this._immersive) document.body.classList.add("wordweaver-immersive");
    this._attachToStage(this._isStageActive());

    try {
      const module = this._buildModule(dateStr, this._segment);
      this._cachedModule = module;
      this._updateHeadline(module);
      this._updateDailyPanel(dateStr);
      this._updateRemarks(module, "local");
      this._renderScene(module, {
        immersive: Boolean(opts.immersive || this._immersive),
        editGuide: this.layoutEditor?.isOpen?.()
      });
      void this._fetchAndApplyRemarks(dateStr, this._segment);
    } catch (err) {
      console.error("[WordWeaverEmbed] scene update failed", err);
      if (this.headlineEl) this.headlineEl.textContent = this._formatDateLabel(dateStr);
    }
  }

  hide() {
    this._date = null;
    this._cachedModule = null;
    this._scene?._editor?.hide?.(); // tuck away the 3D add-note bar on tab switch
    document.body.classList.remove("wordweaver-layout-editing");
    this._attachToStage(false);
    this.exitImmersive();
    this._syncFlightChrome();
    if (this.headlineEl) this.headlineEl.textContent = "WordWeaver";
    if (this.dateEl) this.dateEl.textContent = "";
    if (this.dailyEl) this.dailyEl.innerHTML = "";
    if (this.remarksEl) this.remarksEl.innerHTML = "";
  }

  refresh() {
    if (this._date) this.show(this._date, this._time, true, { immersive: this._immersive });
  }

  dispose() {
    this._offModeForChrome?.();
    this._offModeForChrome = null;
    if (this._onShellForChrome) {
      document.removeEventListener("inkling:shell-surface", this._onShellForChrome);
      this._onShellForChrome = null;
    }
    this._chrome?.dispose();
    this._chrome = null;
    this._scene?.dispose();
    this._scene = null;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
