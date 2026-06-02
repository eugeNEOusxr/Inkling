import * as THREE from "three";

/**
 * Overview interaction for notebook or appointments wall.
 */
export class CalendarInteraction {
  constructor(opts) {
    this.camera = opts.camera;
    this.renderer = opts.renderer;
    this.getActiveWall = opts.getActiveWall;
    this.isInteractionEnabled = opts.isInteractionEnabled ?? (() => true);
    this.dayDetailView = opts.dayDetailView;

    this.mode = "overview";
    this.activeWallType = "notebook";
    this.onNotebookDayClick = opts.onNotebookDayClick ?? (() => {});
    this.onHourClick = opts.onHourClick ?? (() => {});
    this.onCanvasTapEmpty = opts.onCanvasTapEmpty ?? (() => {});

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hoveredDayId = null;
    this.hoveredHour = null;

    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    this._downPointerId = null;
    this._downAt = null;
    this._maxTapDistancePx = 10;
    this._maxTapDurationMs = 450;
    this._isMobile = window.innerWidth <= 768;
    this._moveRaf = null;
    this._pendingMoveEvent = null;

    const el = this.renderer.domElement;
    // Improves touch response by removing double-tap zoom delays on mobile.
    el.style.touchAction = "manipulation";
    this._onPointerLeave = this._onPointerLeave.bind(this);
    el.addEventListener("pointermove", this._onPointerMove);
    el.addEventListener("pointerdown", this._onPointerDown);
    el.addEventListener("pointerup", this._onPointerUp);
    el.addEventListener("pointerleave", this._onPointerLeave);
  }

  setActiveWallType(type) {
    this.activeWallType = type;
    this.hoveredDayId = null;
    this.hoveredHour = null;
    const wall = this.getActiveWall();
    wall?.setHoveredDay(null);
    this.renderer.domElement.style.cursor = "default";
  }

  setMode(mode) {
    this.mode = mode;
    this.hoveredDayId = null;
    this.hoveredHour = null;
    if (mode === "overview") {
      this.getActiveWall()?.setHoveredDay(null);
    } else if (mode === "detail") {
      this.dayDetailView?.setHoveredHour(null);
    }
    if (mode === "notification") {
      this.getActiveWall()?.setHoveredDay(null);
    }
    this.renderer.domElement.style.cursor = "default";
  }

  dispose() {
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this._onPointerMove);
    el.removeEventListener("pointerdown", this._onPointerDown);
    el.removeEventListener("pointerup", this._onPointerUp);
    el.removeEventListener("pointerleave", this._onPointerLeave);
    if (this._moveRaf) cancelAnimationFrame(this._moveRaf);
    this._moveRaf = null;
    this._pendingMoveEvent = null;
  }

  _updatePointer(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _pickOverviewDayId() {
    const wall = this.getActiveWall();
    if (!wall) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = wall.getDayMeshes();
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    return wall.getDayIdFromObject(hits[0].object);
  }

  _pickOverviewDayIdWithTolerance(event) {
    const direct = this._pickOverviewDayId();
    if (direct || !this._isMobile) return direct;

    // Slightly larger virtual hit area for touch users.
    const offsets = [
      [0, 0],
      [12, 0],
      [-12, 0],
      [0, 12],
      [0, -12],
      [9, 9],
      [9, -9],
      [-9, 9],
      [-9, -9]
    ];

    const rect = this.renderer.domElement.getBoundingClientRect();
    const baseX = event.clientX;
    const baseY = event.clientY;
    for (const [dx, dy] of offsets) {
      this.pointer.x = ((baseX + dx - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((baseY + dy - rect.top) / rect.height) * 2 + 1;
      const id = this._pickOverviewDayId();
      if (id) return id;
    }
    this._updatePointer(event);
    return null;
  }

  _pickDetailHour() {
    if (!this.dayDetailView) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = this.dayDetailView.getHourMeshes();
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    return this.dayDetailView.getHourFromObject(hits[0].object);
  }

  _onPointerMove(event) {
    if (this._isUiTarget(event.target)) return;
    if (!this.isInteractionEnabled()) return;
    if (event.pointerType === "touch" || this._isMobile) return;

    // Debounced pointer move handling to reduce per-frame raycast cost.
    this._pendingMoveEvent = event;
    if (this._moveRaf) return;
    this._moveRaf = requestAnimationFrame(() => {
      const e = this._pendingMoveEvent;
      this._pendingMoveEvent = null;
      this._moveRaf = null;
      if (!e) return;
      this._updatePointer(e);

      if (this.mode === "overview") {
        const wall = this.getActiveWall();
        const dayId = this._pickOverviewDayId();
        if (dayId === this.hoveredDayId) {
          if (dayId) wall?.positionHoverPreview?.(e.clientX, e.clientY);
          return;
        }
        this.hoveredDayId = dayId;
        wall?.setHoveredDay(dayId);
        if (dayId) wall?.positionHoverPreview?.(e.clientX, e.clientY);
        this.renderer.domElement.style.cursor = dayId ? "pointer" : "default";
        return;
      }

      if (
        (this.mode === "detail" || this.mode === "writer") &&
        this.activeWallType === "notebook"
      ) {
        const hour = this._pickDetailHour();
        if (hour === this.hoveredHour) return;
        this.hoveredHour = hour;
        this.dayDetailView?.setHoveredHour(hour);
        this.renderer.domElement.style.cursor = hour ? "pointer" : "default";
      }
    });
  }

  _onPointerLeave() {
    if (this.mode !== "overview") return;
    this.hoveredDayId = null;
    this.getActiveWall()?.setHoveredDay(null);
    this.renderer.domElement.style.cursor = "default";
  }

  _onPointerDown(event) {
    if (event.button !== 0) return;
    if (this._isUiTarget(event.target)) return;
    this._downPointerId = event.pointerId;
    this._downAt = {
      x: event.clientX,
      y: event.clientY,
      t: performance.now()
    };
  }

  _onPointerUp(event) {
    if (event.button !== 0) return;
    if (this._isUiTarget(event.target)) return;
    if (!this.isInteractionEnabled()) return;
    if (!this._isTap(event)) return;
    this._updatePointer(event);

    if (this.mode === "overview") {
      const dayId = this._pickOverviewDayIdWithTolerance(event);
      if (!dayId) {
        this.onCanvasTapEmpty();
        return;
      }
      this.onNotebookDayClick(dayId);
      return;
    }

      if (
        (this.mode === "detail" || this.mode === "writer") &&
        this.activeWallType === "notebook"
      ) {
        const hour = this._pickDetailHour();
        if (hour) this.onHourClick(hour);
        else if (this.mode === "detail") this.onCanvasTapEmpty();
      }
    }

  _isTap(event) {
    if (!this._downAt || this._downPointerId !== event.pointerId) return false;
    const dx = event.clientX - this._downAt.x;
    const dy = event.clientY - this._downAt.y;
    const dt = performance.now() - this._downAt.t;
    this._downAt = null;
    this._downPointerId = null;
    return dx * dx + dy * dy <= this._maxTapDistancePx ** 2 && dt <= this._maxTapDurationMs;
  }

  _isUiTarget(target) {
    const overlay = document.getElementById("ui-overlay");
    return overlay?.contains(target) ?? false;
  }
}
