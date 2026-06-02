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
  parseDate
} from "./calendarState.js";
import { CalendarWall } from "./CalendarWall.js";
import { AppointmentWall } from "./AppointmentWall.js";
import { DayDetailView } from "./DayDetailView.js";
import { ThreadPanel } from "./ui/ThreadPanel.js";
import { AppointmentPanel } from "./ui/AppointmentPanel.js";
import { UIOverlay } from "./UIOverlay.js";
import { ScheduleModal } from "./ui/ScheduleModal.js";
import { AppointmentModal } from "./ui/AppointmentModal.js";
import { MonthTransitionController } from "./MonthTransitionController.js";
import { WallTransitionController } from "./WallTransitionController.js";
import { CalendarInteraction } from "./CalendarInteraction.js";
import { CameraController } from "./CameraController.js";
import { NotificationService } from "./notifications/NotificationService.js";
import { NotificationWall } from "./NotificationWall.js";
import { NotificationDropdown } from "./ui/NotificationDropdown.js";
import { NotificationSettings } from "./ui/NotificationSettings.js";
import { InstallPrompt } from "./ui/InstallPrompt.js";
import { loadNotificationSettings } from "./notifications/notificationSettings.js";
import { iconDay, iconHour, iconBell, iconSettings } from "./ui/IconLibrary.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Dual-wall calendar: notebook (threads) + appointments.
 */
export class CalendarApp {
  constructor({ scene, camera, renderer, controls }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;

    this.activeWall = "notebook";
    this.viewMode = "overview";
    this.panelMode = null;
    this.selectedDayId = null;
    this._wallBeforeNotification = "notebook";
    this._isMobileViewport = window.innerWidth <= 768;
    this._mobileToolbarEl = null;
    this.nativeRuntime = this._detectNativeRuntime();
    this.installPrompt = null;

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
    this.appointmentWall = new AppointmentWall(scene);
    this.dayDetailView = new DayDetailView(scene);
    this.cameraController = new CameraController(camera, controls);
    this.monthTransition = new MonthTransitionController(this.notebookWall);
    this.wallTransition = new WallTransitionController(
      this.notebookWall,
      this.appointmentWall
    );

    this.notificationWall = new NotificationWall(scene);

    this.notificationDropdown = new NotificationDropdown({
      onSelect: (target) => this.navigateFromNotification(target),
      onOpenWall: () => this.enterNotificationWall(),
      onOpenSettings: () => this.notificationSettings.open()
    });

    this.notificationSettings = new NotificationSettings({
      onChange: () => this._refreshNotificationUi(),
      onTestSound: (themeId) => this.notificationService.testSound(themeId),
      onRequestBrowserPermission: () => this.notificationService.requestPermission()
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

    this.notificationWall.onItemClick = (target) => this.navigateFromNotification(target);
    this.notificationWall.onBack = () => this.exitNotificationWall();

    this.threadPanel = new ThreadPanel(this.state, {
      onChange: () => this._onDataChange(),
      onBack: () => this.closePanels(),
      onSetReminder: (dayId) => this._openSchedule("reminder", dayId),
      onSetAlarm: (dayId) => this._openSchedule("alarm", dayId),
      onThreadChange: () => {
        if (this.uiOverlay) this.uiOverlay.reload();
      }
    });

    this.appointmentPanel = new AppointmentPanel(this.state, {
      onChange: () => this._onDataChange(),
      onBack: () => this.closePanels(),
      onAddAppointment: (dayId) => this._openAppointmentModal(dayId),
      onEditAppointment: (dayId, appt) => this._openAppointmentModal(dayId, appt),
      onSetReminder: (dayId) => this._openSchedule("reminder", dayId),
      onSetAlarm: (dayId) => this._openSchedule("alarm", dayId)
    });

    this.uiOverlay = new UIOverlay(this.state, {
      getSelectedThreadId: () => this.threadPanel.getSelectedThreadId(),
      onHourChange: (hour) => this._syncHour(hour),
      onSaved: () => this._onDataChange()
    });

    this.scheduleModal = new ScheduleModal(this.state, {
      onSaved: () => {
        this.threadPanel.refresh();
        this.appointmentPanel.refresh();
        this._onDataChange();
      },
      requestNotifyPermission: () => this.notificationService.requestPermission()
    });

    this.appointmentModal = new AppointmentModal(this.state, {
      onSaved: () => {
        this.appointmentPanel.refresh();
        this._onDataChange();
      },
      requestNotifyPermission: () => this.notificationService.requestPermission()
    });

    this.notebookWall.buildFromState(this.state);
    this.appointmentWall.buildFromState(this.state, { skipLayout: true });
    this.appointmentWall.group.position.copy(this.notebookWall.group.position);
    this.appointmentWall.setVisible(false);

    this.interaction = new CalendarInteraction({
      camera,
      renderer,
      getActiveWall: () => this._getActiveWall(),
      isInteractionEnabled: () => this.viewMode !== "notification-wall",
      dayDetailView: this.dayDetailView,
      onNotebookDayClick: (dayId) => this.enterNotebookDetail(dayId),
      onAppointmentDayClick: (dayId) => this.openAppointmentPanel(dayId),
      onHourClick: (hour) => this._syncHour(hour),
      onCanvasTapEmpty: () => this._handleCanvasTapEmpty()
    });

    this._frameOverviewCamera(false);
    this._onResize = () => this._handleViewportResize();
    window.addEventListener("resize", this._onResize, { passive: true });
    this._configureMobilePerformance();
    this._configureMobileControls();
    this._injectMobileToolbar();
    this._syncMobileToolbarState();
    this._bindNavigation();
    this._bindWallToggle();
    this._updateNavLabels();
    this.notificationService.tick();
    this._registerServiceWorker();
    this._mountInstallPrompt();

    this._applyNotificationTheme();
    // #region agent log
    fetch('http://127.0.0.1:7657/ingest/92d10a13-16b2-4bee-be33-e8a55df63a55',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a598c'},body:JSON.stringify({sessionId:'6a598c',runId:'initial-5',hypothesisId:'H13',location:'CalendarApp.js:constructor',message:'CalendarApp booted with latest instrumentation',data:{activeWall:this.activeWall,viewMode:this.viewMode,panelMode:this.panelMode},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

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
    // #region agent log
    fetch('http://127.0.0.1:7657/ingest/92d10a13-16b2-4bee-be33-e8a55df63a55',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a598c'},body:JSON.stringify({sessionId:'6a598c',runId:'initial',hypothesisId:'H2',location:'CalendarApp.js:_refreshNotificationUi',message:'Refreshing notification UI and theme',data:{viewMode:this.viewMode,bodyClass:document.body.className,htmlClass:document.documentElement.className},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    this._applyNotificationTheme();
    this._syncMobileToolbarState();
  }

  _getActiveWall() {
    if (this.viewMode === "notification-wall") return null;
    return this.activeWall === "appointments"
      ? this.appointmentWall
      : this.notebookWall;
  }

  _syncPanelsState() {
    this.threadPanel.state = this.state;
    this.appointmentPanel.state = this.state;
    this.uiOverlay.state = this.state;
    this.scheduleModal.state = this.state;
    this.appointmentModal.state = this.state;
  }

  _syncHour(hour) {
    this.dayDetailView.setSelectedHour(hour);
    this.uiOverlay.setHour(hour, false);
    this.threadPanel.setComposeHour(hour);
  }

  _onDataChange() {
    this.dayDetailView.refreshHourIndicators();
    this.threadPanel.refresh();
    this.appointmentPanel.refresh();
    this._refreshWalls();
    persistCalendarState(this.state);
    this.notificationService?.tick();
  }

  _refreshWalls() {
    this.notebookWall.buildFromState(this.state, { skipLayout: true });
    this.appointmentWall.buildFromState(this.state, { skipLayout: true });
  }

  closePanels() {
    // #region agent log
    fetch('http://127.0.0.1:7657/ingest/92d10a13-16b2-4bee-be33-e8a55df63a55',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a598c'},body:JSON.stringify({sessionId:'6a598c',runId:'initial-3',hypothesisId:'H8',location:'CalendarApp.js:closePanels',message:'closePanels invoked',data:{panelMode:this.panelMode,viewMode:this.viewMode,selectedDayId:this.selectedDayId},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (this.panelMode === "notebook-detail") {
      this._closeNotebookDetail(false);
    }
    if (this.panelMode === "appointments") {
      this.appointmentPanel.close();
      this.appointmentWall.setOverviewDimmed(false);
      this.panelMode = null;
      this.selectedDayId = null;
      this.viewMode = "overview";
      this.interaction.setMode("overview");
      document.body.classList.remove("appointment-panel-open");
    }
  }

  async openAppointmentPanel(dayId) {
    // #region agent log
    fetch('http://127.0.0.1:7657/ingest/92d10a13-16b2-4bee-be33-e8a55df63a55',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a598c'},body:JSON.stringify({sessionId:'6a598c',runId:'initial-2',hypothesisId:'H7',location:'CalendarApp.js:openAppointmentPanel.enter',message:'openAppointmentPanel called',data:{dayId,viewMode:this.viewMode,panelMode:this.panelMode,activeWall:this.activeWall},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (this.wallTransition.isBusy) return;
    await this._closeAllPanelsForSwitch();

    this.selectedDayId = dayId;
    this.panelMode = "appointments";
    this.viewMode = "panel";

    this.appointmentWall.setSelectedDay(dayId);
    this.appointmentWall.setOverviewDimmed(true);
    this.appointmentPanel.open(dayId);
    // #region agent log
    fetch('http://127.0.0.1:7657/ingest/92d10a13-16b2-4bee-be33-e8a55df63a55',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a598c'},body:JSON.stringify({sessionId:'6a598c',runId:'initial-2',hypothesisId:'H7',location:'CalendarApp.js:openAppointmentPanel.afterOpen',message:'appointmentPanel.open invoked',data:{viewMode:this.viewMode,panelMode:this.panelMode,panelHidden:document.getElementById("appointment-panel")?.classList.contains("hidden")},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    this.interaction.setMode("overview");
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

    document.body.classList.add("detail-mode");

    const focus = anchor.clone();
    focus.x += 2.75;
    focus.y -= 1.8;

    this.controls.enabled = false;
    await this.cameraController.zoomToDay(focus, new THREE.Vector3(0, 1.2, 6.5));
    this.controls.enabled = true;
  }

  async _closeNotebookDetail(zoomOut = true) {
    this.uiOverlay.close();
    this.threadPanel.close();
    this.dayDetailView.hide();
    this.notebookWall.setSelectedDay(null);
    this.notebookWall.setOverviewDimmed(false);
    document.body.classList.remove("detail-mode");

    if (zoomOut && this.viewMode === "detail") {
      this.controls.enabled = false;
      await this.cameraController.zoomToOverview(
        this._getActiveWall().getCenterTarget(),
        this._overviewCameraOffset()
      );
      this.controls.enabled = true;
    }

    this.viewMode = "overview";
    this.panelMode = null;
    this.selectedDayId = null;
    this.interaction.setMode("overview");
  }

  async _closeAllPanelsForSwitch() {
    if (this.panelMode === "notebook-detail") {
      await this._closeNotebookDetail(true);
    }
    if (this.panelMode === "appointments") {
      this.appointmentPanel.close();
      this.appointmentWall.setOverviewDimmed(false);
      this.appointmentWall.setSelectedDay(null);
      this.panelMode = null;
      document.body.classList.remove("appointment-panel-open");
    }
    this.selectedDayId = null;
    this.viewMode = "overview";
    this.interaction.setMode("overview");
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
    const span = Math.max(bounds.width, bounds.height);
    const mobile = window.innerWidth <= 768;
    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);

    const distanceMultiplier = mobile || aspect < 1 ? 1.7 : 1.35;
    const distanceMin = mobile || aspect < 1 ? 15 : 12;
    const distance = Math.max(distanceMin, span * distanceMultiplier);
    const y = mobile || aspect < 1 ? 1.6 : 1.2;
    return new THREE.Vector3(0, y, distance);
  }

  _bindWallToggle() {
    const btnNotebook = document.getElementById("wall-notebook");
    const btnAppointments = document.getElementById("wall-appointments");

    btnNotebook?.addEventListener("click", () => this.switchWall("notebook"));
    btnAppointments?.addEventListener("click", () => this.switchWall("appointments"));
    this._updateWallToggleUI();
  }

  _updateWallToggleUI() {
    const btnNotebook = document.getElementById("wall-notebook");
    const btnAppointments = document.getElementById("wall-appointments");
    btnNotebook?.classList.toggle("is-active", this.activeWall === "notebook");
    btnAppointments?.classList.toggle("is-active", this.activeWall === "appointments");
    btnNotebook?.setAttribute("aria-pressed", String(this.activeWall === "notebook"));
    btnAppointments?.setAttribute("aria-pressed", String(this.activeWall === "appointments"));

    const hint = document.getElementById("overview-hint");
    if (hint) {
      hint.textContent =
        this.activeWall === "appointments"
          ? "Appointments wall — click a day to manage scheduled visits"
          : "Notebook wall — click a day to open threaded notes and the 3D hour grid";
    }
  }

  async switchWall(target) {
    if (this.viewMode === "notification-wall") return;
    if (this.activeWall === target || this.wallTransition.isBusy) return;
    if (this.viewMode !== "overview" || this.panelMode) {
      await this._closeAllPanelsForSwitch();
    }

    this.notebookWall.setSelectedDay(null);
    this.appointmentWall.setSelectedDay(null);
    this.notebookWall.setOverviewDimmed(false);
    this.appointmentWall.setOverviewDimmed(false);

    await this.wallTransition.switchTo(target);

    this.activeWall = target;
    this.interaction.setActiveWallType(target);
    this._updateWallToggleUI();
    this._syncMobileToolbarState();

    const center = this._getActiveWall().getCenterTarget();
    this.controls.target.copy(center);
    this.controls.update();
  }

  async enterNotificationWall() {
    if (this.viewMode === "notification-wall") return;
    await this._closeAllPanelsForSwitch();

    this._wallBeforeNotification = this.activeWall;
    this.viewMode = "notification-wall";
    this.panelMode = null;
    this.interaction.setMode("notification");

    this.notebookWall.setVisible(false);
    this.appointmentWall.setVisible(false);
    this.notificationWall.buildFromState(this.state);
    this.notificationWall.setVisible(true);

    document.getElementById("wall-toggle")?.classList.add("is-hidden");
    const hint = document.getElementById("overview-hint");
    if (hint) hint.textContent = "Notification history — click an entry to jump to that day";

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

    this.notificationWall.setVisible(false);
    this.viewMode = "overview";
    this.interaction.setMode("overview");

    document.getElementById("wall-toggle")?.classList.remove("is-hidden");
    this._updateWallToggleUI();

    const targetWall = this._wallBeforeNotification || "notebook";
    if (targetWall === "appointments") {
      this.notebookWall.setVisible(false);
      this.appointmentWall.setVisible(true);
      this.activeWall = "appointments";
    } else {
      this.notebookWall.setVisible(true);
      this.appointmentWall.setVisible(false);
      this.activeWall = "notebook";
    }
    this.interaction.setActiveWallType(this.activeWall);
    this._updateWallToggleUI();

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

    const wall =
      target.wall ||
      (target.type === "appointment" ? "appointments" : "notebook");
    const hour = target.hour != null ? String(target.hour) : null;

    if (wall === "appointments" || target.type === "appointment") {
      if (this.activeWall !== "appointments") {
        await this.switchWall("appointments");
      }
      await this.openAppointmentPanel(target.dayId);
      return;
    }

    if (this.activeWall !== "notebook") {
      await this.switchWall("notebook");
    }
    await this.enterNotebookDetail(target.dayId);
    if (hour != null) {
      this._syncHour(hour);
      this.dayDetailView.pulseHour(hour);
    }
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
        this.appointmentWall.buildFromState(this.state, { skipLayout: true });
        this.appointmentWall.group.position.copy(this.notebookWall.group.position);
        this._frameOverviewCamera(true);
        persistCalendarState(this.state);
        this._updateNavLabels();
      },
      delta,
      activeWall
    );
  }

  _frameOverviewCamera(animate) {
    const center = this._getActiveWall().getCenterTarget();
    const offset = this._overviewCameraOffset();
    const desired = center.clone().add(offset);

    if (!animate) {
      this.camera.position.copy(desired);
      this.controls.target.copy(center);
      this.controls.update();
      return;
    }

    this.cameraController.zoomToOverview(center, offset);
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
    this._frameOverviewCamera(false);
  }

  _handleCanvasTapEmpty() {
    // #region agent log
    fetch('http://127.0.0.1:7657/ingest/92d10a13-16b2-4bee-be33-e8a55df63a55',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a598c'},body:JSON.stringify({sessionId:'6a598c',runId:'initial-3',hypothesisId:'H8',location:'CalendarApp.js:_handleCanvasTapEmpty',message:'Canvas empty tap handler fired',data:{isMobile:this._isMobileViewport,viewMode:this.viewMode,panelMode:this.panelMode},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
    if (this.panelMode === "appointments" || this.panelMode === "notebook-detail") {
      this.closePanels();
      return;
    }
    this.notificationSettings?.close?.();
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
      <button type="button" class="mobile-toolbar-btn" data-action="notebook">${iconDay}<span>Notebook</span></button>
      <button type="button" class="mobile-toolbar-btn" data-action="appointments">${iconHour}<span>Appointments</span></button>
      <button type="button" class="mobile-toolbar-btn" data-action="notifications">${iconBell}<span>Notifications</span></button>
      <button type="button" class="mobile-toolbar-btn" data-action="settings">${iconSettings}<span>Settings</span></button>
    `;

    bar.querySelector('[data-action="notebook"]')?.addEventListener("click", async () => {
      if (!this._isMobileViewport) return;
      if (this.viewMode === "notification-wall") await this.exitNotificationWall();
      if (this.activeWall !== "notebook") await this.switchWall("notebook");
    });
    bar.querySelector('[data-action="appointments"]')?.addEventListener("click", async () => {
      if (!this._isMobileViewport) return;
      if (this.viewMode === "notification-wall") await this.exitNotificationWall();
      if (this.activeWall !== "appointments") await this.switchWall("appointments");
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
        (action === "notebook" && this.activeWall === "notebook" && this.viewMode !== "notification-wall") ||
        (action === "appointments" && this.activeWall === "appointments" && this.viewMode !== "notification-wall") ||
        (action === "notifications" && this.viewMode === "notification-wall");
      btn.classList.toggle("is-active", active);
    });
  }

  update() {}

  _detectNativeRuntime() {
    // Phase 2 Tauri scaffold hook: detect native host safely.
    // Remove by deleting this method and constructor assignment.
    const hasTauri = typeof window !== "undefined" && Boolean(window.__TAURI__);
    return {
      isTauri: hasTauri
    };
  }

  _registerServiceWorker() {
    // PWA bootstrap hook: safe registration for offline app shell support.
    // Remove by deleting this method and the constructor call.
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {
        /* ignore registration failures in unsupported contexts */
      });
    });
  }

  _mountInstallPrompt() {
    // PWA bootstrap hook: dynamic in-app install CTA.
    // Remove by deleting this method and InstallPrompt import.
    this.installPrompt = new InstallPrompt();
    this.installPrompt.mount();
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
    // #region agent log
    fetch('http://127.0.0.1:7657/ingest/92d10a13-16b2-4bee-be33-e8a55df63a55',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'6a598c'},body:JSON.stringify({sessionId:'6a598c',runId:'initial',hypothesisId:'H3',location:'CalendarApp.js:_applyNotificationTheme',message:'Applied theme classes',data:{mode,target,bodyClass:document.body.className,htmlClass:document.documentElement.className},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  }

}
