import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { disposeWeaveMeshes, layoutSegmentWeave } from "./layoutSegmentWeave.js";
import { getActiveCustomLayout } from "./customLayout.js";

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
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.Fog(0x05060a, 8, 22);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    this.camera.position.set(0, 2.4, 8.2);
    this._cameraHome = this.camera.position.clone();
    this._entranceStart = 0;
    this._entranceMs = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 1.1, 0);
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.minDistance = 3.5;
    this.controls.maxDistance = 16;

    const amb = new THREE.AmbientLight(0x404060, 0.9);
    const key = new THREE.DirectionalLight(0x7dd3fc, 0.85);
    key.position.set(4, 8, 6);
    const rim = new THREE.PointLight(0x4ee6e6, 0.4, 20);
    rim.position.set(-3, 4, 2);
    this.scene.add(amb, key, rim);

    this.weaveGroup = new THREE.Group();
    this.guideGroup = new THREE.Group();
    this.scene.add(this.weaveGroup);
    this.scene.add(this.guideGroup);

    this._layoutMode = "street";
    /** @type {import('../inkling-core/timelineNode.js').SegmentModule | null} */
    this._lastModule = null;
    this._meshes = [];
    this._pickables = [];
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
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  }

  /**
   * @param {import('./layoutModes.js').WeaveLayoutMode} mode
   */
  setLayoutMode(mode) {
    this._layoutMode = mode;
  }

  /**
   * Visual guides while editing custom layout (floor ring, height pillar, depth plane).
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
   * @param {{ immersive?: boolean, skipEntrance?: boolean, customParams?: object, editGuide?: boolean }} [opts]
   */
  setModule(module, opts = {}) {
    this._lastModule = module;
    disposeWeaveMeshes(this._meshes);
    this.weaveGroup.clear();
    this._meshes = [];
    this._pickables = [];

    const customParams = opts.customParams ?? (this._layoutMode === "custom" ? getActiveCustomLayout() : null);
    const { disposed, pickables } = layoutSegmentWeave(
      module,
      this.weaveGroup,
      this._layoutMode,
      customParams
    );
    this._meshes = disposed;
    this._pickables = pickables;

    if (opts.editGuide && customParams) {
      this.setEditGuide(customParams, true);
    } else if (!opts.keepGuide) {
      this.setEditGuide(null, false);
    }

    this.controls.update();

    if (opts.skipEntrance) {
      this._entranceMs = 0;
      this.camera.position.lerp(this._cameraHome, 0.2);
    } else if (opts.immersive) {
      this._entranceStart = performance.now();
      this._entranceMs = 1400;
      this.camera.position.set(0, 3.2, 14);
    } else {
      this._entranceMs = 0;
      this.camera.position.copy(this._cameraHome);
    }
  }

  /**
   * Rebuild weave using new custom params (live editor).
   * @param {import('./customLayout.js').CustomLayoutParams} params
   */
  relayoutCustom(params) {
    if (!this._lastModule || this._layoutMode !== "custom") return;
    this.setModule(this._lastModule, {
      customParams: params,
      skipEntrance: true,
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
    const t = this._clock.getElapsedTime();

    if (this._entranceMs > 0) {
      const elapsed = performance.now() - this._entranceStart;
      const p = Math.min(1, elapsed / this._entranceMs);
      const ease = 1 - (1 - p) ** 3;
      this.camera.position.lerpVectors(
        new THREE.Vector3(0, 3.2, 14),
        this._cameraHome,
        ease
      );
      if (p >= 1) this._entranceMs = 0;
    }

    this.weaveGroup.rotation.y = Math.sin(t * 0.08) * 0.04;
    this.controls.update();
    this._meshes.forEach((m, i) => m.animatePulse?.(0.35 + (i % 3) * 0.05));
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame(this._tick);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this._resizeObserver?.disconnect();
    disposeWeaveMeshes(this._meshes);
    this.weaveGroup.clear();
    this.setEditGuide(null, false);
    this.controls.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
