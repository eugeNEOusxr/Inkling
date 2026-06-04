import * as THREE from "three";
import { TimelineLayout } from "./TimelineLayout.js";
import { preloadReal3DFont } from "./Real3DText.js";
import { ensureTimelineSeeded, loadTimeline } from "../data/timelineModel.js";

/**
 * Three.js renderer for the WordWeaver Depth Staircase timeline.
 */
export class TimelineRenderer {
  /** @type {TimelineRenderer | null} */
  static _active = null;

  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
    this._raf = 0;
    this._clock = new THREE.Clock();
    this._disposed = false;
    this._refreshing = false;

    TimelineRenderer._active = this;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060a14);
    this.scene.fog = new THREE.Fog(0x060a14, 6, 18);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    this.camera.position.set(0, 1.5, 3);
    this.camera.lookAt(0, 1.5, -0.3);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    const ambient = new THREE.AmbientLight(0x8fa3c7, 0.55);
    const key = new THREE.DirectionalLight(0xfff4c2, 1.15);
    key.position.set(2.5, 4, 3);
    const fill = new THREE.DirectionalLight(0x38bdf8, 0.45);
    fill.position.set(-2, 1.5, 2);
    const rim = new THREE.PointLight(0xffd700, 0.8, 12);
    rim.position.set(0, 2.5, -1);
    this.scene.add(ambient, key, fill, rim);

    /** @type {TimelineLayout | null} */
    this.layout = null;

    this._onResize = () => this.handleResize();
    window.addEventListener("resize", this._onResize);
    this.handleResize();
  }

  async loadTimeline() {
    await ensureTimelineSeeded();
    if (this._disposed) return;

    const entries = loadTimeline();

    await preloadReal3DFont();
    if (this._disposed) return;

    this.layout?.dispose();
    this.layout = new TimelineLayout(this.scene, entries);
  }

  async refresh() {
    if (this._disposed || this._refreshing) return;
    this._refreshing = true;
    try {
      await this.loadTimeline();
    } finally {
      this._refreshing = false;
    }
  }

  handleResize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  _tick = () => {
    if (this._disposed) return;
    this._raf = requestAnimationFrame(this._tick);
    const delta = this._clock.getDelta();
    this.layout?.update(delta);
    this.renderer.render(this.scene, this.camera);
  };

  start() {
    cancelAnimationFrame(this._raf);
    this._clock.start();
    this._tick();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (TimelineRenderer._active === this) {
      TimelineRenderer._active = null;
    }
    cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    this.layout?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /**
   * Rebuild the active 3D scene from timelineModel.
   * @returns {Promise<void>}
   */
  static async refresh() {
    const active = TimelineRenderer._active;
    if (!active || active._disposed) return;
    await active.refresh();
  }

  /**
   * Mount into a DOM selector or element.
   * @param {string | HTMLElement} target
   * @returns {Promise<TimelineRenderer>}
   */
  static async mount(target) {
    const el =
      typeof target === "string"
        ? document.querySelector(target)
        : target;
    if (!el) {
      throw new Error(`[TimelineRenderer] mount target not found: ${target}`);
    }

    const instance = new TimelineRenderer(el);
    await instance.loadTimeline();
    instance.start();
    return instance;
  }
}
