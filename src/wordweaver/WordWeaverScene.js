import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { disposeWeaveMeshes, layoutSegmentWeave } from "./layoutSegmentWeave.js";
import { getActiveCustomLayout } from "./customLayout.js";
import { getCameraFrameForLayout } from "./layoutModes.js";
import { WordWeaverAtomOrbits } from "./WordWeaverAtomOrbits.js";
import { getActivePalette } from "../theme/appearancePalettes.js";
import { mountWordWeaverTimeline } from "./WordWeaverTimelineViewport.js";
import { on, off } from "./EventBus.js";

/** Served from public/environments/ (copied from Meshy export). */
const WORDWEAVER_ENV_GLB_URL = "/environments/meshy-dark-futuristic.glb";
const ENV_LAYER = 0;
const CONTENT_LAYER = 1;

const _envLoader = new GLTFLoader();

/**
 * WordWeaver 3D viewport — spatial thought-weaving with multiple layout modes.
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
    this.scene.background = null;
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
    this._applyForegroundLayers();
    this._onTimelineUpdated = () => this._applyForegroundLayers();
    on("timelineUpdated", this._onTimelineUpdated);
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
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

  /** Timeline / weave content on layer 1; GLB environment stays on layer 0. */
  _applyForegroundLayers() {
    this.weaveGroup?.layers.set(CONTENT_LAYER);
    this.guideGroup?.layers.set(CONTENT_LAYER);
    const timelineRoot = this._timelineViewport?.timeline3d?.root;
    timelineRoot?.layers.set(CONTENT_LAYER);
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
    return targets;
  }

  _pick(event) {
    this._pointerToNdc(event);
    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this._raycaster.intersectObjects(this._collectClickTargets(), false);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData?.node && o.parent) o = o.parent;
    return o?.userData?.node ?? null;
  }

  _handlePointerMove(event) {
    const node = this._pick(event);
    const next = node?.id ?? null;
    if (next !== this._hovered) {
      this._hovered = next;
      this.canvas.style.cursor = next ? "pointer" : "grab";
    }
  }

  _handlePointerDown(event) {
    const node = this._pick(event);
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    this.onNodeClick({
      date: node.date,
      time: node.time,
      text: node.text,
      node
    });
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

    this._atomOrbits?.update(t);
    this._timelineViewport?.update(delta);

    const rotSpeed = this._layoutMode === "constellation" ? 0.05 : 0.08;
    const rotAmp =
      this._layoutMode === "street" || this._layoutMode === "river"
        ? 0.015
        : this._layoutMode === "tree"
          ? 0.025
          : 0.04;
    this.weaveGroup.rotation.y = Math.sin(t * rotSpeed) * rotAmp;

    this.controls.update();
    this._meshes.forEach((m, i) => m.animatePulse?.(0.35 + (i % 3) * 0.05));
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame(this._tick);
  }

  dispose() {
    if (this._onTimelineUpdated) {
      off("timelineUpdated", this._onTimelineUpdated);
      this._onTimelineUpdated = null;
    }
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this._resizeObserver?.disconnect();
    this._atomOrbits?.dispose();
    this._atomOrbits = null;
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
