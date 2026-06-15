import * as THREE from "three";
import { loadWordCatalog, spawnHousesFromCatalog } from "./wordCatalog.js";
import { buildNeighborhood } from "./neighborhoodBuilder.js";
import { createThirdPersonController } from "./thirdPersonController.js";
import { createMobileWalkControls } from "./mobileWalkControls.js";
import { openHousePanel, closeHousePanel } from "./housePanel.js";

/**
 * WorldWeaver neighborhood — mobile 3D word district inside Inkling.
 */
export class NeighborhoodScene {
  /**
   * @param {HTMLElement} mountEl
   * @param {{ onDistrictName?: (name: string) => void }} [opts]
   */
  constructor(mountEl, opts = {}) {
    this.mountEl = mountEl;
    this.opts = opts;
    this._raf = 0;
    this._clock = new THREE.Clock();
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._pickables = [];
    this._disposed = false;
  }

  async start() {
    const catalog = await loadWordCatalog();
    this.opts.onDistrictName?.(catalog.districtName ?? "Neighborhood");
    const entries = spawnHousesFromCatalog(catalog);

    const w = this.mountEl.clientWidth || window.innerWidth;
    const h = this.mountEl.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "low-power" });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x87b8e8);
    this.mountEl.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x9ec8e8, 18, 55);

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.2, 80);
    this.camera.position.set(0, 4, 10);

    const amb = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(amb);
    const sun = new THREE.DirectionalLight(0xfff5e6, 0.85);
    sun.position.set(12, 18, 8);
    this.scene.add(sun);

    const built = buildNeighborhood(this.scene, entries);
    this._pickables = built.houses.map((h) => h.pickMesh);

    this.player = createThirdPersonController(this.scene, this.camera);
    this.player.avatar.position.set(0, 0, 2);

    this.walkControls = createMobileWalkControls(this.mountEl);
    this._bindResize();
    this._bindTap();
    this._loop();
  }

  _bindResize() {
    this._onResize = () => {
      if (this._disposed || !this.renderer) return;
      const w = this.mountEl.clientWidth || window.innerWidth;
      const h = this.mountEl.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener("resize", this._onResize);
  }

  _bindTap() {
    const dom = this.renderer.domElement;
    const onTap = (clientX, clientY) => {
      const rect = dom.getBoundingClientRect();
      this._pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this._pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      this._raycaster.setFromCamera(this._pointer, this.camera);
      const hits = this._raycaster.intersectObjects(this._pickables, true);
      const hit = hits.find((h) => h.object?.userData?.wordHouse);
      if (hit?.object?.userData?.wordHouse) {
        openHousePanel(hit.object.userData.wordHouse);
      }
    };

    let touchStart = null;
    dom.addEventListener(
      "pointerdown",
      (e) => {
        if (e.target.closest?.(".ww-nb-joystick")) return;
        touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      },
      { passive: true }
    );
    dom.addEventListener(
      "pointerup",
      (e) => {
        if (!touchStart) return;
        const dx = e.clientX - touchStart.x;
        const dy = e.clientY - touchStart.y;
        const dt = performance.now() - touchStart.t;
        touchStart = null;
        if (Math.hypot(dx, dy) < 14 && dt < 400) onTap(e.clientX, e.clientY);
      },
      { passive: true }
    );
  }

  _loop() {
    const tick = () => {
      if (this._disposed) return;
      this._raf = requestAnimationFrame(tick);
      const dt = Math.min(this._clock.getDelta(), 0.05);
      const input = this.walkControls?.getInput() ?? { moveX: 0, moveZ: 0 };
      this.player?.update(dt, input);
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  dispose() {
    this._disposed = true;
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    closeHousePanel();
    this.walkControls?.destroy();
    this.renderer?.dispose();
    this.renderer?.domElement?.remove();
    this.scene?.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
  }
}
