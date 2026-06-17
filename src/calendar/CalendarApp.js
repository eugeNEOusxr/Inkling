import * as THREE from "three";
import {
  createCalendarState,
  createCalendarStateFromSaved,
  addMonths,
  getMonthLabel,
  loadSavedMonth,
  persistCalendarState,
  extractDayDataByDate,
  getDayById,
  parseDate,
  SPACING_Y,
  isToday,
  addAppointment,
  deleteAppointment,
  computeTriggerAt
} from "./calendarState.js";
import { CalendarWall } from "./CalendarWall.js";
import { DayDetailView } from "./DayDetailView.js";
import { ThreadPanel } from "./ui/ThreadPanel.js";
import { UIOverlay } from "./UIOverlay.js";
import { LayerManager } from "../layers/LayerManager.js";
import { ScheduleModal } from "./ui/ScheduleModal.js";
import { AppointmentModal } from "./ui/AppointmentModal.js";
import { MonthTransitionController } from "./MonthTransitionController.js";
import { CalendarInteraction } from "./CalendarInteraction.js";
import { CameraController } from "./CameraController.js";
import { NotificationService } from "./notifications/NotificationService.js";
import { NotificationWall } from "./NotificationWall.js";
import { NotificationDropdown } from "./ui/NotificationDropdown.js";
import { NotificationSettings } from "./ui/NotificationSettings.js";
import { InstallPrompt } from "./ui/InstallPrompt.js";
import { UpdatePrompt } from "./ui/UpdatePrompt.js";
import { loadNotificationSettings } from "./notifications/notificationSettings.js";
import { initPushLifecycle } from "./notifications/webPush.js";
import { scheduleUpload as schedulePushUpload, uploadNow as uploadPushNow } from "./notifications/pushSchedule.js";
import { bootstrapAppearance } from "../theme/applyAppearance.js";
import { iconDay, iconHour, iconBell, iconSettings } from "./ui/IconLibrary.js";
import { WindowManager } from "./ui/WindowManager.js";
import { AppLauncher, openPanel } from "./ui/AppLauncher.js";
import { DayWindow } from "./ui/DayWindow.js";
import { NotebookWriterPanel } from "./ui/NotebookWriterPanel.js";
import { NotebookCalendarDock } from "./ui/NotebookCalendarDock.js";
import { InklingPanel } from "./ui/InklingPanel.js";
import { MinimizeDock } from "./ui/MinimizeDock.js";
import { InklingBottomNav } from "./ui/InklingBottomNav.js";
import { AlertsPanel } from "./alerts/AlertsPanel.js";
import { initAlertsUi } from "./alerts/alertsUi.js";
import { openAlertsDropdown } from "./alerts/AlertsDropdown.js";
import { mountAlertsNavigation } from "./ui/NavigationBar.js";
import { startAlertsScheduler } from "./alerts/alertsScheduler.js";
import { syncAlertsBadge } from "./alerts/alertsModel.js";
import { getCosmosBackdrop } from "./ui/CosmosBackdrop.js";
import { showIdleSurface, beginAppTabSurface } from "./ui/shellSurfaces.js";
import { consumeWebGLFallbackNotice } from "../wordweaver/calendarMode.js";
import { closeAlertsDropdown } from "./alerts/AlertsDropdown.js";
import { WordWeaverEmbed } from "../wordweaver/WordWeaverEmbed.js";
import { commitSlotNote } from "../utils/slotNoteSync.js";
import { getLastView, saveLastView } from "../utils/storage.js";
import { SHELL_APPS } from "../shell/appRegistry.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Dual calendar: Notebook Calendar (notes) + Appointments Calendar, plus Notebook Reader summary.
 */
export class CalendarApp {
  constructor({ scene, camera, renderer, controls, osShell = true, onLocalDataChange }) {
    this.onLocalDataChange = onLocalDataChange ?? (() => {});
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;
    this.osShell = osShell;
    this._overviewCameraBookmark = null;
    this._initialView = null;
    this._fallbackMinimizeDock = null;

    this.activeWall = "notebook";
    this.layerManager = new LayerManager();
    this.viewMode = "overview";
    this.panelMode = null;
    this.selectedDayId = null;
    this._wallBeforeNotification = "notebook";
    this._isMobileViewport = window.innerWidth <= 768;
    this._mobileToolbarEl = null;
    this.nativeRuntime = this._detectNativeRuntime();
    this.installPrompt = null;
    this.updatePrompt = new UpdatePrompt();
    this._swRegistration = null;

    const saved = loadSavedMonth();
    const now = new Date();
    const year = saved?.year ?? now.getFullYear();
    const month = saved?.month ?? now.getMonth() + 1;

    if (saved?.dayDataByDate) {
      this.state = createCalendarStateFromSaved(year, month, saved.dayDataByDate);
    } else {
      this.state = createCalendarState(year, month);
    }

    this.notebookWall = new CalendarWall(scene);
    this.dayDetailView = new DayDetailView(scene);
    this.cameraController = new CameraController(camera, controls);
    this.monthTransition = new MonthTransitionController(this.notebookWall);
    this.wallTransition = { isBusy: false };

    this.notificationWall = new NotificationWall(scene);

    this.notificationDropdown = new NotificationDropdown({
      onSelect: (target) => this.navigateFromNotification(target),
      onOpenWall: () => this.enterNotificationWall(),
      onOpenSettings: () => this.notificationSettings.open()
    });

    this.notificationSettings = new NotificationSettings({
      onChange: () => this._refreshNotificationUi(),
      onTestSound: (themeId) => this.notificationService.testSound(themeId),
      onRequestBrowserPermission: () => this.notificationService.requestPermission(),
      // When web push is turned on, immediately upload the alarm schedule so the
      // server knows what to fire.
      onPushEnabled: () => uploadPushNow(() => this.state).catch(() => {}),
      onCheckUpdates: () => this.checkForUpdates()
    });

    this.notificationService = new NotificationService(() => this.state, {
      onFeedUpdate: (feed) => this.notificationDropdown.setItems(feed),
      onHistoryUpdate: () => {
        if (this.viewMode === "notification-wall") {
          this.notificationWall.buildFromState(this.state);
        }
      },
      onNavigate: (target) => this.navigateFromNotification(target)
    });
    this.notificationService.start();

    // Web Push: re-subscribe on SW key rotation and refresh the subscription on
    // the (ephemeral) backend, then push the current alarm schedule up.
    initPushLifecycle();
    schedulePushUpload(() => this.state);

    this.notificationWall.onItemClick = (target) => this.navigateFromNotification(target);
    this.notificationWall.onBack = () => this.exitNotificationWall();
    this.notificationWall.onMinimize = () => this._minimizeNotificationWall();

    this.threadPanel = new ThreadPanel(this.state, {
      onChange: () => this._onDataChange(),
      onBack: () => this.closePanels(),
      onSetReminder: (dayId) => this._openSchedule("reminder", dayId),
      onSetAlarm: (dayId) => this._openSchedule("alarm", dayId),
      onThreadChange: () => {
        if (this.uiOverlay) this.uiOverlay.reload();
      }
    });

    // Dock before WordWeaver so a weave error cannot block the small calendar.
    this.notebookCalendarDock = new NotebookCalendarDock({
      onOpenDay: (date) => this.openDayNotesByDate(date),
      onOpenNotes: (date) => this.openDayNotesByDate(date),
      onOpenWriter: (date) => this.openNotebookDayByDate(date),
      onSyncMonth: (date) => this.syncCalendarMonth(date),
      onMaximize: () => this.enterCalendarMaxLayer(),
      onSidebarChange: () => {}
    });

    this.wordWeaverEmbed = new WordWeaverEmbed({
      getCalendarState: () => this.state
    });

    this.inklingPanel = new InklingPanel(this);

    this.notebookWriterPanel = new NotebookWriterPanel(this.state, {
      onChange: () => this._onDataChange(),
      onBack: () => this.closePanels(),
      onSetReminder: (dayId) => this._openSchedule("reminder", dayId),
      onSetAlarm: (dayId) => this._openSchedule("alarm", dayId),
      onHourSelect: (hour) => this._syncHour(hour),
      onCommitNote: (payload) => this._commitSlotNote(payload),
      onCommitAppointment: (payload) => this._commitSlotAppointment(payload),
      onDeleteAppointment: (payload) => this._deleteSlotAppointment(payload),
      onMinimize: () => this._minimizeWriterPanel(),
      onPickDate: (iso) => this.openNotebookDayByDate(iso)
    });

    this.dayWindow = new DayWindow({
      onBack: () => this.closePanels(),
      onMinimize: (dayId, title, mode) =>
        this._dockMinimizedPanel(
          `day-window-${mode}-${dayId}`,
          title,
          () => this.dayWindow.restore()
        ),
      onHourSelect: (hour) => this._syncHour(hour),
      onCommitNote: (payload) => this._commitSlotNote(payload),
      onSetReminder: (dayId) => this._openSchedule("reminder", dayId),
      onSetAlarm: (dayId) => this._openSchedule("alarm", dayId)
    });
    this.dayWindow.setStateAccessor(() => this.state);

    this.uiOverlay = new UIOverlay(this.state, {
      getSelectedThreadId: () => this.threadPanel.getSelectedThreadId(),
      onHourChange: (hour) => this._syncHour(hour),
      onSaved: () => this._onDataChange()
    });

    this.scheduleModal = new ScheduleModal(this.state, {
      onSaved: () => {
        this.threadPanel.refresh();
        this.notebookWriterPanel.refresh();
        this._onDataChange();
      },
      requestNotifyPermission: () => this.notificationService.requestPermission()
    });

    this.appointmentModal = new AppointmentModal(this.state, {
      onSaved: () => {
        this.notebookWriterPanel.refresh();
        this._onDataChange();
      },
      requestNotifyPermission: () => this.notificationService.requestPermission()
    });

    this.notebookWall.buildFromState(this.state);

    this.interaction = new CalendarInteraction({
      camera,
      renderer,
      getActiveWall: () => this._getActiveWall(),
      isInteractionEnabled: () => this.viewMode !== "notification-wall",
      dayDetailView: this.dayDetailView,
      onNotebookDayClick: (dayId) => this.openDayNotesLayer(dayId),
      onHourClick: (hour) => this._syncHour(hour),
      onCanvasTapEmpty: () => this._handleCanvasTapEmpty()
    });

    this._onResize = () => this._handleViewportResize();
    window.addEventListener("resize", this._onResize, { passive: true });
    this._configureMobilePerformance();
    this._configureMobileControls();
    this.bottomNav = new InklingBottomNav({
      onTab: (tab, meta) => this._handleBottomNavTab(tab, meta)
    });
    // Alerts moved to the top bar (bell next to settings).
    document.getElementById("btn-top-alerts")?.addEventListener("click", () => {
      void this.openAlertsPanel();
    });
    this.layerManager.setBackdropHandler(() => this._closeActiveLayer());
    this._bindStageBackdrop();
    this._bindLayerLauncher();
    this._injectMobileToolbar();
    this._syncMobileToolbarState();
    this._bindNavigation();
    this._updateNavLabels();
    this.notificationService.tick();
    this._registerServiceWorker();
    this._mountInstallPrompt();
    if (this.osShell) this._mountOsShell();
    this._bootAlertsSystem();
    getCosmosBackdrop().mount(document.getElementById("app"));
    this._showWebGLFallbackNoticeIfNeeded();
    this._ensureMinimizeDock();
    this._bindWriterPanelEvents();
    this._bindWordWeaverEvents();
    window.addEventListener("wordweaver:size-change", () => {
      if (this.viewMode === "overview" && !this.panelMode) {
        void this._frameOverviewCamera(false);
      }
    });
    // ▾ collapse control while immersive → close WordWeaver to the idle cosmos
    // surface (same as re-tapping the bottom WordWeaver icon).
    window.addEventListener("wordweaver:request-exit", () => {
      this._closeBottomStage();
    });
    this._bindDetailZoomBack();
    this._bindShellFocus();
    this._syncChromeLayerState();
    this._syncNotebookDockVisibility();
    try {
      this._bootInklingNotebookLayout();
    } catch (err) {
      console.error("[CalendarApp] Inkling layout boot failed", err);
      this.notebookCalendarDock?.remountMini();
    }
    queueMicrotask(() => {
      this.notebookCalendarDock?.remountMini();
      this._saveOverviewBookmark();
    });
    setTimeout(() => {
      this.notebookCalendarDock?.remountMini();
      this._saveOverviewBookmark();
    }, 300);

    this._applyNotificationTheme();

    // Keep Auto theme in sync with system preference.
    try {
      this._themeMql = window.matchMedia?.("(prefers-color-scheme: dark)");
      if (this._themeMql?.addEventListener) {
        this._themeMql.addEventListener("change", () => this._applyNotificationTheme());
      } else if (this._themeMql?.addListener) {
        this._themeMql.addListener(() => this._applyNotificationTheme());
      }
    } catch {
      /* ignore */
    }
  }

  _refreshNotificationUi() {
    this.notificationDropdown.setItems(this.notificationService.getFeed());
    if (this.viewMode === "notification-wall") {
      this.notificationWall.buildFromState(this.state);
    }
    this._applyNotificationTheme();
    this._syncMobileToolbarState();
  }

  _getActiveWall() {
    if (this.viewMode === "notification-wall") return null;
    return this.notebookWall;
  }

  /** Reset fade state so visible walls render at full opacity. */
  _ensureWallsOpaque() {
    if (this.notebookWall.group.visible) {
      this.notebookWall.setGroupOpacity(1);
    }
  }

  _syncPanelsState() {
    this.threadPanel.state = this.state;
    this.notebookWriterPanel.state = this.state;
    this.uiOverlay.state = this.state;
    this.scheduleModal.state = this.state;
    this.appointmentModal.state = this.state;
  }

  _syncHour(hour) {
    const h = String(hour);
    const time = `${h.padStart(2, "0")}:00`;
    if (this.panelMode === "notebook-writer") {
      this.notebookWriterPanel.selectHour(h, false);
      const day = this.selectedDayId ? getDayById(this.state, this.selectedDayId) : null;
      if (day) saveLastView({ date: day.date, time });
    } else if (this.viewMode === "detail") {
      this.dayDetailView.setSelectedHour(h);
    }
    this.uiOverlay.setHour(h, false);
    this.threadPanel.setComposeHour(h);
    this.dayWindow.setSelectedHour(h);
  }

  /** @param {string} dateStr YYYY-MM-DD */
  _resolveDayIdForDate(dateStr) {
    const existing = this.state.days.find((d) => d.date === dateStr);
    if (existing) return existing.id;

    const { year, month } = parseDate(dateStr);
    if (year !== this.state.year || month !== this.state.month) {
      const dayData = extractDayDataByDate(this.state);
      this.state = createCalendarStateFromSaved(year, month, dayData);
      this._syncPanelsState();
      this.notebookWall.buildFromState(this.state, { skipLayout: false });
      persistCalendarState(this.state);
      this._updateNavLabels();
    }
    return this.state.days.find((d) => d.date === dateStr)?.id ?? null;
  }

  _bindWordWeaverEvents() {
    window.addEventListener("wordweaver:node-click", (event) => {
      const { date, time } = event.detail ?? {};
      if (!date) return;
      void (async () => {
        if (time) {
          const hour = String(Number(String(time).split(":")[0]));
          await this.openNotebookDayByDate(date);
          this.focusNotebookHour(hour);
          return;
        }
        await this.openNotebookDayByDate(date);
      })();
    });
  }

  _bindWriterPanelEvents() {
    document.addEventListener("calendar3d-writer-restore", (event) => {
      const { dayId, hour, mode } = event.detail ?? {};
      if (!dayId) return;
      const writerMode =
        mode === "appointments" ? "appointments" : mode === "alarm" ? "alarm" : "notebook";
      void this.openNotebookWriterPanel(dayId, hour ?? "0", writerMode);
    });
  }

  _minimizeWriterPanel() {
    const mode = this.notebookWriterPanel.getMode();
    const dayId = this.notebookWriterPanel.getSavedDayId();
    if (!dayId) return;
    const hour = this.notebookWriterPanel.getSavedHour();
    const dockId =
      mode === "appointments"
        ? "panel-appointment-writer"
        : mode === "alarm"
          ? "panel-alarm-writer"
          : "panel-notebook-writer";
    const label =
      mode === "appointments" ? "Appointments" : mode === "alarm" ? "Alarm" : "Write";

    this._dockMinimizedPanel(dockId, label, () => {
      void this.openNotebookWriterPanel(dayId, hour, mode);
    });

    this.bottomNav?.setActiveTab(null);
    this._showStageBackdrop(false);
    this.panelMode = null;
    this.selectedDayId = null;
    this.viewMode = "overview";
    this.interaction.setMode("overview");
    this.notebookWall.setOverviewDimmed(false);
    this.notebookWall.setSelectedDay(null);
    this.layerManager.closeAll();
    this._setMobileWriterScrollLock(false);
    this._applyNotebookWallVisibility();
    void this._frameOverviewCamera(false);
  }

  _minimizeNotificationWall() {
    this._dockMinimizedPanel("notification-wall", "Notifications", () => {
      void this.enterNotificationWall();
    });
    void this.exitNotificationWall();
  }

  /**
   * @param {{ date: string, time: string, note: string }} payload
   */
  _commitSlotNote(payload) {
    commitSlotNote(this.state, payload.date, payload.time, payload.note);
    persistCalendarState(this.state);
    this.onLocalDataChange();
    this.threadPanel.refresh();
    this._onDataChange();
    if (this.panelMode === "notebook-writer" && this._isInklingNotebookLayout()) {
      this.wordWeaverEmbed?.show(payload.date, payload.time);
      window.dispatchEvent(
        new CustomEvent("eugeneous:note-added", { detail: { y: window.innerHeight * 0.58 } })
      );
    }
  }

  /**
   * @param {{ dayId?: string, date: string, time: string, title: string }} payload
   */
  _commitSlotAppointment(payload) {
    const dayId = payload.dayId ?? this.selectedDayId;
    if (!dayId) return;
    const day = getDayById(this.state, dayId);
    if (!day) return;
    const title = payload.title?.trim();
    if (!title) return;
    const hour = Number(String(payload.time).split(":")[0]);
    const triggerAt = computeTriggerAt(day.date, hour);
    addAppointment(this.state, dayId, {
      title,
      description: "",
      hour,
      triggerAt
    });
    persistCalendarState(this.state);
    this._onDataChange();
  }

  /**
   * @param {{ dayId?: string, appointmentId: string }} payload
   */
  _deleteSlotAppointment(payload) {
    const dayId = payload.dayId ?? this.selectedDayId;
    if (!dayId || !payload.appointmentId) return;
    deleteAppointment(this.state, dayId, payload.appointmentId);
    persistCalendarState(this.state);
    this._onDataChange();
  }

  _onDataChange() {
    this.dayDetailView.refreshHourIndicators();
    this.threadPanel.refresh();
    this.notebookWriterPanel?.refresh();
    this._refreshWalls();
    persistCalendarState(this.state);
    this.onLocalDataChange();
    this.notificationService?.tick();
    // Keep the server-side push schedule in sync with edited/added/removed events.
    schedulePushUpload(() => this.state);
    this.wordWeaverEmbed?.refresh();
  }

  _refreshWalls() {
    this.notebookWall.buildFromState(this.state, { skipLayout: true });
  }

  async closePanels() {
    if (this.panelMode === "notebook-detail") {
      await this._closeNotebookDetail(false);
    }
    if (this.panelMode === "notebook-writer") {
      this.dayWindow.close();
      this.notebookWriterPanel.close();
      this.layerManager.close("writer");
      this.dayDetailView.hide();
      this.notebookWall.setOverviewDimmed(false);
      this.notebookWall.setSelectedDay(null);
      this.panelMode = null;
      this.selectedDayId = null;
      this.viewMode = "overview";
      this.interaction.setMode("overview");
      this._showStageBackdrop(false);
      this.bottomNav?.setActiveTab(null);
      this._applyNotebookWallVisibility();
    }
    if (this.panelMode === "day-notes") {
      this.threadPanel.close();
      this.layerManager.close("day-notes");
      this.notebookWall.setOverviewDimmed(false);
      this.notebookWall.setSelectedDay(null);
      this.panelMode = null;
      this.selectedDayId = null;
      this.viewMode = "overview";
      this.interaction.setMode("overview");
    }
    this._setMobileWriterScrollLock(false);
    this._ensureWallsOpaque();
    this._applyNotebookWallVisibility();
    if (this._isOverviewWallMode()) {
      void this._frameOverviewCamera(false);
    } else if (!this._isInklingNotebookLayout()) {
      await this.resetView();
    }
  }

  /**
   * Full-screen notes thread for a day (from 3D wall or mini calendar).
   * @param {string} dayId
   */
  async openDayNotesLayer(dayId) {
    if (this.monthTransition.isBusy) return;
    await this._closeAllPanelsForSwitch();

    const day = getDayById(this.state, dayId);
    if (!day) return;

    this.selectedDayId = dayId;
    this.panelMode = "day-notes";
    this.viewMode = "panel";
    this.notebookWall.setSelectedDay(dayId);
    this.notebookWall.setOverviewDimmed(true);
    this.notebookCalendarDock?.setDate(day.date);
    this.threadPanel.open(dayId);
    this.layerManager.open("day-notes", { element: this.threadPanel.el });
    this._showStageBackdrop(true);
    this.bottomNav?.setActiveTab(null);
    this.interaction.setMode("overview");
    this._applyNotebookWallVisibility();
  }

  /** @param {string} dateStr YYYY-MM-DD */
  async openDayNotesByDate(dateStr) {
    if (!dateStr) return;
    await this.syncCalendarMonth(dateStr);
    const dayId = this._resolveDayIdForDate(dateStr);
    if (!dayId) return;
    await this.openDayNotesLayer(dayId);
  }

  async enterCalendarMaxLayer() {
    if (this.viewMode === "notification-wall") {
      await this.exitNotificationWall();
    }
    await this._closeAllPanelsForSwitch();
    this._showStageBackdrop(false);
    document.body.classList.add("inkling-layer--calendar-max");
    this.layerManager.open("calendar-max");
    this.notebookWall.setVisible(true);
    this.notebookWall.setOverviewDimmed(false);
    this.notebookWall.overviewWallGroup.scale.set(1.08, 1.08, 1.08);
    this.notebookCalendarDock?.show();
    this.controls.enabled = false;
    await this._frameOverviewCamera(true);
    this.controls.enabled = true;
    this.bottomNav?.setActiveTab("calendar");
    document.body.classList.add("inkling-stage-open", "inkling-tab-calendar");
    beginAppTabSurface("calendar");
  }

  exitCalendarMaxLayer() {
    if (!this.layerManager.isOpen("calendar-max")) return;
    document.body.classList.remove("inkling-layer--calendar-max");
    this.layerManager.close("calendar-max");
    this.notebookWall.overviewWallGroup.scale.set(1, 1, 1);
    this.notebookWall.setVisible(false);
    this.bottomNav?.setActiveTab(null);
    document.body.classList.remove("inkling-stage-open", "inkling-tab-calendar");
    if (
      this.layerManager.isOpen("wordweaver") &&
      this.notebookCalendarDock?.getDate()
    ) {
      this._showWordWeaverPreview(
        this.notebookCalendarDock.getDate(),
        getLastView()?.time ?? "09:00"
      );
    }
  }

  /**
   * Open day timeline on the Notebook Calendar (3D month + writer panel).
   * @param {string} dayId
   * @param {string} [initialHour]
   */
  async openNotebookWriterPanel(dayId, initialHour = "0", writerMode = "notebook") {
    if (this.monthTransition.isBusy) return;
    await this._closeAllPanelsForSwitch();

    const day = getDayById(this.state, dayId);
    if (!day) return;

    this.selectedDayId = dayId;
    this.panelMode = "notebook-writer";
    this.viewMode = "panel";

    if (this._isInklingNotebookLayout()) {
      this.notebookWall.setVisible(true);
      this.notebookWall.setSelectedDay(dayId);
      this.notebookWall.setOverviewDimmed(true);
      this.dayDetailView.hide();
      this.notebookCalendarDock?.setDate(day.date);
      this.notebookWriterPanel.open(dayId, initialHour, writerMode);
      this._syncHour(String(initialHour));
      this.notebookCalendarDock?.show();
      this._setMobileWriterScrollLock(true);
      this.bottomNav?.setActiveTab("writer");
      this.layerManager.open("writer", { element: document.getElementById("notebook-writer-panel") });
      this._showStageBackdrop(true);
      saveLastView({ date: day.date, time: `${String(initialHour).padStart(2, "0")}:00` });
      this._showWordWeaverPreview(day.date, `${String(initialHour).padStart(2, "0")}:00`);
    } else {
      this.notebookWall.setSelectedDay(dayId);
      this.notebookWall.setOverviewDimmed(true);

      const tile = this.notebookWall.getDayTileById(dayId);
      if (tile) {
        const worldPos = new THREE.Vector3();
        tile.getWorldPosition(worldPos);
        const anchor = worldPos.clone();
        anchor.z += 1.4;
        const { month, day: dayNum } = parseDate(day.date);
        const label = `${MONTH_NAMES[month - 1]} ${dayNum} — tap an hour`;
        this.dayDetailView.show(dayId, this.state, anchor, label);
      }

      this.notebookWriterPanel.open(dayId, initialHour, "notebook");
      this.dayWindow.open(dayId, "notebook");
      this._syncHour(String(initialHour));
      this.notebookCalendarDock?.show();
    }

    this.interaction.setMode("writer");
    this.interaction.setActiveWallType("notebook");
    this._applyNotebookWallVisibility();
  }

  async enterNotebookDetail(dayId) {
    if (this.viewMode === "detail" || this.cameraController.isAnimating) return;
    await this._closeAllPanelsForSwitch();

    const day = getDayById(this.state, dayId);
    if (!day) return;

    const tile = this.notebookWall.getDayTileById(dayId);
    if (!tile) return;

    this.selectedDayId = dayId;
    this.viewMode = "detail";
    this.panelMode = "notebook-detail";
    this.interaction.setMode("detail");

    this.notebookWall.setSelectedDay(dayId);
    this.notebookWall.setOverviewDimmed(true);

    const worldPos = new THREE.Vector3();
    tile.getWorldPosition(worldPos);

    const { month, day: dayNum } = parseDate(day.date);
    const label = `${MONTH_NAMES[month - 1]} ${dayNum} — select an hour`;

    const anchor = worldPos.clone();
    anchor.z += 1.4;

    this.dayDetailView.show(dayId, this.state, anchor, label);
    this.threadPanel.open(dayId);
    this.uiOverlay.open(dayId, "0");
    this._syncHour("0");
    this.dayWindow.setSelectedHour("0");
    this.dayWindow.open(dayId, "notebook");

    document.body.classList.add("detail-mode");
    this._syncChromeLayerState();

    this._overviewCameraBookmark = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone()
    };

    const focus = this.dayDetailView.getAttentionWorldCenter();

    this.controls.enabled = false;
    await this.cameraController.zoomToDay(focus, new THREE.Vector3(0, 0.35, 6.2));
    this.controls.enabled = true;
  }

  async _closeNotebookDetail(zoomOut = true) {
    this.dayWindow.close();
    this.uiOverlay.close();
    this.threadPanel.close();
    this.dayDetailView.hide();
    this.notebookWall.setSelectedDay(null);
    this.notebookWall.setOverviewDimmed(false);
    document.body.classList.remove("detail-mode");
    this._syncChromeLayerState();

    if (zoomOut && this.viewMode === "detail") {
      this.controls.enabled = false;
      if (this._isInklingNotebookLayout()) {
        void this._frameOverviewCamera(true);
      } else {
        await this.resetView();
      }
      this.controls.enabled = true;
    }

    this._overviewCameraBookmark = null;
    this.viewMode = "overview";
    this.panelMode = null;
    this.selectedDayId = null;
    this.interaction.setMode("overview");
  }

  _bindShellFocus() {
    document.addEventListener("eugeneous:focus-calendar", async (event) => {
      const wall = event.detail?.wall ?? "notebook";
      const date = event.detail?.date;
      if (date && wall === "notebook") {
        await this.focusNotebookCalendarMonth(date);
        this.notebookCalendarDock?.setDate(date);
        return;
      }
      await this.focusMainCalendar(wall);
    });
  }

  /**
   * OS shell: focus the main 3D calendar (single canvas — not a separate window app).
   * @param {"notebook"|"appointments"} [wall]
   */
  _captureInitialView() {
    this._initialView = {
      cameraPosition: this.camera.position.clone(),
      controlsTarget: this.controls.target.clone(),
      scrollY: window.scrollY
    };
  }

  /**
   * Restore startup camera / scroll (used when closing day panels or OS windows).
   */
  async resetView() {
    if (this._isInklingNotebookLayout()) {
      void this._frameOverviewCamera(false);
      return;
    }
    if (!this._initialView) return;
    await this.cameraController.restoreCamera(
      this._initialView.cameraPosition,
      this._initialView.controlsTarget
    );
    window.scrollTo(0, this._initialView.scrollY);
  }

  _getTodayDayId() {
    const todayDay = this.state.days.find((d) => isToday(d.date));
    return todayDay?.id ?? this.state.days[0]?.id ?? null;
  }

  _getTodayDate() {
    const todayDay = this.state.days.find((d) => isToday(d.date));
    return todayDay?.date ?? null;
  }

  /**
   * Focus Notebook Calendar (3D month + dock). Optional floating app panel via useAppPanel / useOsWindow.
   * @param {{ initialView?: "today"|string, dayId?: string, useAppPanel?: boolean, useOsWindow?: boolean }} [opts]
   */
  async openNotebookCalendar(opts = {}) {
    const initialView = opts.initialView ?? "today";
    let dayId = opts.dayId;
    if (!dayId && initialView === "today") {
      dayId = this._getTodayDayId();
    }

    const date = initialView === "today" ? this._getTodayDate() : initialView;
    if (date) this.notebookCalendarDock?.setDate(date);
    this.notebookCalendarDock?.show();

    const openAppPanel = opts.useAppPanel ?? opts.useOsWindow;
    if (openAppPanel && this.osShell && this.windowManager) {
      await this.windowManager.openApp("notebook-calendar", {
        initialView: date ?? "today",
        dayId
      });
    }

    if (dayId) {
      await this.openNotebookWriterPanel(dayId);
    } else {
      await this.focusMainCalendar();
    }
  }

  /** Sync loaded month state for a date (no 3D camera fly-in on Inkling layout). */
  async syncCalendarMonth(dateStr) {
    if (!dateStr) return;
    const { year, month } = parseDate(dateStr);
    if (year !== this.state.year || month !== this.state.month) {
      const delta = (year - this.state.year) * 12 + (month - this.state.month);
      if (this.viewMode === "overview" && !this.panelMode) {
        await this.goToMonth(delta);
      } else {
        const dayData = extractDayDataByDate(this.state);
        this.state = createCalendarStateFromSaved(year, month, dayData);
        this._syncPanelsState();
        this.notebookWall.buildFromState(this.state, { skipLayout: false });
        persistCalendarState(this.state);
        this._updateNavLabels();
        if (this.activeWall === "notebook") {
          void this._frameOverviewCamera(false);
        }
      }
    }
    this.notebookCalendarDock?.setDate(dateStr);
  }

  /** Focus 3D month for a date without opening the writer. */
  async focusNotebookCalendarMonth(dateStr) {
    if (!dateStr) return;
    await this.syncCalendarMonth(dateStr);
    if (this._isInklingNotebookLayout()) {
      return;
    }
    await this.focusMainCalendar();
    this.notebookCalendarDock?.setDate(dateStr);
  }

  async openNotebookDayByDate(dateStr) {
    if (!dateStr) return;
    await this.syncCalendarMonth(dateStr);
    const dayId = this._resolveDayIdForDate(dateStr);
    if (!dayId) {
      console.warn("[CalendarApp] Write: no day node for", dateStr);
      return;
    }
    const last = getLastView();
    const lastTime = last?.date === dateStr && last?.time ? last.time : "00:00";
    const hour = String(Number(lastTime.split(":")[0]));
    await this.openNotebookWriterPanel(dayId, hour);
  }

  openWordWeaverFromRail() {
    const date = this.notebookCalendarDock?.getDate() ?? this._getTodayDate();
    if (!date) return;
    const time = getLastView()?.time ?? "09:00";
    this._showWordWeaverPreview(date, time);
  }

  /** Inkling split layout (small calendar + 3D wall + writer). Stays on during notification wall. */
  _isInklingNotebookLayout() {
    return document.body.classList.contains("inkling-notebook-layout");
  }

  _isOverviewWallMode() {
    return this.viewMode !== "notification-wall";
  }

  _bootInklingNotebookLayout() {
    document.body.classList.add("inkling-notebook-layout");
    document.documentElement.style.setProperty("--calendar-sidebar-w", "220px");

    try {
      localStorage.removeItem("inkling:sidebarCollapsed");
    } catch {
      /* ignore */
    }

    document.getElementById("top-chrome")?.classList.remove("hidden", "is-hidden");
    document.getElementById("calendar-sidebar")?.classList.remove("hidden", "is-collapsed");
    document.getElementById("calendar-sidebar")?.classList.add("is-expanded");

    this.notebookCalendarDock?.show();
    if (typeof this.notebookCalendarDock?.resetPanelPosition === "function") {
      this.notebookCalendarDock.resetPanelPosition();
    }
    this.notebookCalendarDock?.expand(false);
    requestAnimationFrame(() => {
      this.notebookCalendarDock?.remountMini();
    });

    this.notebookWall.setVisible(false);
    this.notebookWall.setOverviewDimmed(true);
    this.notebookWall.setSelectedDay(null);

    this._applyNotebookWallVisibility();

    this.bottomNav?.show();

    const startTab = new URLSearchParams(window.location.search).get("tab");
    const allowedTabs = new Set(["calendar", "writer", "wordweaver", "inkling", "alerts", "alarm", "mind", "connections", "goals"]);
    if (allowedTabs.has(startTab)) {
      // Deep-linked (e.g. the ?tab=wordweaver share link) → go straight there.
      queueMicrotask(() => void this._handleBottomNavTab(startTab, { toggle: false }));
    } else {
      // Default: land on the cosmos intro and let the user choose where to start.
      queueMicrotask(() => void this._showCosmosIntro());
    }
  }

  /** Open the Alarm Clock (analog clock + alarm / stopwatch / timer). */
  async openAlarmClock() {
    if (!this._alarmClock) {
      const { AlarmClock } = await import("./ui/AlarmClock.js");
      this._alarmClock = new AlarmClock(this);
    }
    this._alarmClock.show();
  }

  /** Land on the cosmos backdrop with the entry-portal intro. */
  async _showCosmosIntro() {
    this.windowManager?.closeAllPanels();
    showIdleSurface(); // JWST cosmos backdrop
    if (!this._cosmosIntro) {
      const { CosmosIntro } = await import("./ui/CosmosIntro.js");
      this._cosmosIntro = new CosmosIntro(this);
    }
    this._cosmosIntro.show();
  }

  /** Default launch: WordWeaver first — Inkling does not auto-open. */
  _openWordWeaverStartup() {
    this.windowManager?.closeAllPanels();
    void this._handleBottomNavTab("wordweaver", { toggle: false });
  }

  _bindStageBackdrop() {
    document.getElementById("inkling-stage-backdrop")?.addEventListener("click", () => {
      this._closeBottomStage();
    });
  }

  _showStageBackdrop(show) {
    const backdrop = document.getElementById("inkling-stage-backdrop");
    backdrop?.classList.toggle("hidden", !show);
    backdrop?.setAttribute("aria-hidden", String(!show));
    document.body.classList.toggle("inkling-stage-backdrop-on", show);
  }

  _clearBottomTabClasses() {
    document.body.classList.remove(
      "inkling-tab-calendar",
      "inkling-tab-writer",
      "inkling-tab-wordweaver",
      "inkling-tab-inkling",
      "inkling-tab-alerts"
    );
  }

  _bootAlertsSystem() {
    this.alertsPanel = new AlertsPanel({
      windowManager: this.windowManager ?? null,
      onClose: () => {
        this.bottomNav?.setActiveTab(null);
        document.body.classList.remove("alerts-panel-open", "inkling-tab-alerts");
      }
    });
    mountAlertsNavigation({ onOpenAlerts: () => void this.openAlertsPanel() });
    initAlertsUi();
    startAlertsScheduler();
    syncAlertsBadge();
  }

  async openAlertsPanel() {
    if (this.viewMode === "notification-wall") {
      await this.exitNotificationWall();
    }
    // Inkling's colour-coded alerts panel (right-edge slide-in) — used by the
    // top-bar bell / orb. The Alerts nav tab opens it full-screen instead.
    this.inklingPanel?.alerts?.show();
  }

  _closeBottomStage() {
    this.exitCalendarMaxLayer();
    this._clearBottomTabClasses();
    this._showStageBackdrop(false);
    this.layerManager.closeAll();
    this.notebookWriterPanel.close();
    this.threadPanel.close();
    this.inklingPanel.minimize();
    this.wordWeaverEmbed?.exitImmersive();
    this.wordWeaverEmbed?.hide();
    this.alertsPanel?.close();
    this.inklingPanel?.alerts?.hide({ silent: true });
    this.inklingPanel?._connMap?.hide?.({ silent: true });
    this.inklingPanel?._goals?.hide?.({ silent: true });
    this.inklingPanel?._mindPanel?.hide?.({ silent: true });
    closeAlertsDropdown();
    this.windowManager?.closeAllPanels();
    document.dispatchEvent(new CustomEvent("inkling:close-all-panels"));
    if (this.panelMode === "notebook-writer" || this.panelMode === "day-notes") {
      this.notebookWriterPanel.close();
      this.threadPanel.close();
      this.panelMode = null;
      this.selectedDayId = null;
      this.notebookWall.setOverviewDimmed(false);
      this._setMobileWriterScrollLock(false);
    }
    void this._frameOverviewCamera(false);
    this.bottomNav?.setActiveTab(null);
    showIdleSurface();
  }

  _showWebGLFallbackNoticeIfNeeded() {
    if (!consumeWebGLFallbackNotice()) return;
    let el = document.getElementById("inkling-webgl-notice");
    if (!el) {
      el = document.createElement("p");
      el.id = "inkling-webgl-notice";
      el.className = "inkling-webgl-notice";
      el.setAttribute("role", "status");
      el.textContent =
        "3D view needs WebGL, which is not available here. Switched to 2D mode.";
      document.getElementById("ui-overlay")?.appendChild(el);
    }
    el.classList.remove("hidden");
    setTimeout(() => el?.classList.add("hidden"), 12_000);
  }

  _closeActiveLayer() {
    if (this.layerManager.isOpen("calendar-max")) {
      this.exitCalendarMaxLayer();
      return;
    }
    if (this.panelMode === "day-notes") {
      void this.closePanels();
      return;
    }
    if (this.panelMode === "notebook-writer") {
      void this.closePanels();
      return;
    }
    this._closeBottomStage();
  }

  _bindLayerLauncher() {
    document.getElementById("inkling-layer-launcher")?.querySelectorAll("[data-layer]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const layer = btn.getAttribute("data-layer");
        if (!layer) return;
        void this._openLayerFromLauncher(layer);
      });
    });
  }

  async _openLayerFromLauncher(layer) {
    const date = this.notebookCalendarDock?.getDate() ?? this._getTodayDate();
    switch (layer) {
      case "calendar-max":
        if (this.layerManager.isOpen("calendar-max")) this.exitCalendarMaxLayer();
        else await this.enterCalendarMaxLayer();
        break;
      case "writer":
        if (date) await this.openNotebookDayByDate(date);
        break;
      case "wordweaver":
        void this._handleBottomNavTab("wordweaver", { toggle: this.bottomNav?.getActiveTab() === "wordweaver" });
        break;
      case "inkling":
        void this._handleBottomNavTab("inkling", { toggle: this.bottomNav?.getActiveTab() === "inkling" });
        break;
      default:
        break;
    }
  }

  /**
   * @param {string} tab
   * @param {{ toggle: boolean }} meta
   */
  async _handleBottomNavTab(tab, meta) {
    // Dismiss the "where would you like to start" cosmos intro — the bottom nav
    // now floats above it, so tapping a tab must close the intro or the surface
    // would open hidden behind it.
    this._cosmosIntro?.hide();

    if (meta.toggle) {
      this._closeBottomStage();
      return;
    }

    this.windowManager?.closeAllPanels();
    document.dispatchEvent(new CustomEvent("inkling:close-all-panels"));

    if (tab !== "alerts") {
      this.alertsPanel?.close();
      closeAlertsDropdown();
    }

    if (this.viewMode === "notification-wall") {
      await this.exitNotificationWall();
    }

    await this._closeAllPanelsForSwitch();
    this.notebookWriterPanel.close();
    this.threadPanel.close();
    this.inklingPanel.minimize();
    this.inklingPanel?._connMap?.hide?.({ silent: true });
    this.inklingPanel?._goals?.hide?.({ silent: true });
    this.inklingPanel?._mindPanel?.hide?.({ silent: true });
    this.wordWeaverEmbed?.exitImmersive();
    this.wordWeaverEmbed?.hide();
    this._weaverGalaxy?.hide();
    this._cal2dDay?.close();
    this.layerManager.close("wordweaver");

    beginAppTabSurface(tab);
    this.bottomNav?.setActiveTab(tab);

    const date = this.notebookCalendarDock?.getDate() ?? this._getTodayDate();
    const time = getLastView()?.time ?? "09:00";

    switch (tab) {
      case "calendar":
        this._showStageBackdrop(false);
        document.body.classList.add("inkling-stage-open");
        await this.enterCalendarMaxLayer();
        break;
      case "writer":
        document.body.classList.add("inkling-stage-open");
        await this._openScheduleDay(date);
        break;
      case "wordweaver":
        this.notebookWall.setVisible(false);
        document.body.classList.add("inkling-stage-open", "wordweaver-embed-open");
        this._showStageBackdrop(false);
        this.layerManager.open("wordweaver");
        this.wordWeaverEmbed?.enterImmersive();
        break;
      case "inkling": {
        this.notebookWall.setVisible(false);
        document.body.classList.add("inkling-stage-open");
        this._showStageBackdrop(true);
        this.layerManager.open("inkling");
        document.getElementById("inkling-fab")?.classList.add("hidden");
        this.inklingPanel.expand();
        break;
      }
      case "alerts":
        document.body.classList.add("inkling-stage-open");
        this._showStageBackdrop(true);
        if (this.viewMode === "notification-wall") await this.exitNotificationWall();
        // Full-screen Alerts surface; ✕ tears the nav stage back down.
        this.inklingPanel?.alerts?.show({ full: true, onClose: () => this._closeBottomStage() });
        break;
      case "alarm":
        document.body.classList.add("inkling-stage-open");
        this._showStageBackdrop(true);
        await this.openAlarmClock();
        break;
      case "mind":
      case "connections": // back-compat alias — "Connect" tab is now "Mind"
        document.body.classList.add("inkling-stage-open");
        this._showStageBackdrop(true);
        // The live knowledge graph + Inkling's read; ✕ tears the nav stage down.
        this.inklingPanel?.showMind({ onClose: () => this._closeBottomStage() });
        break;
      case "goals":
        document.body.classList.add("inkling-stage-open");
        this._showStageBackdrop(true);
        this.inklingPanel?.showGoals({ onClose: () => this._closeBottomStage() });
        break;
      default:
        break;
    }
  }

  /**
   * Inkling "take me to <date>" → open that day in the Schedule.
   * (The WordWeaver galaxy was retired; the Schedule is the day surface now.)
   * Method name kept for existing callers.
   */
  async navigateToWordWeaverDate(iso) {
    await this._handleBottomNavTab("writer", { toggle: false });
    const cal = this._cal2dDay;
    if (cal && iso) { cal.iso = iso; cal.setView?.("day"); }
  }

  /** Schedule tab = the 2D day-view editor (Google-style). Lazy-loaded. */
  async _openScheduleDay(date) {
    if (!this._cal2dDay) {
      const { Calendar2DDay } = await import("./ui/Calendar2DDay.js");
      this._cal2dDay = new Calendar2DDay();
    }
    this._cal2dDay.open(date ?? this._getTodayDate?.() ?? new Date().toISOString().slice(0, 10));
    // Prompt for notification permission (on this tab-open gesture) so timed
    // reminders can actually fire.
    try {
      if ("Notification" in window && Notification.permission === "default") {
        this.notificationService?.requestPermission?.();
      }
    } catch { /* ignore */ }
  }

  _showWordWeaverPreview(dateStr, time) {
    this.wordWeaverEmbed?.show(dateStr, time);
  }

  _hideWordWeaverPreview() {
    this.wordWeaverEmbed?.hide();
  }

  _applyNotebookWallVisibility() {
    const inklingLayout = this._isInklingNotebookLayout();
    if (inklingLayout || this.viewMode === "notification-wall") {
      document.body.classList.add("inkling-notebook-layout");
    }
    document.getElementById("calendar-nav")?.classList.remove("is-hidden");
    document.getElementById("top-chrome")?.classList.remove("is-hidden");

    if (this.viewMode === "notification-wall") return;

    const showNotebookWall = this.layerManager.isOpen("calendar-max");
    this.notebookWall.setVisible(showNotebookWall);
    if (
      inklingLayout &&
      this.layerManager.isOpen("wordweaver") &&
      !this.layerManager.isOpen("calendar-max")
    ) {
      this._showWordWeaverPreview(
        this.notebookCalendarDock?.getDate() ?? this._getTodayDate(),
        getLastView()?.time ?? "09:00"
      );
    }
    if (this.panelMode === "notebook-writer" && this.selectedDayId) {
      const day = getDayById(this.state, this.selectedDayId);
      if (day) {
        this._showWordWeaverPreview(day.date, getLastView()?.time ?? "09:00");
      }
    }
    if (inklingLayout && this.viewMode === "overview" && !this.panelMode && !this.layerManager.isOpen("calendar-max")) {
      void this._frameOverviewCamera(false);
    }

    this._ensureWallsOpaque();
  }

  focusNotebookHour(hour) {
    this._syncHour(String(hour));
    if (this.panelMode === "notebook-writer") {
      this.notebookWriterPanel.selectHour(String(hour), false);
    } else if (this.viewMode === "detail") {
      this.dayDetailView.pulseHour(String(hour));
    }
  }

  _dockMinimizedPanel(id, title, restoreFn) {
    const dock = this._getMinimizeDock();
    dock.addWindow(id, {
      title,
      onRestore: () => {
        dock.removeWindow(id);
        restoreFn();
        this._syncChromeLayerState();
      }
    });
    this._syncChromeLayerState();
  }

  _ensureMinimizeDock() {
    const dock = this._getMinimizeDock();
    const host = document.getElementById("app");
    if (host && !host.contains(dock.el)) {
      dock.mount(host);
    }
    if (!dock._chromeBound) {
      dock._chromeBound = true;
      dock.onChange = () => this._syncChromeLayerState();
      document.addEventListener("calendar3d-chrome-change", () => this._syncChromeLayerState());
    }
  }

  _getMinimizeDock() {
    if (this.windowManager?.minimizeDock) {
      return this.windowManager.minimizeDock;
    }
    if (!this._fallbackMinimizeDock) {
      this._fallbackMinimizeDock = new MinimizeDock();
      this._fallbackMinimizeDock.mount(document.getElementById("app"));
    }
    return this._fallbackMinimizeDock;
  }

  _syncChromeLayerState() {
    const dock = this._getMinimizeDock();
    document.body.classList.toggle("has-minimized-dock", dock.hasWindows());
  }

  _syncNotebookDockVisibility() {
    if (this.viewMode === "notification-wall") {
      this.notebookCalendarDock?.show();
      return;
    }
    this.notebookCalendarDock?.show();
    this.notebookCalendarDock?.remountMini();
  }

  async focusMainCalendar() {
    if (this.viewMode === "notification-wall") {
      await this.exitNotificationWall();
    }
    await this._closeAllPanelsForSwitch();
    this.controls.enabled = false;
    await this._frameOverviewCamera(true);
    this.controls.enabled = true;
  }

  _bindDetailZoomBack() {
    this._onDetailWheel = (event) => {
      if (this.viewMode !== "detail" || this.cameraController.isAnimating) return;
      if (event.deltaY > 0) {
        event.preventDefault();
        this._closeNotebookDetail(true);
      }
    };
    this.renderer.domElement.addEventListener("wheel", this._onDetailWheel, { passive: false });
  }

  async _closeAllPanelsForSwitch() {
    if (this.panelMode === "notebook-detail") {
      await this._closeNotebookDetail(true);
    }
    if (this.panelMode === "notebook-writer") {
      this.dayWindow.close();
      this.notebookWriterPanel.close();
      this.dayDetailView.hide();
      this.notebookWall.setOverviewDimmed(false);
      this.notebookWall.setSelectedDay(null);
    }
    if (this.panelMode === "day-notes") {
      this.threadPanel.close();
      this.layerManager.close("day-notes");
      this.notebookWall.setOverviewDimmed(false);
      this.notebookWall.setSelectedDay(null);
    }
    this.panelMode = null;
    this.selectedDayId = null;
    this.viewMode = "overview";
    this.interaction.setMode("overview");
    document.body.classList.remove(
      "notebook-writer-panel-open",
      "appointment-writer-panel-open"
    );
    if (
      document.body.dataset.panelOpen === "notebook-writer" ||
      document.body.dataset.panelOpen === "appointment-writer"
    ) {
      delete document.body.dataset.panelOpen;
    }
  }

  _openSchedule(mode, dayId) {
    const day = getDayById(this.state, dayId);
    if (!day) return;
    this.scheduleModal.open(mode, dayId, day.date);
  }

  _openAppointmentModal(dayId, existing = null) {
    const day = getDayById(this.state, dayId);
    if (!day) return;
    this.appointmentModal.open(dayId, day.date, existing);
  }

  _overviewCameraOffset() {
    const bounds = this._getActiveWall().getGridBounds();
    const mobile = window.innerWidth <= 768;
    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    const calendarMax = this.layerManager.isOpen("calendar-max");

    // Pull back far enough that the WHOLE month grid fits in the frustum (with a
    // little padding) — the old span×multiplier heuristic bottomed out too close,
    // so you couldn't see every month at startup. Fit both width and height.
    const vfov = ((this.camera.fov ?? 52) * Math.PI) / 180;
    const tanV = Math.tan(vfov / 2);
    const margin = mobile || aspect < 1 ? 1.32 : 1.16;
    const fitH = bounds.height / 2 / tanV;
    const fitW = bounds.width / 2 / (tanV * aspect);
    const distanceMin = calendarMax ? (mobile ? 13 : 11) : mobile || aspect < 1 ? 16 : 13;
    const distance = Math.max(distanceMin, Math.max(fitH, fitW) * margin);
    const y = mobile || aspect < 1 ? 1.6 : calendarMax ? 0.95 : 1.2;
    return new THREE.Vector3(0, y, distance);
  }

  _updateWallToggleUI() {
    this._syncChromeLayerState();
  }

  async switchWall(target) {
    if (target !== "notebook") return;
    this.activeWall = "notebook";
    this._applyNotebookWallVisibility();
    this._syncMobileToolbarState();
  }

  async enterNotificationWall() {
    if (this.viewMode === "notification-wall") return;
    await this._closeAllPanelsForSwitch();

    this._wallBeforeNotification = this.activeWall;
    this.viewMode = "notification-wall";
    this.panelMode = null;
    this.interaction.setMode("notification");

    this.notebookWall.setVisible(false);
    this.notificationService.tick();
    this.notificationService.setFastTick(true);

    document.body.classList.add("inkling-notebook-layout", "inkling-notification-wall");
    this.notificationWall.buildFromState(this.state);
    this.notificationWall.setVisible(true);
    this.notebookCalendarDock?.show();

    this.controls.enabled = false;
    const center = this.notificationWall.getCenterTarget();
    const offset = this._notificationWallCameraOffset();
    await this.cameraController.zoomToOverview(center, offset);
    this.controls.target.copy(center);
    this.controls.enabled = true;
    this.controls.update();
    this._syncMobileToolbarState();
  }

  async exitNotificationWall() {
    if (this.viewMode !== "notification-wall") return;

    this.notificationService.setFastTick(false);
    this.notificationWall.setVisible(false);
    this.viewMode = "overview";
    this.interaction.setMode("overview");
    document.body.classList.remove("inkling-notification-wall");

    this._updateWallToggleUI();

    this.activeWall = "notebook";
    this.notebookWall.setVisible(true);
    this.interaction.setActiveWallType("notebook");
    this._applyNotebookWallVisibility();
    this._syncNotebookDockVisibility();

    this.controls.enabled = false;
    await this._frameOverviewCamera(true);
    this.controls.enabled = true;
    this._syncMobileToolbarState();
  }

  _notificationWallCameraOffset() {
    const bounds = this.notificationWall.getGridBounds();
    const span = Math.max(bounds.width, bounds.height);
    const mobile = window.innerWidth <= 768;
    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    const distance = Math.max(mobile || aspect < 1 ? 15 : 12, span * (mobile || aspect < 1 ? 1.7 : 1.35));
    const y = mobile || aspect < 1 ? 1.6 : 1.2;
    return new THREE.Vector3(0, y, distance);
  }

  /**
   * Navigate from notification click — correct wall, day, panel, hour.
   * @param {{ dayId: string, hour?: number, wall?: string, type?: string }} target
   */
  async navigateFromNotification(target) {
    const day = getDayById(this.state, target.dayId);
    if (!day) return;

    if (this.viewMode === "notification-wall") {
      await this.exitNotificationWall();
    } else {
      await this._closeAllPanelsForSwitch();
    }

    await this._ensureMonthForDay(day);

    const hour = target.hour != null ? String(target.hour) : null;
    const writerMode = target.type === "appointment" ? "appointments" : "notebook";
    await this.openNotebookWriterPanel(target.dayId, hour ?? "0", writerMode);
  }

  async _ensureMonthForDay(day) {
    const { year, month } = parseDate(day.date);
    if (year === this.state.year && month === this.state.month) return;
    const delta = (year - this.state.year) * 12 + (month - this.state.month);
    await this.goToMonth(delta);
  }

  _bindNavigation() {
    document.getElementById("calendar-prev")?.addEventListener("click", () => {
      if (this.viewMode !== "overview" || this.panelMode) return;
      this.goToMonth(-1);
    });
    document.getElementById("calendar-next")?.addEventListener("click", () => {
      if (this.viewMode !== "overview" || this.panelMode) return;
      this.goToMonth(1);
    });

    document.getElementById("btn-notify-permission")?.addEventListener("click", async () => {
      const result = await this.notificationService.requestPermission();
      const el = document.getElementById("notify-status");
      if (el) {
        el.textContent =
          result === "granted"
            ? "Browser alerts enabled"
            : result === "denied"
              ? "Notifications blocked in browser settings"
              : "Notifications not available";
      }
    });
  }

  _updateNavLabels() {
    const label = document.getElementById("calendar-nav-month");
    if (label) label.textContent = getMonthLabel(this.state);
  }

  async goToMonth(delta) {
    if (this.monthTransition.isBusy || this.viewMode === "notification-wall") return;
    if (this.viewMode !== "overview" || this.panelMode) return;

    const dayData = extractDayDataByDate(this.state);
    const { year, month } = addMonths(this.state.year, this.state.month, delta);
    const newState = createCalendarStateFromSaved(year, month, dayData);

    const activeWall = this._getActiveWall();

    await this.monthTransition.transition(
      newState,
      (state) => {
        this.state = state;
        this._syncPanelsState();
        this.notebookWall.buildFromState(this.state, { skipLayout: false });
        void this._frameOverviewCamera(true);
        persistCalendarState(this.state);
        this._updateNavLabels();
      },
      delta,
      activeWall
    );
  }

  _saveOverviewBookmark() {
    this._overviewCameraBookmark = {
      cameraPosition: this.camera?.position.clone() ?? null,
      cameraTarget: this.controls?.target.clone() ?? null,
      timestamp: Date.now()
    };
  }

  _restoreOverviewBookmark() {
    const b = this._overviewCameraBookmark;
    if (!b) return;

    if (b.cameraPosition && this.camera) {
      this.camera.position.copy(b.cameraPosition);
    }

    if (b.cameraTarget && this.controls) {
      this.controls.target.copy(b.cameraTarget);
      this.controls.update();
    }
  }

  _frameOverviewCamera(animate) {
    const wall = this._getActiveWall();
    if (!wall) return;
    const center = wall.getCenterTarget();
    const offset = this._overviewCameraOffset();
    const desired = center.clone().add(offset);

    if (!animate) {
      this.camera.position.copy(desired);
      this.controls.target.copy(center);
      this.controls.update();
      this._saveOverviewBookmark();
      return;
    }

    return this.cameraController.zoomToOverview(center, offset).then(() => {
      this._saveOverviewBookmark();
    });
  }

  _handleViewportResize() {
    const wasMobile = this._isMobileViewport;
    this._isMobileViewport = window.innerWidth <= 768;
    if (wasMobile !== this._isMobileViewport) {
      this._configureMobileControls();
      this._configureMobilePerformance();
      this._syncMobileToolbarState();
    }

    // Keep month wall fully framed on small screens and after rotation.
    if (this.viewMode !== "overview" || this.panelMode || this.viewMode === "notification-wall") {
      return;
    }
    void this._frameOverviewCamera(false);
  }

  _handleCanvasTapEmpty() {

    // Mobile-first: outside tap closes open overlays before interacting further.
    if (!this._isMobileViewport) return;

    const dropdownMenu = document.getElementById("notification-dropdown-menu");
    dropdownMenu?.classList.add("hidden");
    const bell = document.getElementById("btn-notification-bell");
    bell?.setAttribute("aria-expanded", "false");

    document.querySelectorAll(".appointment-action-dropdown").forEach((el) => {
      el.classList.add("hidden");
      el.setAttribute("aria-hidden", "true");
    });

    if (this.viewMode === "notification-wall") {
      this.exitNotificationWall();
      return;
    }
    if (this.panelMode === "day-notes" || this.panelMode === "notebook-detail") {
      this.closePanels();
      return;
    }
    this.notificationSettings?.close?.();
  }

  _setMobileWriterScrollLock(active) {
    this._setWriterScrollLock(active);
  }

  /** Block 3D orbit zoom while Writer is open so the mouse wheel scrolls the timeline. */
  _setWriterScrollLock(active) {
    document.body.classList.toggle("inkling-writer-scroll-lock", Boolean(active));
    if (!this.controls) return;
    if (active) {
      this.controls.enabled = false;
    } else if (
      this.panelMode !== "notebook-writer" &&
      this.panelMode !== "day-notes" &&
      this.viewMode !== "detail"
    ) {
      this.controls.enabled = true;
    }
  }

  _configureMobileControls() {
    if (!this.controls) return;
    const mobile = this._isMobileViewport;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = mobile ? 0.13 : 0.08;
    this.controls.rotateSpeed = mobile ? 0.62 : 1.0;
    this.controls.zoomSpeed = mobile ? 0.85 : 1.0;
    this.controls.maxPolarAngle = mobile ? Math.PI * 0.55 : Math.PI * 0.62;
    this.controls.minPolarAngle = mobile ? Math.PI * 0.38 : Math.PI * 0.3;
    this.controls.update();
  }

  _configureMobilePerformance() {
    const mobile = this._isMobileViewport;

    // Best-effort render tuning on low-power devices.
    if (this.renderer?.shadowMap) {
      this.renderer.shadowMap.autoUpdate = !mobile;
      this.renderer.shadowMap.needsUpdate = true;
    }

    // Lower shadow-map size for shadow-casting lights.
    try {
      this.scene.traverse((obj) => {
        if (!obj?.isLight || !obj.shadow?.mapSize) return;
        if (!obj.castShadow) return;
        const size = mobile ? 512 : 1024;
        obj.shadow.mapSize.set(size, size);
        obj.shadow.needsUpdate = true;
      });
    } catch {
      /* ignore */
    }

    // Optional post-processing bloom pass if exposed via scene userData.
    const bloom = this.scene?.userData?.bloomPass;
    if (bloom && typeof bloom.strength === "number") {
      bloom.strength = mobile ? Math.min(bloom.strength, 0.45) : Math.max(bloom.strength, 0.6);
    }

    // Reduce transition durations if controllers expose duration-like fields.
    const fastMs = mobile ? 320 : 520;
    for (const ctrl of [this.cameraController, this.monthTransition, this.wallTransition]) {
      if (!ctrl) continue;
      for (const key of ["durationMs", "transitionMs", "duration", "animationDurationMs"]) {
        if (key in ctrl && typeof ctrl[key] === "number") {
          ctrl[key] = fastMs;
        }
      }
    }
  }

  _injectMobileToolbar() {
    if (this._mobileToolbarEl) return;
    const host = document.getElementById("ui-overlay");
    if (!host) return;

    const bar = document.createElement("nav");
    bar.className = "mobile-bottom-toolbar";
    bar.setAttribute("aria-label", "Mobile quick actions");
    bar.innerHTML = `
      <button type="button" class="mobile-toolbar-btn" data-action="wordweaver">${iconDay}<span>WordWeaver</span></button>
      <button type="button" class="mobile-toolbar-btn" data-action="writer">${iconHour}<span>Writer</span></button>
      <button type="button" class="mobile-toolbar-btn" data-action="notifications">${iconBell}<span>Notifications</span></button>
      <button type="button" class="mobile-toolbar-btn" data-action="settings">${iconSettings}<span>Settings</span></button>
    `;

    bar.querySelector('[data-action="wordweaver"]')?.addEventListener("click", async () => {
      if (!this._isMobileViewport) return;
      if (this.viewMode === "notification-wall") await this.exitNotificationWall();
      void this._handleBottomNavTab("wordweaver", { toggle: false });
    });
    bar.querySelector('[data-action="writer"]')?.addEventListener("click", async () => {
      if (!this._isMobileViewport) return;
      if (this.viewMode === "notification-wall") await this.exitNotificationWall();
      const date = this.notebookCalendarDock?.getDate() ?? this._getTodayDate();
      if (date) await this.openNotebookDayByDate(date);
    });
    bar.querySelector('[data-action="notifications"]')?.addEventListener("click", async () => {
      if (!this._isMobileViewport) return;
      if (this.viewMode === "notification-wall") await this.exitNotificationWall();
      else await this.enterNotificationWall();
    });
    bar.querySelector('[data-action="settings"]')?.addEventListener("click", () => {
      if (!this._isMobileViewport) return;
      this.notificationSettings.open();
    });

    host.appendChild(bar);
    this._mobileToolbarEl = bar;
  }

  _syncMobileToolbarState() {
    if (!this._mobileToolbarEl) return;
    this._mobileToolbarEl.classList.toggle("is-visible", this._isMobileViewport);

    this._mobileToolbarEl.querySelectorAll(".mobile-toolbar-btn").forEach((btn) => {
      const action = btn.getAttribute("data-action");
      const active =
        (action === "wordweaver" && this.bottomNav?.getActiveTab() === "wordweaver") ||
        (action === "writer" && this.panelMode === "notebook-writer") ||
        (action === "notifications" && this.viewMode === "notification-wall");
      btn.classList.toggle("is-active", active);
    });
  }

  update() {
    this._weaverGalaxy?.update();
  }

  _detectNativeRuntime() {
    // Phase 2 Tauri scaffold hook: detect native host safely.
    // Remove by deleting this method and constructor assignment.
    const hasTauri = typeof window !== "undefined" && Boolean(window.__TAURI__);
    return {
      isTauri: hasTauri
    };
  }

  _registerServiceWorker() {
    // PWA update flow: a new worker installs and WAITS; we show an "Update
    // available" banner so the installed home-screen app refreshes with one tap
    // instead of a delete + reinstall. Remove by deleting this method, the
    // constructor call, and UpdatePrompt.
    if (!("serviceWorker" in navigator)) return;

    // Reload exactly once when the new worker takes control (after SKIP_WAITING).
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    const promptUpdate = (worker) => {
      if (!worker) return;
      this.updatePrompt?.showAvailable(() => {
        worker.postMessage({ type: "SKIP_WAITING" });
      });
    };

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js").then((reg) => {
        this._swRegistration = reg;

        // A new version may already be waiting from a previous visit.
        if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);

        // A new worker is installing now → prompt once it finishes (update only,
        // not the very first install where there's no controller yet).
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              promptUpdate(reg.waiting || nw);
            }
          });
        });

        // Check for a new deploy on launch, whenever the app regains focus
        // (installed PWAs are frozen in the background), and every 30 min.
        reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
        setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
      }).catch(() => {
        /* ignore registration failures in unsupported contexts */
      });
    });
  }

  /**
   * Manual "Check for updates" (settings button). Reports status via the banner.
   */
  async checkForUpdates() {
    if (!("serviceWorker" in navigator)) {
      this.updatePrompt?.showStatus("Updates aren't supported in this browser.", 4000);
      return;
    }
    const reg = this._swRegistration || (await navigator.serviceWorker.getRegistration());
    if (!reg) {
      this.updatePrompt?.showStatus("Not installed as an app yet.", 4000);
      return;
    }
    this.updatePrompt?.showStatus("Checking for updates…");
    try {
      await reg.update();
    } catch {
      /* offline / network error — fall through */
    }
    if (reg.waiting) {
      this.updatePrompt?.showAvailable(() => reg.waiting.postMessage({ type: "SKIP_WAITING" }));
    } else {
      this.updatePrompt?.showStatus("You're on the latest version.", 4000);
    }
  }

  _mountInstallPrompt() {
    // PWA bootstrap hook: dynamic in-app install CTA.
    // Remove by deleting this method and InstallPrompt import.
    this.installPrompt = new InstallPrompt();
    this.installPrompt.mount();
    this.updatePrompt.mount();
  }

  _mountOsShell() {
    // Phase OS shell bootstrap hook: launcher + window manager integration.
    // Remove by deleting this method, imports, and constructor call.
    if (typeof document === "undefined") return;
    const root = document.getElementById("app");
    if (!root || root.querySelector(".os-shell")) return;

    const shell = document.createElement("div");
    shell.className = "os-shell";
    shell.setAttribute("role", "application");
    shell.setAttribute("aria-label", "OS shell");
    root.appendChild(shell);

    const apps = SHELL_APPS;

    this.windowManager = new WindowManager({ apps, calendarApp: this });
    this.windowManager.mount(shell);

    this.appLauncher = new AppLauncher({
      apps,
      onOpenApp: (appId) => this._openShellApp(appId)
    });
    this.appLauncher.mount(shell);
  }

  /**
   * OS launcher — Notebook Calendar + WordWeaver satellite panels (linked to in-page dock / embed).
   * @param {string} appId
   */
  async _openShellApp(appId) {
    if (!this.windowManager) return;

    const date = this.notebookCalendarDock?.getDate() ?? this._getTodayDate();

    if (appId === "wordweaver") {
      this._showWordWeaverPreview(date, getLastView()?.time ?? "09:00");
      await this.windowManager.openApp("wordweaver", { initialView: date });
      return;
    }

    if (appId === "notebook-calendar") {
      this.notebookCalendarDock?.show();
      if (date) await this.syncCalendarMonth(date);
      await this.windowManager.openApp("notebook-calendar", {
        initialView: date ?? "today"
      });
      return;
    }

    await this.windowManager.openApp(appId, { initialView: date ?? "today" });
  }

  _applyNotificationTheme() {
    const settings = loadNotificationSettings();
    const mode = settings.theme ?? "auto";

    let isDark = false;
    try {
      const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
      isDark = Boolean(mql?.matches);
    } catch {
      isDark = false;
    }

    const target = mode === "auto" ? (isDark ? "theme-dark" : "theme-light") : mode === "dark" ? "theme-dark" : "theme-light";

    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(target);

    // Also set on :root so `:root.theme-light` selectors work reliably.
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add(target);

    bootstrapAppearance();
  }

}
