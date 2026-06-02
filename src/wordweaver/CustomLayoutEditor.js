import {
  loadCustomLayout,
  saveCustomLayout,
  setCustomLayoutOverride,
  DEFAULT_CUSTOM_LAYOUT
} from "./customLayout.js";
import { scheduleWordWeaverCloudSync } from "./wordweaverCloudSync.js";

/**
 * Sliders tune custom 3D placement — changes apply live in the viewport.
 */
export class CustomLayoutEditor {
  /**
   * @param {{ onPreviewStart?: () => void, onPreview?: (params: object) => void, onSave?: (params: object) => void }} opts
   */
  constructor(opts = {}) {
    this.onPreviewStart = opts.onPreviewStart ?? (() => {});
    this.onPreview = opts.onPreview ?? (() => {});
    this.onSave = opts.onSave ?? (() => {});
    this.el = document.getElementById("wordweaver-layout-editor");
    this.toggleBtn = document.getElementById("wordweaver-layout-edit-btn");
    this.syncStatusEl = document.getElementById("wordweaver-layout-sync-status");
    this.params = loadCustomLayout();
    this._built = false;
    this._isOpen = false;

    this.toggleBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._ensureBuilt();
      const opening = this.el?.classList.contains("hidden");
      this.el?.classList.toggle("hidden");
      this._isOpen = !this.el?.classList.contains("hidden");
      if (opening && this._isOpen) {
        this.params = loadCustomLayout();
        this._syncSliders();
        this.onPreviewStart();
        this._previewNow();
      }
    });

    this.el?.addEventListener("click", (e) => e.stopPropagation());
  }

  _ensureBuilt() {
    if (!this.el || this._built) return;
    this._built = true;
    this.el.innerHTML = `
      <header class="ww-layout-editor__head">
        <h3>Custom layout editor</h3>
        <button type="button" class="ww-layout-editor__close" aria-label="Close">×</button>
      </header>
      <p class="ww-layout-editor__lead">Drag sliders — signs move in the 3D space immediately. Aqua ring = spread, gold pillar = height, purple plane = depth.</p>
      ${this._sliderRow("verticalStep", "Vertical spacing", 0.3, 1.5, 0.02)}
      ${this._sliderRow("horizontalSpread", "Horizontal spread", 0, 2.5, 0.05)}
      ${this._sliderRow("depthSpread", "Depth", 0, 2, 0.05)}
      ${this._sliderRow("spiralTwist", "Spiral twist", 0, 0.55, 0.01)}
      ${this._sliderRow("yBase", "Base height", 0, 1.5, 0.05)}
      <label class="ww-layout-editor__name">
        Layout name
        <input type="text" data-field="name" maxlength="24" />
      </label>
      <p id="wordweaver-layout-sync-status" class="ww-layout-editor__sync" aria-live="polite"></p>
      <div class="ww-layout-editor__actions">
        <button type="button" data-action="apply" class="btn-primary btn-ghost--sm">Save &amp; sync</button>
        <button type="button" data-action="reset" class="btn-ghost btn-ghost--sm">Reset defaults</button>
      </div>
    `;

    this.syncStatusEl = this.el.querySelector("#wordweaver-layout-sync-status");

    this.el.querySelector(".ww-layout-editor__close")?.addEventListener("click", () => {
      this.el?.classList.add("hidden");
      this._isOpen = false;
    });

    this.el.querySelector('[data-field="name"]')?.addEventListener("input", (e) => {
      this.params.name = e.target.value.trim() || "My layout";
      this._previewNow();
    });

    this.el.querySelectorAll("[data-param]").forEach((input) => {
      const key = input.getAttribute("data-param");
      const out = this.el.querySelector(`[data-out="${key}"]`);
      input.addEventListener("input", () => {
        this.params[key] = Number(input.value);
        if (out) out.textContent = Number(input.value).toFixed(2);
        this._previewNow();
      });
    });

    this.el.querySelector('[data-action="apply"]')?.addEventListener("click", () => {
      const saved = saveCustomLayout(this.params);
      setCustomLayoutOverride(saved);
      this.onSave(saved);
      scheduleWordWeaverCloudSync({ customLayout: saved, layoutMode: "custom" });
      this._setSyncStatus("Saved to device & cloud");
      this.onPreview(saved);
      this.el?.classList.add("hidden");
      this._isOpen = false;
    });

    this.el.querySelector('[data-action="reset"]')?.addEventListener("click", () => {
      this.params = { ...DEFAULT_CUSTOM_LAYOUT };
      saveCustomLayout(this.params);
      this._syncSliders();
      this._previewNow();
      scheduleWordWeaverCloudSync({ customLayout: this.params, layoutMode: "custom" });
    });

    this._syncSliders();
  }

  _previewNow() {
    setCustomLayoutOverride(this.params);
    this.onPreview({ ...this.params });
  }

  _setSyncStatus(msg) {
    if (this.syncStatusEl) this.syncStatusEl.textContent = msg;
  }

  _sliderRow(key, label, min, max, step) {
    const val = this.params[key] ?? DEFAULT_CUSTOM_LAYOUT[key];
    return `
      <label class="ww-layout-editor__row">
        <span>${label}</span>
        <input type="range" data-param="${key}" min="${min}" max="${max}" step="${step}" value="${val}" />
        <output data-out="${key}">${Number(val).toFixed(2)}</output>
      </label>`;
  }

  _syncSliders() {
    if (!this.el) return;
    this.el.querySelectorAll("[data-param]").forEach((input) => {
      const key = input.getAttribute("data-param");
      input.value = String(this.params[key]);
      const out = this.el.querySelector(`[data-out="${key}"]`);
      if (out) out.textContent = Number(this.params[key]).toFixed(2);
    });
    const nameInput = this.el.querySelector('[data-field="name"]');
    if (nameInput) nameInput.value = this.params.name || "My layout";
  }

  getParams() {
    return { ...this.params };
  }

  isOpen() {
    return this._isOpen;
  }
}
