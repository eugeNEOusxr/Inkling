/**
 * Full-screen modal layers — shared backdrop, body classes, enter/exit motion.
 */
const LAYER_IDS = ["calendar-max", "day-notes", "writer", "wordweaver", "inkling"];

export class LayerManager {
  constructor() {
    this.active = null;
    this._backdrop = document.getElementById("inkling-stage-backdrop");
    this._onBackdropClick = null;
  }

  /**
   * @param {() => void} fn
   */
  setBackdropHandler(fn) {
    this._onBackdropClick = fn;
    if (!this._backdrop || this._backdrop.dataset.layerBound) return;
    this._backdrop.dataset.layerBound = "1";
    this._backdrop.addEventListener("click", () => this._onBackdropClick?.());
  }

  /**
   * @param {string} layerId
   * @param {{ element?: HTMLElement }} [opts]
   */
  open(layerId, opts = {}) {
    if (!LAYER_IDS.includes(layerId)) return;
    if (this.active === layerId) return;

    const prev = this.active;
    if (prev) this._deactivate(prev);

    this.active = layerId;
    document.body.classList.add("inkling-fullscreen-layer-open", `inkling-layer--${layerId}`);
    this._setBackdrop(true);

    const el = opts.element ?? document.querySelector(`[data-inkling-layer="${layerId}"]`);
    if (el) {
      el.classList.remove("hidden", "inkling-layer-exit", "inkling-layer-exit-active");
      el.setAttribute("aria-hidden", "false");
      el.classList.add("inkling-layer-enter");
      requestAnimationFrame(() => {
        el.classList.add("inkling-layer-enter-active");
        el.classList.remove("inkling-layer-enter");
      });
    }
  }

  /**
   * @param {string} [layerId] — defaults to active layer
   */
  close(layerId) {
    const id = layerId ?? this.active;
    if (!id) return;
    this._deactivate(id);
    if (this.active === id) this.active = null;
    if (!this.active) {
      document.body.classList.remove("inkling-fullscreen-layer-open");
      LAYER_IDS.forEach((lid) => document.body.classList.remove(`inkling-layer--${lid}`));
      this._setBackdrop(false);
    }
  }

  closeAll() {
    const id = this.active;
    if (id) this._deactivate(id);
    this.active = null;
    document.body.classList.remove("inkling-fullscreen-layer-open");
    LAYER_IDS.forEach((lid) => document.body.classList.remove(`inkling-layer--${lid}`));
    this._setBackdrop(false);
  }

  isOpen(layerId) {
    return this.active === layerId;
  }

  getActive() {
    return this.active;
  }

  _deactivate(layerId) {
    document.body.classList.remove(`inkling-layer--${layerId}`);
    const el = document.querySelector(`[data-inkling-layer="${layerId}"]`);
    if (el) {
      el.classList.add("inkling-layer-exit");
      requestAnimationFrame(() => {
        el.classList.add("inkling-layer-exit-active");
        el.classList.remove("inkling-layer-enter-active");
      });
      const done = () => {
        el.classList.remove("inkling-layer-exit", "inkling-layer-exit-active");
        if (this.active !== layerId) {
          el.classList.add("hidden");
          el.setAttribute("aria-hidden", "true");
        }
        el.removeEventListener("transitionend", done);
      };
      el.addEventListener("transitionend", done);
      setTimeout(done, 420);
    }
  }

  _setBackdrop(show) {
    this._backdrop?.classList.toggle("hidden", !show);
    this._backdrop?.setAttribute("aria-hidden", String(!show));
    document.body.classList.toggle("inkling-stage-backdrop-on", show);
  }
}
