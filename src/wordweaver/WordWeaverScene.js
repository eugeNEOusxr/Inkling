import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { disposeWeaveMeshes, layoutSegmentWeave } from "./layoutSegmentWeave.js";
import { getActiveCustomLayout } from "./customLayout.js";
import { getCameraFrameForLayout } from "./layoutModes.js";
import { WordWeaverAtomOrbits } from "./WordWeaverAtomOrbits.js";
import { getActivePalette } from "../theme/appearancePalettes.js";
import { mountWordWeaverTimeline } from "./WordWeaverTimelineViewport.js";
import { onTimelineDataChange, disposeTimelineDataChange } from "../utils/EventBus.js";
import {
  getInitialNotes,
  getEventsForDay,
  getCategoryColor,
  todayIsoDate
} from "./timelineModel.js";
import { DayBlock3D } from "./DayBlock3D.js";
import { classifyEvent } from "../calendar/ai/AIBrain.js";
import { AtomGlyph3D } from "./timeline3d/AtomGlyph3D.js";
import { mountWordWeaverMainUI } from "../MainUI.js";
import * as bus from "../utils/EventBus.js";
import { getCalendarMode } from "./calendarMode.js";
import { getCalendar2D } from "./Calendar2D.js";
import { createMonthGrid, createYearGrid, createDayView, representativeDayIso, WordWeaverMonthGrid } from "./WordWeaverMonthGrid.js";
import { WordWeaver3DEditor } from "./WordWeaver3DEditor.js";
import { createConnectionsView } from "./WordWeaverConnections.js";
import { isWordWeaverTabActive } from "../calendar/ui/shellSurfaces.js";

/** Served from public/environments/ (copied from Meshy export). */
const WORDWEAVER_ENV_GLB_URL = "/environments/meshy-dark-futuristic.glb";
const ENV_LAYER = 0;
const CONTENT_LAYER = 1;

const _envLoader = new GLTFLoader();
const _flyDir = new THREE.Vector3();
const _flyRight = new THREE.Vector3();

/**
 * WordWeaver 3D viewport — spatial thought-weaving with multiple layout modes.
 * Renders in #wordweaver-embed-mount (standalone; not tied to the legacy Wall tab or month wall).
 */
export class WordWeaverScene {
  /**
   * @param {HTMLElement} container
   * @param {{ onNodeClick?: (detail: object) => void }} [opts]
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.onNodeClick = opts.onNodeClick ?? (() => {});
    this.canvas = document.createElement("canvas");
    this.canvas.className = "wordweaver-canvas";
    this.canvas.style.touchAction = "none";
    this.container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.environment = null;
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    this.camera.layers.enable(ENV_LAYER);
    this.camera.layers.enable(CONTENT_LAYER);
    this.camera.position.set(0, 2.4, 8.2);
    this._cameraHome = this.camera.position.clone();
    this._targetHome = new THREE.Vector3(0, 1.1, 0);
    this._entranceStart = 0;
    this._entranceMs = 0;
    this._layoutEntranceStart = 0;
    this._layoutEntranceMs = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.target.copy(this._targetHome);
    this.controls.maxPolarAngle = Math.PI;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 80;
    this.controls.enablePan = true;

    const amb = new THREE.AmbientLight(0x8899cc, 1.15);
    const key = new THREE.DirectionalLight(0xb8e8ff, 1.25);
    key.position.set(4, 8, 6);
    const rim = new THREE.PointLight(0x66ffff, 0.85, 32);
    rim.position.set(-3, 4, 2);
    for (const light of [amb, key, rim]) {
      light.layers.enable(ENV_LAYER);
      light.layers.enable(CONTENT_LAYER);
    }
    this.scene.add(amb, key, rim);

    this._envRoot = new THREE.Group();
    this._envRoot.name = "wordweaver-glb-environment";
    this._envRoot.layers.set(ENV_LAYER);
    this.scene.add(this._envRoot);
    this._loadEnvironmentGlb();

    this.weaveGroup = new THREE.Group();
    this.guideGroup = new THREE.Group();
    this.weaveGroup.layers.set(CONTENT_LAYER);
    this.guideGroup.layers.set(CONTENT_LAYER);
    this.scene.add(this.weaveGroup);
    this.scene.add(this.guideGroup);

    this._layoutMode = "street";
    /** @type {import('../inkling-core/timelineNode.js').SegmentModule | null} */
    this._lastModule = null;
    this._meshes = [];
    this._pickables = [];
    /** @type {THREE.Line[]} */
    this._threadLines = [];
    /** @type {Array<{ group: THREE.Group, target: THREE.Vector3, spawn: THREE.Vector3, phase: number, baseScale: number, startMs: number }>} */
    this._nodeAnims = [];
    /** @type {WordWeaverAtomOrbits | null} */
    this._atomOrbits = null;
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._hovered = null;
    /** @type {import("./WordWeaverMonthGrid.js").WordWeaverYearGrid | WordWeaverMonthGrid | null} */
    this._monthGrid = null;
    this._navLevel = "year"; // "year" | "month" | "day" | "connections"
    this._connView = null;
    this._navMonthGrid = null;
    this._navMonthIndex = 0;
    this._daySel = 0;
    // Rebuild the day view live when the paint-icon text prefs change
    // (style / colour / size), so the 3D note text updates immediately.
    if (typeof window !== "undefined") {
      const onTextPref = () => { if (this._navLevel === "day" && this._dayIso) this.enterDayViewIso(this._dayIso); };
      for (const ev of ["inkling:text-style", "inkling:text-color", "inkling:text-size", "inkling:text-font"]) {
        window.addEventListener(ev, onTextPref);
      }
    }
    /** @type {{ group: import("three").Group, items: Array<{ mesh: import("three").Mesh, y: number, event: any }>, dispose: () => void } | null} */
    this._dayView = null;
    /** Lazy in-scene editor (add-bar + time wheel + tap-to-delete) for the day view. */
    this._editor = null;
    /** M5 M1: month wall-grid is the active 3D layout; legacy timeline/weave stay mounted but hidden. */
    this._monthGridLayoutActive = true;
    /** @type {import("../inkling-core/timelineNode.js").DaySegment | string | null} */
    this._scenicBackdropSegment = null;
    /** Ring layout retained in-file but not mounted (M5 redesign M1). @type {WordWeaverYearLayout3D | null} */
    this._yearLayout = null;
    /** @type {{
     *   startTarget: THREE.Vector3,
     *   startCam: THREE.Vector3,
     *   endTarget: THREE.Vector3,
     *   endCam: THREE.Vector3,
     *   startMs: number,
     *   duration: number
     * } | null} */
    this._cameraFocus = null;
    /** Grid flight input from WordWeaverChrome (forward, strafe, lift ∈ [-1, 1]). */
    this._flightForward = 0;
    this._flightStrafe = 0;
    this._flightLift = 0;
    this._flightSpeed = 14;
    this._raf = 0;
    this._resizeObserver = null;
    this._clock = new THREE.Clock();

    this._onResize = () => this._resize();
    this._onPointerMove = (e) => this._handlePointerMove(e);
    this._onPointerDown = (e) => this._handlePointerDown(e);

    window.addEventListener("resize", this._onResize);
    this.canvas.addEventListener("pointermove", this._onPointerMove);
    this.canvas.addEventListener("pointerdown", this._onPointerDown);
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this._onResize());
      this._resizeObserver.observe(container);
    }
    this._resize();
    this._timelineViewport = mountWordWeaverTimeline({
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      controls: this.controls,
      domElement: this.canvas
    });
    this._suppressLegacy3DLayout();
    this._applyForegroundLayers();
    this._onTimelineUpdated = () => {
      if (this._monthGridLayoutActive) {
        this._rebuildMonthGrid();
        this.assertMonthGridLayout();
      } else {
        this._applyForegroundLayers();
        this._rebuildMonthGrid();
      }
    };
    this._timelineBusDisposers = onTimelineDataChange(this._onTimelineUpdated);

    // M5 redesign M1: single-month wall grid (ring createYearLayout retired in-place)
    this._rebuildMonthGrid();
    this._syncLegacyFlightMovement();
    getCalendar2D().mount(this.container);
    this._renderPaused = true;
    this._applyCalendarMode(getCalendarMode());
    this._offCalendarMode = bus.on("modeChanged", (p) =>
      this._applyCalendarMode(p?.mode === "2d" || p?.mode === "3d" ? p.mode : getCalendarMode())
    );
    this._onShellSurface = () => this._applyCalendarMode(getCalendarMode());
    document.addEventListener("inkling:shell-surface", this._onShellSurface);
    mountWordWeaverMainUI();

    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  }

  /**
   * Mobile / keyboard flight from WordWeaverChrome.
   * @param {number} forward
   * @param {number} strafe
   * @param {number} lift
   */
  setFlightInput(forward, strafe, lift) {
    if (this._monthGridLayoutActive) {
      this._flightForward = forward;
      this._flightStrafe = strafe;
      this._flightLift = lift;
      return;
    }
    this._timelineViewport?.setFlightInput?.(forward, strafe, lift);
  }

  _updateGridFlight(delta) {
    const forward = this._flightForward;
    const strafe = this._flightStrafe;
    const lift = this._flightLift;
    if (!forward && !strafe && !lift) return;

    const speed = this._flightSpeed * delta;
    this.camera.getWorldDirection(_flyDir);
    _flyDir.y = 0;
    if (_flyDir.lengthSq() < 1e-6) _flyDir.set(0, 0, -1);
    else _flyDir.normalize();

    _flyRight.crossVectors(_flyDir, this.camera.up).normalize();

    if (forward) {
      this.camera.position.addScaledVector(_flyDir, forward * speed);
      this.controls.target.addScaledVector(_flyDir, forward * speed);
    }
    if (strafe) {
      this.camera.position.addScaledVector(_flyRight, strafe * speed);
      this.controls.target.addScaledVector(_flyRight, strafe * speed);
    }
    if (lift) {
      this.camera.position.y += lift * speed;
      this.controls.target.y += lift * speed;
    }
  }

  _syncLegacyFlightMovement() {
    const gridActive = this._monthGridLayoutActive;
    this._timelineViewport?.setMovementEnabled?.(!gridActive);
    if (gridActive) {
      this._timelineViewport?.setFlightInput?.(0, 0, 0);
    }
  }

  /**
   * @param {"2d" | "3d"} mode
   */
  _applyCalendarMode(mode) {
    const tabActive = isWordWeaverTabActive();
    const is3d = mode === "3d" && tabActive;
    this._renderPaused = !is3d;
    this.container.style.visibility = tabActive ? "visible" : "hidden";
    this.container.style.display = tabActive ? "block" : "none";
    this.container.style.pointerEvents = is3d ? "auto" : "none";
    this.scene.visible = is3d;
    this.canvas.style.display = is3d ? "block" : "none";
    this.canvas.style.visibility = is3d ? "visible" : "hidden";
    this.canvas.style.pointerEvents = is3d ? "auto" : "none";
    if (this._monthGridLayoutActive) {
      if (is3d) {
        if (!this._monthGrid) this._rebuildMonthGrid();
        this.assertMonthGridLayout();
      } else {
        this._suppressLegacy3DLayout();
        if (this._monthGrid?.root) this._monthGrid.root.visible = false;
      }
    } else if (this._monthGrid?.root) {
      this._monthGrid.root.visible = is3d;
    }
    const cal2d = getCalendar2D();
    if (mode === "2d" && tabActive) cal2d.show();
    else cal2d.hide();
  }

  /** @returns {boolean} */
  isMonthGridLayoutActive() {
    return this._monthGridLayoutActive;
  }

  /** Hide legacy per-day timeline / weave / edit guides while the month grid is active. */
  _suppressLegacy3DLayout() {
    const timelineRoot = this._timelineViewport?.timeline3d?.root;
    if (timelineRoot) timelineRoot.visible = false;
    this.weaveGroup.visible = false;
    this.guideGroup.visible = false;
  }

  /**
   * End-state assert after embed enter flow: grid visible, legacy stacks hidden, camera framed.
   * Public so WordWeaverEmbed can re-assert after construct → setLayoutMode → show → setModule.
   */
  assertMonthGridLayout() {
    if (!this._monthGridLayoutActive) return;
    const is3d = getCalendarMode() === "3d" && isWordWeaverTabActive();
    this._suppressLegacy3DLayout();
    if (!is3d) {
      if (this._monthGrid?.root) this._monthGrid.root.visible = false;
      if (this._viewBtns) this._viewBtns.style.display = "none";
      if (this._monthStepper) this._monthStepper.style.display = "none";
      this._flightForward = 0;
      this._flightStrafe = 0;
      this._flightLift = 0;
      return;
    }
    this._ensureViewButtons();
    this._updateViewButtons();
    if (!this._monthGrid) this._rebuildMonthGrid();
    // Respect the drill-down: only show + re-frame the YEAR grid at the year level.
    // While drilled into a month/day, keep it hidden so it can't "stick" behind the view.
    if (this._navLevel === "year") {
      if (this._monthGrid?.root) this._monthGrid.root.visible = true;
      this._frameMonthGridCamera();
    } else if (this._monthGrid?.root) {
      this._monthGrid.root.visible = false;
    }
    this._syncLegacyFlightMovement();
    this._applyForegroundLayers();
  }

  _rebuildMonthGrid() {
    this._monthGrid?.dispose();
    const now = new Date();
    this._monthGrid = createYearGrid(this.scene, {
      year: now.getFullYear()
    });
    if (this._scenicBackdropSegment) {
      this._monthGrid.setScenicBackdropForSegment(this._scenicBackdropSegment);
    }
    if (this._monthGridLayoutActive) {
      this._suppressLegacy3DLayout();
    }
    // Don't reveal a freshly-built year grid while drilled into a month/day.
    if (this._navLevel && this._navLevel !== "year" && this._monthGrid?.root) {
      this._monthGrid.root.visible = false;
    }
    this._applyForegroundLayers();
  }

  _frameMonthGridCamera() {
    this._monthGrid?.frameCamera(this.camera, this.controls);
  }

  /** @deprecated Ring layout — retained for later milestones; not mounted in M1. */
  _rebuildYearLayout() {
    if (getCalendarMode() !== "3d" || !isWordWeaverTabActive()) return;
    const timelineRoot = this._timelineViewport?.timeline3d?.root;
    if (timelineRoot) timelineRoot.visible = false;
    this._yearLayout?.build(getInitialNotes());
    this._frameYearCamera();
    this._applyForegroundLayers();
  }

  _frameYearCamera() {
    this.controls.maxDistance = 120;
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, 18, 42);
    this.controls.update();
  }

  /**
   * @param {number} monthIndex 0–11
   */
  focusOnMonth(monthIndex) {
    if (this._monthGrid) {
      this._monthGrid.dispose();
      this._monthGrid = createMonthGrid(this.scene, {
        year: this._monthGrid.year,
        monthIndex
      });
      this._frameMonthGridCamera();
      return;
    }
    const cluster = this._yearLayout?.monthClusters[monthIndex];
    if (!cluster) return;
    const world = new THREE.Vector3();
    cluster.group.getWorldPosition(world);
    this._startCameraFocus(world, 14, 2.5);
  }

  /**
   * @param {number} monthIndex 0–11
   * @param {number} dayIndex day of month (1–31)
   */
  focusOnDay(monthIndex, dayIndex) {
    const block = this._yearLayout?.findDayBlock(monthIndex, dayIndex);
    if (!block) return;
    this._yearLayout.focusedDay = block;
    const world = new THREE.Vector3();
    block.group.getWorldPosition(world);
    block.setProximity(true);
    this._startCameraFocus(world, 5.5, 1.2);
  }

  /**
   * @param {THREE.Vector3} worldTarget
   * @param {number} distance
   * @param {number} heightOffset
   */
  _startCameraFocus(worldTarget, distance, heightOffset = 0) {
    const offset = new THREE.Vector3();
    if (this.camera.position.distanceTo(worldTarget) > 0.01) {
      offset.subVectors(this.camera.position, this.controls.target).normalize();
    } else {
      offset.set(0, 0.35, 1);
    }
    if (offset.lengthSq() < 1e-4) offset.set(0, 0.35, 1);
    this._cameraFocus = {
      startTarget: this.controls.target.clone(),
      startCam: this.camera.position.clone(),
      endTarget: worldTarget.clone(),
      endCam: worldTarget
        .clone()
        .add(offset.multiplyScalar(distance))
        .add(new THREE.Vector3(0, heightOffset, 0)),
      startMs: performance.now(),
      duration: 850
    };
  }

  _updateCameraFocus(now) {
    if (!this._cameraFocus) return;
    const f = this._cameraFocus;
    const t = Math.min(1, (now - f.startMs) / f.duration);
    const ease = 1 - (1 - t) ** 3;
    this.controls.target.lerpVectors(f.startTarget, f.endTarget, ease);
    this.camera.position.lerpVectors(f.startCam, f.endCam, ease);
    if (t >= 1) this._cameraFocus = null;
  }

  _loadEnvironmentGlb() {
    _envLoader.load(
      WORDWEAVER_ENV_GLB_URL,
      (gltf) => {
        const envScene = gltf.scene;
        envScene.name = "meshy-dark-futuristic-env";
        envScene.scale.set(10, 10, 10);
        envScene.position.set(0, 0, -5);
        envScene.renderOrder = -9999;
        envScene.layers.set(ENV_LAYER);
        envScene.traverse((obj) => {
          obj.layers.set(ENV_LAYER);
          if (obj.isMesh) {
            obj.castShadow = false;
            obj.receiveShadow = false;
            if (obj.material) {
              obj.material.depthWrite = true;
            }
          }
        });
        this._envRoot.add(envScene);
        this._envGlb = envScene;
      },
      undefined,
      (err) => {
        console.warn("[WordWeaverScene] environment GLB failed to load:", err);
      }
    );
  }

  /**
   * Single swap-in slot for scenic backboard behind the current month cluster.
   * @param {string} url
   */
  setScenicBackdropImage(url) {
    this._monthGrid?.setScenicBackdropImage?.(url);
  }

  /**
   * Time-of-day scenic backboard from WordWeaver day segment (Morning/Afternoon/Night toggle).
   * @param {import("../inkling-core/timelineNode.js").DaySegment | string} segment
   */
  setScenicBackdropForSegment(segment) {
    this._scenicBackdropSegment = segment;
    this._monthGrid?.setScenicBackdropForSegment?.(segment);
  }

  /** Timeline / weave content on layer 1; GLB environment stays on layer 0. */
  _applyForegroundLayers() {
    this.weaveGroup?.layers.set(CONTENT_LAYER);
    this.guideGroup?.layers.set(CONTENT_LAYER);
    const timelineRoot = this._timelineViewport?.timeline3d?.root;
    timelineRoot?.layers.set(CONTENT_LAYER);
    this._monthGrid?.root?.layers.set(CONTENT_LAYER);
    this._monthGrid?.root?.traverse((obj) => {
      obj.layers.set(CONTENT_LAYER);
    });
    this._yearLayout?.root?.layers.set(CONTENT_LAYER);
    this._yearLayout?.root?.traverse((obj) => {
      obj.layers.set(CONTENT_LAYER);
    });
    timelineRoot?.traverse((obj) => {
      if (obj === this._envRoot) return;
      obj.layers.set(CONTENT_LAYER);
    });
  }

  _disposeEnvironmentGlb() {
    if (!this._envRoot) return;
    this._envRoot.traverse((obj) => {
      obj.geometry?.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
        else obj.material.dispose?.();
      }
    });
    this._envRoot.clear();
    this._envGlb = null;
  }

  /**
   * @param {import('./layoutModes.js').WeaveLayoutMode} mode
   */
  setLayoutMode(mode) {
    this._layoutMode = mode;
    if (this._monthGridLayoutActive) {
      this.assertMonthGridLayout();
    }
  }

  /**
   * @param {import('./customLayout.js').CustomLayoutParams | null} params
   * @param {boolean} visible
   */
  setEditGuide(params, visible) {
    while (this.guideGroup.children.length) {
      const child = this.guideGroup.children[0];
      this.guideGroup.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
    if (!visible || !params) return;

    const radius = 0.5 + params.horizontalSpread * 2;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.88, radius, 64),
      new THREE.MeshBasicMaterial({
        color: 0x4ee6e6,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    this.guideGroup.add(ring);

    const height = Math.min(4.5, params.yBase + params.verticalStep * 8);
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, height, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.5 })
    );
    pillar.position.y = height / 2;
    this.guideGroup.add(pillar);

    const depthPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 1.6, height),
      new THREE.MeshBasicMaterial({
        color: 0x7c3aed,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide
      })
    );
    depthPlane.position.set(0, height / 2, -params.depthSpread * 1.8);
    this.guideGroup.add(depthPlane);

    this.controls.maxDistance = 12 + params.horizontalSpread * 6;
    this._cameraHome.set(0, 1.8 + params.verticalStep * 0.8, 6.5 + params.horizontalSpread * 2.5);
    this.controls.target.set(0, 1.1 + params.verticalStep * 0.3, 0);
  }

  /**
   * @param {import('../inkling-core/timelineNode.js').SegmentModule} module
   * @param {{ immersive?: boolean, skipEntrance?: boolean, customParams?: object, editGuide?: boolean, keepGuide?: boolean }} [opts]
   */
  setModule(module, opts = {}) {
    this._lastModule = module;
    if (this._monthGridLayoutActive) {
      this.assertMonthGridLayout();
      return;
    }
    this._atomOrbits?.dispose();
    this._atomOrbits = null;
    disposeWeaveMeshes(this._meshes);
    this.weaveGroup.clear();
    this._meshes = [];
    this._pickables = [];
    this._threadLines = [];
    this._nodeAnims = [];

    const customParams = opts.customParams ?? (this._layoutMode === "custom" ? getActiveCustomLayout() : null);
    const nodeCount = Math.min(module.nodes?.length ?? 0, 12);
    const { disposed, pickables, threadLines } = layoutSegmentWeave(
      module,
      this.weaveGroup,
      this._layoutMode,
      customParams
    );
    this._meshes = disposed;
    this._pickables = pickables;
    this._threadLines = threadLines ?? [];

    this._applyCameraFrame(nodeCount);
    this._removeWeaveBackgroundDate();
    this._removeGroundPlanes();

    if (opts.editGuide && customParams) {
      this.setEditGuide(customParams, true);
    } else if (!opts.keepGuide) {
      this.setEditGuide(null, false);
    }

    this._initNodeAnimations();
    if (getActivePalette().atomOrbits && pickables.length) {
      this._atomOrbits = new WordWeaverAtomOrbits(this.weaveGroup, pickables);
    }

    this._applyForegroundLayers();
    this.controls.update();

    this._entranceMs = 0;
    this._layoutEntranceMs = 0;
    if (opts.skipEntrance) {
      this._snapNodesToTargets();
    }
  }

  /** Remove horizontal ground / road planes so the timeline floats in space. */
  _removeGroundPlanes() {
    const toRemove = [];
    this.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const type = obj.userData?.type;
      if (
        type === "weave-road" ||
        type === "timeline-floor" ||
        type === "ground" ||
        type === "floor"
      ) {
        toRemove.push(obj);
      }
    });
    for (const mesh of toRemove) {
      mesh.parent?.remove(mesh);
      mesh.geometry?.dispose?.();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose?.());
        else mesh.material.dispose?.();
      }
    }
  }

  /** Remove large floating segment date header; keep starfield / weave nodes. */
  _removeWeaveBackgroundDate() {
    for (let i = this.weaveGroup.children.length - 1; i >= 0; i--) {
      const group = this.weaveGroup.children[i];
      if (group.userData?.type !== "weave-header") continue;
      this.weaveGroup.remove(group);
      const meshIdx = this._meshes.findIndex((m) => m.getGroup?.() === group);
      if (meshIdx >= 0) {
        this._meshes[meshIdx].dispose?.();
        this._meshes.splice(meshIdx, 1);
      }
      group.traverse((obj) => {
        obj.geometry?.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
          else obj.material.dispose?.();
        }
      });
    }
  }

  /**
   * @param {number} nodeCount
   */
  _applyCameraFrame(nodeCount) {
    const frame = getCameraFrameForLayout(this._layoutMode, nodeCount);
    this._cameraHome.copy(frame.position);
    this._targetHome.copy(frame.target);
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 80;
  }

  _initNodeAnimations() {
    const now = performance.now();
    this._nodeAnims = [];
    for (const { mesh } of this._pickables) {
      const group = mesh.getGroup();
      if (group.userData.type !== "weave-node") continue;
      const pos = group.userData.layoutPos;
      if (!pos) continue;
      const target = new THREE.Vector3(pos.x, pos.y, pos.z);
      const spawn = target.clone().add(new THREE.Vector3(0, 2.8, 0.6));
      const baseScale = group.userData.layoutScale ?? 1;
      group.position.copy(spawn);
      group.scale.setScalar(baseScale * 0.12);
      this._nodeAnims.push({
        group,
        target,
        spawn,
        phase: group.userData.layoutPhase ?? 0,
        baseScale,
        startMs: now
      });
    }
  }

  _snapNodesToTargets() {
    for (const anim of this._nodeAnims) {
      const off = this._idleOffset(this._layoutMode, anim.phase, 0);
      anim.group.position.set(
        anim.target.x + off.x,
        anim.target.y + off.y,
        anim.target.z + off.z
      );
      anim.group.scale.setScalar(anim.baseScale);
    }
    this._updateThreadLines();
  }

  /**
   * @param {import('./layoutModes.js').WeaveLayoutMode} mode
   * @param {number} phase
   * @param {number} t
   */
  _idleOffset(mode, phase, t) {
    switch (mode) {
      case "float":
        return {
          x: Math.sin(t * 0.9 + phase) * 0.14,
          y: Math.sin(t * 1.2 + phase * 0.7) * 0.2,
          z: Math.cos(t * 0.85 + phase) * 0.12
        };
      case "constellation":
        return {
          x: Math.sin(t * 0.35 + phase) * 0.06,
          y: Math.sin(t * 0.5 + phase * 1.1) * 0.08,
          z: Math.cos(t * 0.4 + phase) * 0.06
        };
      case "tree":
        return {
          x: Math.sin(t * 0.45 + phase) * 0.05,
          y: Math.sin(t * 0.6 + phase) * 0.03,
          z: 0
        };
      case "river":
        return {
          x: Math.sin(t * 0.7 + phase) * 0.04,
          y: Math.sin(t * 1.1 + phase) * 0.05,
          z: Math.sin(t * 0.5 + phase) * 0.06
        };
      case "forest":
        return {
          x: Math.sin(t * 0.4 + phase) * 0.04,
          y: 0,
          z: Math.cos(t * 0.35 + phase) * 0.04
        };
      case "street":
        return {
          x: Math.sin(t * 0.25 + phase) * 0.02,
          y: Math.sin(t * 0.3 + phase) * 0.025,
          z: 0
        };
      default:
        return { x: 0, y: 0, z: 0 };
    }
  }

  _updateNodeAnimations(now, layoutEase) {
    for (const anim of this._nodeAnims) {
      const elapsed = now - anim.startMs;
      const enter = Math.min(1, elapsed / 780);
      const ease = (1 - (1 - enter) ** 3) * layoutEase;
      const off = this._idleOffset(this._layoutMode, anim.phase, now * 0.001);
      const tx = anim.target.x + off.x;
      const ty = anim.target.y + off.y;
      const tz = anim.target.z + off.z;
      anim.group.position.set(
        THREE.MathUtils.lerp(anim.spawn.x, tx, ease),
        THREE.MathUtils.lerp(anim.spawn.y, ty, ease),
        THREE.MathUtils.lerp(anim.spawn.z, tz, ease)
      );
      const sc = anim.baseScale * (0.15 + ease * 0.85);
      anim.group.scale.setScalar(sc);
    }
    this._updateThreadLines();
  }

  _updateThreadLines() {
    for (const line of this._threadLines) {
      const { nodeA, nodeB } = line.userData;
      const ga = this._pickables.find((p) => p.node.id === nodeA)?.mesh.getGroup().position;
      const gb = this._pickables.find((p) => p.node.id === nodeB)?.mesh.getGroup().position;
      if (!ga || !gb || !line.geometry) continue;
      const pos = line.geometry.attributes.position;
      if (!pos) continue;
      pos.setXYZ(0, ga.x, ga.y, ga.z);
      pos.setXYZ(1, gb.x, gb.y, gb.z);
      pos.needsUpdate = true;
    }
  }

  /**
   * @param {import('./customLayout.js').CustomLayoutParams} params
   */
  relayoutCustom(params) {
    if (!this._lastModule || this._layoutMode !== "custom") return;
    this.setModule(this._lastModule, {
      customParams: params,
      skipEntrance: false,
      editGuide: true,
      keepGuide: true
    });
  }

  _resize() {
    const w = Math.max(this.container.clientWidth, 120);
    const h = Math.max(this.container.clientHeight, 72);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _pointerToNdc(event) {
    const rect = this.canvas.getBoundingClientRect();
    this._pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _collectClickTargets() {
    const targets = [];
    for (const { mesh } of this._pickables) {
      const group = mesh.getGroup();
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) targets.push(obj);
      });
    }
    for (const block of this._yearLayout?.dayBlocks ?? []) {
      targets.push(block.panel, block.noteSurface, block.eventGlow);
    }
    return targets;
  }

  _pick(event) {
    this._pointerToNdc(event);
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this._raycaster.intersectObjects(this._collectClickTargets(), false);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o) {
      if (o.userData?.dayBlock) return { dayBlock: o.userData.dayBlock };
      if (o.userData?.node) break;
      o = o.parent;
    }
    while (o && !o.userData?.node && o.parent) o = o.parent;
    return o?.userData?.node ?? null;
  }

  _handlePointerMove(event) {
    const picked = this._pick(event);
    const next =
      picked?.dayBlock?.dateIso ?? (picked?.id ? picked.id : null) ?? null;
    if (next !== this._hovered) {
      this._hovered = next;
      this.canvas.style.cursor = next ? "pointer" : "grab";
    }
  }

  _handlePointerDown(event) {
    // Year-grid mode: click-to-zoom into a rough day view (click again to exit).
    if (this._monthGridLayoutActive) {
      if (this._navLevel === "year") {
        const monthIndex = this._pickMonthAt(event);
        if (monthIndex != null) {
          event.preventDefault();
          event.stopPropagation();
          // Bounce the month's atom, then fly in (so the pop is visible).
          this._monthGrid?.bounceMonth?.(monthIndex);
          setTimeout(() => this.enterMonthView(monthIndex), 200);
        }
      } else if (this._navLevel === "month") {
        const iso = this._pickDayAt(event);
        if (iso) {
          event.preventDefault();
          event.stopPropagation();
          // Bounce the day box, then drill into the day view.
          this._monthGrid?.bounceDay?.(iso);
          setTimeout(() => this.enterDayViewIso(iso), 200);
        }
      }
      // "day" level: tap a note card → ✕ delete badge + X/Y/Z move gizmo. Only
      // swallow the event when a note was hit, so taps on the gizmo arrows reach
      // TransformControls (and OrbitControls stays usable on empty taps).
      if (this._navLevel === "day" && this._editor) {
        if (this._editor.handleDayTap(event)) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
      return;
    }
    const picked = this._pick(event);
    if (!picked) return;
    if (picked.dayBlock) {
      event.preventDefault();
      event.stopPropagation();
      this.focusOnDay(picked.dayBlock.monthIndex, picked.dayBlock.day);
      this.onNodeClick({
        date: picked.dayBlock.dateIso,
        time: "12:00",
        text: `Day ${picked.dayBlock.day}`,
        node: picked.dayBlock
      });
      return;
    }
    const node = picked;
    if (!node?.id) return;
    event.preventDefault();
    event.stopPropagation();
    this.onNodeClick({
      date: node.date,
      time: node.time,
      text: node.text,
      node
    });
  }

  /**
   * Ray-cast the click onto the grid plane (z=0); return the nearest month cluster index.
   * @param {PointerEvent} event
   * @returns {number | null}
   */
  _pickMonthAt(event) {
    const clusters = this._monthGrid?._layout?.clusters;
    if (!clusters?.length) return null;
    const rect = this.canvas.getBoundingClientRect();
    this._pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    if (!this._raycaster.ray.intersectPlane(plane, hit)) return null;
    let best = null;
    let bestD = Infinity;
    for (const c of clusters) {
      // Compare to the cluster's visual CENTER, not its month sphere (which sits at
      // the top) — otherwise a click low in a month's grid snaps to the row below.
      const cx = c.monthCenter.x;
      const cy = c.monthCenter.y - (c.monthLayout?.bounds?.height ?? 16) * 0.45;
      const dx = hit.x - cx;
      const dy = hit.y - cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best ? best.monthIndex : null;
  }

  /**
   * Drill year → MONTH: show that month's numbered-day grid.
   * @param {number} monthIndex 0-11
   */
  enterMonthView(monthIndex) {
    const year = this._monthGrid?.year ?? new Date().getFullYear();
    this._connView?.dispose(); this._connView = null;
    this._dayView?.dispose();
    this._dayView = null;
    this._navMonthGrid?.dispose();
    if (this._monthGrid?.root) this._monthGrid.root.visible = false;
    this._navMonthGrid = createMonthGrid(this.scene, { year, monthIndex });
    this._navMonthIndex = monthIndex;
    this._navLevel = "month";
    // Add-note is available at month level too (defaults to today). Year stays clean.
    if (!this._editor) this._editor = new WordWeaver3DEditor(this);
    const _t = new Date();
    this._editor.showAddForToday(
      `${_t.getFullYear()}-${String(_t.getMonth() + 1).padStart(2, "0")}-${String(_t.getDate()).padStart(2, "0")}`
    );
    this.controls.minDistance = 2;
    this.controls.maxDistance = 120;
    this.camera.far = Math.max(this.camera.far, 200);
    this.camera.updateProjectionMatrix();
    this._navMonthGrid.frameCamera(this.camera, this.controls);
    this._ensureBackButton();
    this._updateBackButton();
    this._updateViewButtons();
  }

  /**
   * Drill month → DAY: that specific day's timeframe spheres.
   * @param {string} dayIso
   */
  enterDayViewIso(dayIso) {
    this._dayIso = dayIso; // remember the focused day for ‹ › day stepping
    this._connView?.dispose(); this._connView = null;
    this._dayView?.dispose();
    this.controls.minDistance = 4;
    this.controls.maxDistance = 300;
    this.camera.far = Math.max(this.camera.far, 400);
    this.camera.updateProjectionMatrix();
    // The day view manages its own layout (full day vs scroll wheel) and frames
    // the camera accordingly.
    this._dayView = createDayView(this.scene, dayIso, {
      camera: this.camera,
      controls: this.controls,
      segment: this._scenicBackdropSegment ?? "afternoon",
      onRebuild: () => this.enterDayViewIso(dayIso) // re-enter on theme switch
    });
    if (this._navMonthGrid?.root) this._navMonthGrid.root.visible = false;
    this._navLevel = "day";
    this._daySel = 0;
    this._ensureBackButton();
    this._updateBackButton();
    this._updateViewButtons();
    if (!this._editor) this._editor = new WordWeaver3DEditor(this);
    this._editor.setDay(dayIso);
  }

  /** True when the 3D drill-down is on a single day. */
  isDayView() {
    return this._navLevel === "day";
  }

  /**
   * Step the focused day forward/back by `delta` days (3D day view only).
   * @param {number} delta +1 next day / -1 previous day
   * @returns {boolean} handled
   */
  stepDay(delta) {
    if (this._navLevel !== "day" || !this._dayIso) return false;
    const d = new Date(`${this._dayIso}T12:00:00`);
    d.setDate(d.getDate() + (delta < 0 ? -1 : 1));
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    this.enterDayViewIso(iso);
    return true;
  }

  /** Jump the day view to today (3D day view only). @returns {boolean} handled */
  goToTodayDay() {
    if (this._navLevel !== "day") return false;
    const n = new Date();
    const iso = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    this.enterDayViewIso(iso);
    return true;
  }

  /** Go up one level: day → month → year. */
  navBack() {
    if (this._navLevel === "connections") {
      this._connView?.dispose(); this._connView = null;
      if (this._monthGrid?.root) this._monthGrid.root.visible = true;
      this._monthGrid?.frameCamera(this.camera, this.controls);
      this._navLevel = "year";
      this._updateBackButton();
      this._updateViewButtons();
      return;
    }
    if (this._navLevel === "day") {
      this._dayView?.dispose();
      this._dayView = null;
      if (this._navMonthGrid?.root) this._navMonthGrid.root.visible = true;
      this._navMonthGrid?.frameCamera(this.camera, this.controls);
      this._navLevel = "month";
    } else if (this._navLevel === "month") {
      this._navMonthGrid?.dispose();
      this._navMonthGrid = null;
      if (this._monthGrid?.root) this._monthGrid.root.visible = true;
      this._monthGrid?.frameCamera(this.camera, this.controls);
      this._navLevel = "year";
    }
    this._updateBackButton();
    this._updateViewButtons();
  }

  /**
   * The 3D "connections" world for a day — category-grouped notes wired by the
   * red bracket style, with filter buttons.
   * @param {string} dayIso
   */
  enterConnectionsView(dayIso, scope = "day") {
    this._dayIso = dayIso;
    this._connScope = scope === "week" ? "week" : "day";
    this._dayView?.dispose(); this._dayView = null;
    this._connView?.dispose();
    if (this._navMonthGrid?.root) this._navMonthGrid.root.visible = false;
    if (this._monthGrid?.root) this._monthGrid.root.visible = false;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 400;
    this.camera.far = Math.max(this.camera.far, 500);
    this.camera.updateProjectionMatrix();
    this._connView = createConnectionsView(this.scene, {
      iso: dayIso, scope: this._connScope, camera: this.camera, controls: this.controls,
      onScope: (s) => this.enterConnectionsView(this._dayIso, s)
    });
    this._navLevel = "connections";
    this._ensureBackButton();
    this._updateBackButton();
    this._updateViewButtons();
  }

  /** Jump straight back to the YEAR overview from any level. */
  enterYearView() {
    this._connView?.dispose(); this._connView = null;
    this._dayView?.dispose();
    this._dayView = null;
    this._navMonthGrid?.dispose();
    this._navMonthGrid = null;
    if (this._monthGrid?.root) this._monthGrid.root.visible = true;
    this._monthGrid?.frameCamera(this.camera, this.controls);
    this._navLevel = "year";
    // Quick-add note bar is available at every level now (defaults to today; the
    // bar's own ‹ › day stepper lets you retarget any day).
    if (!this._editor) this._editor = new WordWeaver3DEditor(this);
    const _t = new Date();
    this._editor.showAddForToday(
      `${_t.getFullYear()}-${String(_t.getMonth() + 1).padStart(2, "0")}-${String(_t.getDate()).padStart(2, "0")}`
    );
    this._updateBackButton();
    this._updateViewButtons();
  }

  /**
   * Ray-cast the click onto the grid plane; return the nearest day's ISO in the
   * current month-view grid.
   * @param {PointerEvent} event
   * @returns {string | null}
   */
  _pickDayAt(event) {
    const cells = this._navMonthGrid?._layout?.cells;
    if (!cells?.length) return null;
    const rect = this.canvas.getBoundingClientRect();
    this._pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    if (!this._raycaster.ray.intersectPlane(plane, hit)) return null;
    let best = null;
    let bestD = Infinity;
    for (const c of cells) {
      const dx = hit.x - c.x;
      const dy = hit.y - c.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best ? best.iso : null;
  }

  _updateBackButton() {
    const btn = this._backBtn;
    if (!btn) return;
    if (this._navLevel === "year") {
      btn.style.display = "none";
    } else {
      btn.style.display = "block";
      btn.textContent = this._navLevel === "day" ? "← Back to month" : "← Back to year";
    }
  }

  /** Lazily create the "← Back" button shown when drilled into a month/day. */
  _ensureBackButton() {
    if (this._backBtn) return this._backBtn;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "← Back";
    btn.className = "ww-day-back-btn";
    Object.assign(btn.style, {
      position: "absolute",
      left: "12px",
      top: "108px", // sits below the Year/Month/Day view-button bar
      zIndex: "30",
      padding: "9px 15px",
      borderRadius: "10px",
      background: "rgba(8, 14, 28, 0.85)",
      color: "#e2e8f0",
      border: "1px solid rgba(120, 200, 255, 0.45)",
      font: "600 13px system-ui, sans-serif",
      cursor: "pointer",
      display: "none"
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.navBack();
    });
    (this.container || document.body).appendChild(btn);
    this._backBtn = btn;
    return btn;
  }

  /** Compact view-switch dropdown (Today / Day / Month / Year) to free header room. */
  _ensureViewButtons() {
    if (this._viewBtns) return this._viewBtns;
    const todayIso = () => {
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    };
    const goDay = (iso) => {
      this.enterMonthView(Number(iso.split("-")[1]) - 1); // month underneath so Back works
      this.enterDayViewIso(iso);
    };

    const wrap = document.createElement("div");
    wrap.className = "ww-view-dd";
    Object.assign(wrap.style, {
      position: "absolute", left: "12px", top: "64px", zIndex: "40",
      display: "none", font: "700 12px system-ui, sans-serif"
    });

    const toggle = document.createElement("button");
    toggle.type = "button";
    Object.assign(toggle.style, {
      display: "flex", alignItems: "center", gap: "6px", padding: "9px 13px",
      borderRadius: "10px", border: "1px solid rgba(120,200,255,0.45)",
      background: "rgba(8,14,28,0.9)", color: "#e0e7ff", cursor: "pointer",
      font: "inherit", boxShadow: "0 4px 14px rgba(0,0,0,0.4)"
    });
    toggle.innerHTML = `<span class="ww-view-dd-label">Year</span><span style="opacity:.6">▾</span>`;

    const menu = document.createElement("div");
    Object.assign(menu.style, {
      position: "absolute", left: "0", top: "calc(100% + 6px)", minWidth: "150px",
      display: "none", flexDirection: "column", borderRadius: "10px", overflow: "hidden",
      border: "1px solid rgba(120,200,255,0.45)", background: "rgba(8,14,28,0.97)",
      boxShadow: "0 10px 28px rgba(0,0,0,0.55)"
    });

    // Week is added to the menu once the 3D week view is built (stage 3).
    const items = [
      ["Today", "day", () => goDay(todayIso())],
      ["Day", "day", () => goDay(this._dayIso ?? todayIso())],
      ["Month", "month", () => this.enterMonthView(this._navMonthIndex ?? new Date().getMonth())],
      ["Year", "year", () => this.enterYearView()],
      ["🔗 Links", "connections", () => this.enterConnectionsView(this._dayIso ?? todayIso())]
    ];
    this._viewMenuItems = [];
    for (const [label, level, fn] of items) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.level = level; b.textContent = label;
      Object.assign(b.style, {
        padding: "11px 14px", border: "0", borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "transparent", color: "#cbd5e1", textAlign: "left", cursor: "pointer", font: "inherit"
      });
      b.addEventListener("click", (e) => { e.stopPropagation(); menu.style.display = "none"; fn(); });
      menu.appendChild(b);
      this._viewMenuItems.push(b);
    }

    const setMenuOpen = (open) => {
      menu.style.display = open ? "flex" : "none";
      // The "← Back" button overlaps the menu/day view — tuck it away while the
      // navigation menu is open, restore it (for the current level) when closed.
      if (this._backBtn) {
        if (open) this._backBtn.style.display = "none";
        else this._updateBackButton();
      }
    };
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setMenuOpen(menu.style.display !== "flex");
    });
    document.addEventListener("pointerdown", (e) => {
      if (!wrap.contains(e.target) && menu.style.display === "flex") setMenuOpen(false);
    });

    wrap.appendChild(toggle);
    wrap.appendChild(menu);
    (this.container || document.body).appendChild(wrap);
    this._viewBtns = wrap;
    this._viewToggleLabel = toggle.querySelector(".ww-view-dd-label");
    return wrap;
  }

  /** ‹ January › month stepper, shown only in the 3D month view. */
  _ensureMonthStepper() {
    if (this._monthStepper) return this._monthStepper;
    const wrap = document.createElement("div");
    wrap.className = "ww-month-stepper";
    Object.assign(wrap.style, {
      position: "absolute", left: "50%", top: "64px", transform: "translateX(-50%)",
      zIndex: "40", display: "none", alignItems: "center", gap: "6px",
      padding: "5px 8px", borderRadius: "12px", background: "rgba(8,14,28,0.9)",
      border: "1px solid rgba(120,200,255,0.45)", boxShadow: "0 4px 14px rgba(0,0,0,0.4)"
    });
    const mk = (txt, fn) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = txt;
      Object.assign(b.style, {
        background: "transparent", border: "0", color: "#e0e7ff", cursor: "pointer",
        font: "800 20px system-ui, sans-serif", lineHeight: "1", padding: "2px 10px"
      });
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
      return b;
    };
    const label = document.createElement("span");
    Object.assign(label.style, {
      color: "#e0e7ff", minWidth: "104px", textAlign: "center",
      font: "800 14px system-ui, sans-serif"
    });
    wrap.append(mk("‹", () => this._stepMonth(-1)), label, mk("›", () => this._stepMonth(1)));
    (this.container || document.body).appendChild(wrap);
    this._monthStepper = wrap;
    this._monthStepperLabel = label;
    return wrap;
  }

  /** Step the 3D month view by ±1, wrapping Dec↔Jan. */
  _stepMonth(delta) {
    const idx = (((this._navMonthIndex ?? new Date().getMonth()) + delta) % 12 + 12) % 12;
    this.enterMonthView(idx);
  }

  _updateMonthStepper() {
    this._ensureMonthStepper();
    const w = this._monthStepper;
    if (!w) return;
    const is3d = getCalendarMode() === "3d" && isWordWeaverTabActive();
    const show = is3d && this._navLevel === "month";
    w.style.display = show ? "flex" : "none";
    if (show && this._monthStepperLabel) {
      this._monthStepperLabel.textContent =
        new Date(2020, this._navMonthIndex ?? 0, 1).toLocaleString("default", { month: "long" });
    }
  }

  _updateViewButtons() {
    this._updateMonthStepper();
    const wrap = this._viewBtns;
    if (!wrap) return;
    const is3d = getCalendarMode() === "3d" && isWordWeaverTabActive();
    wrap.style.display = is3d ? "block" : "none";
    const labels = { year: "Year", month: "Month", day: "Day", connections: "Links" };
    if (this._viewToggleLabel) this._viewToggleLabel.textContent = labels[this._navLevel] ?? "View";
    for (const b of this._viewMenuItems ?? []) {
      const active = b.dataset.level === this._navLevel;
      b.style.background = active ? "#312e81" : "transparent";
      b.style.color = active ? "#e0e7ff" : "#cbd5e1";
    }
  }

  /**
   * Walk the selection through the day's notes (↑ = later, ↓ = earlier).
   * @param {number} dir +1 / -1
   */
  dayViewStep(dir) {
    // Step the day wheel one note (wraps). The carousel shows one at a time.
    this._dayView?.step?.(dir);
  }

  /** Highlight the selected note + pan the camera to scan to it. */
  _applyDaySelection() {
    const items = this._dayView?.items;
    if (!items?.length) {
      this.controls.target.set(0, 0.5, 0);
      this.camera.position.set(0, 0.5, 22);
      this.controls.update();
      return;
    }
    items.forEach((it, i) => {
      const on = i === this._daySel;
      it.mesh.scale.setScalar(on ? 1.75 : 1);
      const mat = it.mesh.material;
      if (mat && "emissiveIntensity" in mat) mat.emissiveIntensity = on ? 1.4 : 0.5;
    });
    const y = items[this._daySel].y;
    this.controls.target.set(2.4, y, 0);
    this.camera.position.set(2.4, y, 18);
    this.controls.update();
  }

  _tick() {
    const delta = this._clock.getDelta();
    const t = this._clock.elapsedTime;
    const now = performance.now();

    let layoutEase = 1;
    if (this._layoutEntranceMs > 0) {
      const elapsed = now - this._layoutEntranceStart;
      layoutEase = Math.min(1, elapsed / this._layoutEntranceMs);
      layoutEase = 1 - (1 - layoutEase) ** 3;
      if (elapsed >= this._layoutEntranceMs) this._layoutEntranceMs = 0;
    }

    if (this._nodeAnims.length) {
      this._updateNodeAnimations(now, layoutEase);
    }

    if (!this._monthGridLayoutActive) {
      this._atomOrbits?.update(t);
    }
    if (!this._renderPaused && getCalendarMode() === "3d" && isWordWeaverTabActive()) {
      this._updateCameraFocus(now);
      this._yearLayout?.update(delta, t, this.camera);
      this._monthGrid?.update(delta, t);
      this._dayView?.update?.(t);
      this._editor?.tick();
      this._connView?.update?.(t);
      if (this._monthGridLayoutActive) {
        this._updateGridFlight(delta);
      } else {
        this._timelineViewport?.update(delta);
      }
    }

    if (!this._monthGridLayoutActive) {
      const rotSpeed = this._layoutMode === "constellation" ? 0.05 : 0.08;
      const rotAmp =
        this._layoutMode === "street" || this._layoutMode === "river"
          ? 0.015
          : this._layoutMode === "tree"
            ? 0.025
            : 0.04;
      this.weaveGroup.rotation.y = Math.sin(t * rotSpeed) * rotAmp;
    }

    this.controls.update();
    this._meshes.forEach((m, i) => m.animatePulse?.(0.35 + (i % 3) * 0.05));
    if (!this._renderPaused && getCalendarMode() === "3d" && isWordWeaverTabActive()) {
      this.renderer.render(this.scene, this.camera);
    }
    this._raf = requestAnimationFrame(this._tick);
  }

  dispose() {
    this._offCalendarMode?.();
    this._offCalendarMode = null;
    if (this._onShellSurface) {
      document.removeEventListener("inkling:shell-surface", this._onShellSurface);
      this._onShellSurface = null;
    }
    if (this._timelineBusDisposers) {
      disposeTimelineDataChange(this._timelineBusDisposers);
      this._timelineBusDisposers = null;
    }
    this._onTimelineUpdated = null;
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this._resizeObserver?.disconnect();
    this._atomOrbits?.dispose();
    this._atomOrbits = null;
    this._connView?.dispose();
    this._connView = null;
    this._dayView?.dispose();
    this._dayView = null;
    this._editor?.dispose();
    this._editor = null;
    this._monthGrid?.dispose();
    this._monthGrid = null;
    this._yearLayout?.dispose();
    this._yearLayout = null;
    this._timelineViewport?.dispose();
    this._timelineViewport = null;
    this._disposeEnvironmentGlb();
    disposeWeaveMeshes(this._meshes);
    this.weaveGroup.clear();
    this.setEditGuide(null, false);
    this.controls.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

const COL_SPACING = 1.5;
const ROW_SPACING = 2;
const WEEK_HALO_HEX = ["#00ffff", "#aa00ff", "#0044ff", "#00ccff"];
const YEAR_RING_RADIUS = 26;
const MONTH_LABEL_Y = 5.2;

/**
 * @param {string} monthName
 * @param {number} year
 */
function createMonthLabelMesh(monthName, year) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "700 42px system-ui, sans-serif";
    ctx.fillStyle = "#a8f6ff";
    ctx.shadowColor = "#00ffff";
    ctx.shadowBlur = 16;
    ctx.fillText(monthName, 24, 52);
    ctx.font = "600 28px system-ui, sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(String(year), 24, 92);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    emissive: new THREE.Color("#00ffff"),
    emissiveIntensity: 0.55,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), mat);
  mesh.renderOrder = 10;
  mesh.userData.isMonthLabel = true;
  return { mesh, mat, tex };
}

/**
 * Build one month cluster (grid + halos + atoms + label).
 * @param {THREE.Group} cluster
 * @param {number} year
 * @param {number} month 1–12
 * @param {number} monthIndex 0–11
 * @param {{ time: string, text: string, category: string }[]} initialNotes
 * @param {import("./DayBlock3D.js").DayBlock3D[]} dayBlocksOut
 * @param {AtomGlyph3D[]} atomsOut
 * @param {THREE.Mesh[]} halosOut
 */
function enrichDayEvents(rawEvents) {
  return rawEvents.map((ev) => {
    const classified = classifyEvent(ev.text ?? "");
    const cat = ev.category === "errand" ? "errands" : ev.category ?? classified.category;
    return {
      time: ev.time,
      text: ev.text,
      category: cat,
      kind: ev.kind,
      alertId: ev.alertId,
      icon:
        ev.alertId || ev.kind === "alarm" || ev.kind === "reminder"
          ? "⏰"
          : ev.kind === "appointment"
            ? "📅"
            : classified.icon,
      color: classified.color,
      priority: classified.priority
    };
  });
}

function populateMonthCluster(cluster, year, month, monthIndex, initialNotes, dayBlocksOut, atomsOut, halosOut) {
  const today = todayIsoDate();
  const first = new Date(year, month - 1, 1);
  const monOffset = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const weekCount = Math.ceil((monOffset + daysInMonth) / 7);

  for (let w = 0; w < weekCount; w++) {
    const colorHex = WEEK_HALO_HEX[w % WEEK_HALO_HEX.length];
    const haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(7 * COL_SPACING + 0.6, ROW_SPACING * 0.85),
      haloMat
    );
    halo.position.set(0, -w * ROW_SPACING, -0.15);
    cluster.add(halo);
    halosOut.push(halo);
  }

  const atomCount = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < atomCount; i++) {
    const scale = 2 + Math.random() * 3;
    const opacity = 0.1 + Math.random() * 0.1;
    const atom = AtomGlyph3D.createBackground({
      scale,
      opacity,
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 9,
        -Math.random() * weekCount * ROW_SPACING * 0.4,
        -2.5 - Math.random() * 2.5
      )
    });
    cluster.add(atom.group);
    atomsOut.push(atom);
  }

  const monthName = first.toLocaleDateString(undefined, { month: "long" });
  const label = createMonthLabelMesh(monthName, year);
  label.mesh.position.set(0, MONTH_LABEL_Y, 0.2);
  cluster.add(label.mesh);

  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    let dayEvents = enrichDayEvents(getEventsForDay(year, monthIndex, day));

    if (iso === today && !dayEvents.length && initialNotes?.length) {
      dayEvents = enrichDayEvents(
        initialNotes.map((n) => ({
          time: n.time,
          text: n.text,
          category: n.category,
          kind: "timeline"
        }))
      );
    }

    const cellIndex = monOffset + day - 1;
    const col = cellIndex % 7;
    const row = Math.floor(cellIndex / 7);
    const x = (col - 3) * COL_SPACING;
    const y = -row * ROW_SPACING;
    const cat = dayEvents[0]?.category ?? "personal";

    const block = new DayBlock3D({
      day,
      dateIso: iso,
      events: dayEvents,
      glowColor: getCategoryColor(cat),
      isToday: iso === today,
      useSharedMaterials: true,
      monthIndex
    });
    block.group.position.set(x, y, 0.05);
    block.group.userData.dayBlock = block;
    cluster.add(block.group);
    dayBlocksOut.push(block);
  }

  return label;
}

/**
 * Full 12-month ring layout for WordWeaver 3D mode.
 */
class WordWeaverYearLayout3D {
  /**
   * @param {THREE.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = "ww-year-layout-3d";
    scene.add(this.root);
    /** @type {import("./DayBlock3D.js").DayBlock3D[]} */
    this.dayBlocks = [];
    /** @type {AtomGlyph3D[]} */
    this.bgAtoms = [];
    /** @type {THREE.Mesh[]} */
    this.weekHalos = [];
    /** @type {Array<{ group: THREE.Group, monthIndex: number, label: THREE.Mesh }>} */
    this.monthClusters = [];
    /** @type {import("./DayBlock3D.js").DayBlock3D | null} */
    this.focusedDay = null;
  }

  /**
   * @param {{ time: string, text: string, category: string }[]} initialNotes
   */
  build(initialNotes) {
    this._clear();
    const year = new Date().getFullYear();

    for (let month = 1; month <= 12; month++) {
      const monthIndex = month - 1;
      const cluster = new THREE.Group();
      cluster.name = `month-cluster-${month}`;

      const angle = (monthIndex / 12) * Math.PI * 2 - Math.PI / 2;
      cluster.position.set(
        Math.cos(angle) * YEAR_RING_RADIUS,
        0,
        Math.sin(angle) * YEAR_RING_RADIUS
      );
      cluster.lookAt(0, 0, 0);

      const label = populateMonthCluster(
        cluster,
        year,
        month,
        monthIndex,
        initialNotes,
        this.dayBlocks,
        this.bgAtoms,
        this.weekHalos
      );

      this.root.add(cluster);
      this.monthClusters.push({ group: cluster, monthIndex, label: label.mesh });
    }
  }

  /**
   * @param {number} monthIndex 0–11
   * @param {number} dayIndex 1–31
   * @returns {import("./DayBlock3D.js").DayBlock3D | undefined}
   */
  findDayBlock(monthIndex, dayIndex) {
    return this.dayBlocks.find(
      (b) => b.monthIndex === monthIndex && b.day === dayIndex
    );
  }

  /**
   * @param {number} delta
   * @param {number} elapsed
   * @param {THREE.PerspectiveCamera} camera
   */
  update(delta, elapsed, camera) {
    for (const atom of this.bgAtoms) atom.update(delta);

    const bob = Math.sin(elapsed * 1.4) * 0.12;
    for (const { label } of this.monthClusters) {
      if (label) label.position.y = MONTH_LABEL_Y + bob;
    }

    const camPos = camera.position;
    for (const block of this.dayBlocks) {
      const world = new THREE.Vector3();
      block.group.getWorldPosition(world);
      const dist = camPos.distanceTo(world);
      const isFocused = block === this.focusedDay;
      block.setProximity(isFocused || dist < 4.2);
      block.update(delta, elapsed, camera);
    }
  }

  _clear() {
    this.focusedDay = null;
    for (const block of this.dayBlocks) {
      block.dispose();
    }
    this.dayBlocks = [];

    for (const atom of this.bgAtoms) {
      atom.dispose();
    }
    this.bgAtoms = [];

    for (const halo of this.weekHalos) {
      halo.geometry.dispose();
      halo.material.dispose();
    }
    this.weekHalos = [];

    while (this.root.children.length) {
      this.root.remove(this.root.children[0]);
    }
    this.monthClusters = [];
  }

  dispose() {
    this._clear();
    this.scene.remove(this.root);
  }
}

/**
 * Create the full 3D year layout (12 month clusters in a ring).
 * @param {THREE.Scene} scene
 * @param {{ time: string, text: string, category: string }[]} initialNotes
 * @returns {WordWeaverYearLayout3D}
 */
export function createYearLayout(scene, initialNotes) {
  const layout = new WordWeaverYearLayout3D(scene);
  layout.build(initialNotes);
  return layout;
}

/**
 * @param {THREE.Scene} scene
 * @param {{ time: string, text: string, category: string }[]} initialNotes
 */
export function loadMonthView(scene, initialNotes) {
  return createYearLayout(scene, initialNotes);
}
