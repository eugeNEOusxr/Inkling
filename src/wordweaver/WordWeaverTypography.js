import {
  LETTER_FONT_OPTIONS,
  loadLetterTypographySettings,
  saveLetterTypographySettings,
  parseColorToHex,
  hexToCssColor,
  fontOptionIdForFamily
} from "./letterTypography.js";

/**
 * Binds font / size / color controls for floating 3D letters.
 */
export class WordWeaverTypography {
  constructor() {
    this.fontSelect = document.getElementById("wordweaver-font-family");
    this.sizeInput = document.getElementById("wordweaver-font-size");
    this.sizeValue = document.getElementById("wordweaver-font-size-value");
    this.colorInput = document.getElementById("wordweaver-font-color");
    this.panel = document.getElementById("wordweaver-typography");
    this._settings = loadLetterTypographySettings();
    this._onChange = null;
    this._populateFonts();
    this._syncControls();
    this._bind();
  }

  /**
   * @param {() => void} fn
   */
  setOnChange(fn) {
    this._onChange = fn;
  }

  _populateFonts() {
    if (!this.fontSelect || this.fontSelect.options.length) return;
    for (const opt of LETTER_FONT_OPTIONS) {
      const el = document.createElement("option");
      el.value = opt.id;
      el.textContent = opt.label;
      this.fontSelect.appendChild(el);
    }
  }

  _syncControls() {
    if (this.fontSelect) {
      this.fontSelect.value = fontOptionIdForFamily(this._settings.fontFamily);
    }
    if (this.sizeInput) {
      this.sizeInput.value = String(this._settings.fontSize);
    }
    if (this.sizeValue) {
      this.sizeValue.textContent = this._settings.fontSize.toFixed(1);
    }
    if (this.colorInput) {
      this.colorInput.value = hexToCssColor(this._settings.color);
    }
  }

  _bind() {
    this.fontSelect?.addEventListener("change", () => {
      const id = this.fontSelect.value;
      const hit = LETTER_FONT_OPTIONS.find((f) => f.id === id);
      if (hit) this._settings.fontFamily = hit.family;
      this._persistAndNotify();
    });
    this.sizeInput?.addEventListener("input", () => {
      this._settings.fontSize = Number(this.sizeInput.value) || 0.72;
      if (this.sizeValue) this.sizeValue.textContent = this._settings.fontSize.toFixed(1);
      this._persistAndNotify();
    });
    this.colorInput?.addEventListener("input", () => {
      this._settings.color = parseColorToHex(this.colorInput.value);
      this._settings.glowColor = this._settings.color;
      this._persistAndNotify();
    });
  }

  _persistAndNotify() {
    this._settings = saveLetterTypographySettings(this._settings);
    this._onChange?.();
  }

  /**
   * @param {boolean} visible
   */
  setPanelVisible(visible) {
    this.panel?.classList.toggle("hidden", !visible);
  }

  /**
   * @returns {import('./letterTypography.js').LetterTypography}
   */
  getSettings() {
    return { ...this._settings };
  }
}
