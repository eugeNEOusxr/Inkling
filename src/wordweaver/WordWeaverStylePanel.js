import {
  GEOMETRY_STYLES,
  FONT_STYLES,
  MATERIAL_STYLES,
  COLOR_SCHEME_VALUES,
  GEOMETRY_ENHANCEMENTS,
  LIGHTING_STYLES,
  ANIMATION_STYLES,
  HYBRID_STYLES,
  STYLE_PRESETS
} from "./weaveTextStyleCatalog.js";
import {
  loadWeaveTextStyleSettings,
  saveWeaveTextStyleSettings,
  applyStylePreset,
  colorsHexStringsFromStyle,
  parseColorArrayInput,
  fontSizeToPoints,
  pointsToFontSize
} from "./weaveTextStyleSettings.js";
import { hexToCssColor } from "./letterTypography.js";

/**
 * WordWeaver 3D text style picker — geometry, font, material, presets.
 */
export class WordWeaverStylePanel {
  constructor() {
    this.root = document.getElementById("wordweaver-text-style-panel");
    this.presetRow = document.getElementById("wordweaver-style-presets");
    this._settings = loadWeaveTextStyleSettings();
    this._onChange = null;
    this._selects = {};
    if (!this.root) return;
    this._build();
    this._syncAll();
    this._bind();
  }

  /**
   * @param {() => void} fn
   */
  setOnChange(fn) {
    this._onChange = fn;
  }

  /**
   * @returns {import('./weaveTextStyleSettings.js').WeaveTextStyle}
   */
  getSettings() {
    return { ...this._settings };
  }

  _build() {
    const sections = [
      { key: "geometry", label: "3D geometry", options: GEOMETRY_STYLES },
      { key: "fontId", label: "Font style", options: FONT_STYLES },
      { key: "material", label: "Material", options: MATERIAL_STYLES },
      { key: "enhancement", label: "Geometry FX", options: GEOMETRY_ENHANCEMENTS },
      { key: "lighting", label: "Lighting", options: LIGHTING_STYLES },
      { key: "animation", label: "Animation", options: ANIMATION_STYLES },
      { key: "hybrid", label: "Hybrid style", options: [{ id: "", label: "None" }, ...HYBRID_STYLES] }
    ];

    const grid = document.createElement("div");
    grid.className = "ww-style-panel__grid";

    for (const sec of sections) {
      const label = document.createElement("label");
      label.className = "ww-style-panel__field";
      const span = document.createElement("span");
      span.textContent = sec.label;
      const sel = document.createElement("select");
      sel.className = "ww-style-panel__select";
      sel.dataset.key = sec.key;
      for (const opt of sec.options) {
        const o = document.createElement("option");
        o.value = opt.id;
        o.textContent = opt.label;
        sel.appendChild(o);
      }
      label.append(span, sel);
      grid.append(label);
      this._selects[sec.key] = sel;
    }

    const colorsLabel = document.createElement("label");
    colorsLabel.className = "ww-style-panel__field ww-style-panel__field--colors";
    const colorsTitle = document.createElement("span");
    colorsTitle.textContent = "Colors (text, glow, accent)";
    this._colorsInput = document.createElement("input");
    this._colorsInput.type = "text";
    this._colorsInput.className = "ww-style-panel__colors-input";
    this._colorsInput.setAttribute("inputmode", "text");
    this._colorsInput.setAttribute("autocomplete", "off");
    this._colorsInput.setAttribute("spellcheck", "false");
    this._colorsInput.placeholder = '["#38bdf8","#d4af37","#4ade80"]';
    this._colorsInput.setAttribute(
      "aria-label",
      "Color array: main text, glow, accent (JSON or comma-separated hex)"
    );
    colorsLabel.append(colorsTitle, this._colorsInput);
    grid.appendChild(colorsLabel);

    const sizeLabel = document.createElement("label");
    sizeLabel.className = "ww-style-panel__field ww-style-panel__field--size";
    sizeLabel.innerHTML = `<span>Size <output id="ww-style-size-value">36 pt</output></span>`;
    const sizeRange = document.createElement("input");
    sizeRange.type = "range";
    sizeRange.min = String(12);
    sizeRange.max = String(96);
    sizeRange.step = "1";
    sizeRange.id = "ww-style-font-size";
    sizeRange.className = "ww-style-panel__range";
    sizeLabel.appendChild(sizeRange);
    grid.appendChild(sizeLabel);
    this._sizeRange = sizeRange;
    this._sizeValue = document.getElementById("ww-style-size-value");

    this.root.appendChild(grid);

    if (this.presetRow) {
      for (const p of STYLE_PRESETS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ww-style-preset-btn";
        btn.dataset.preset = p.id;
        btn.textContent = p.label;
        this.presetRow.appendChild(btn);
      }
    }
  }

  _syncColorsInput() {
    if (!this._colorsInput) return;
    const hexes = colorsHexStringsFromStyle(this._settings);
    this._colorsInput.value = JSON.stringify(hexes);
  }

  _applyColorsInput() {
    const parsed = parseColorArrayInput(this._colorsInput?.value ?? "");
    if (!parsed) return;
    this._settings.customColors = parsed;
    delete this._settings.customColor;
    this._syncColorsInput();
    this._persist();
  }

  /**
   * @param {string} schemeId
   */
  _applyColorSchemeId(schemeId) {
    const scheme = COLOR_SCHEME_VALUES[schemeId] ?? COLOR_SCHEME_VALUES.nexaris_blue_gold;
    this._settings.colorScheme = schemeId;
    this._settings.customColors = [
      hexToCssColor(scheme.color),
      hexToCssColor(scheme.glow),
      hexToCssColor(scheme.accent)
    ];
    delete this._settings.customColor;
    this._syncColorsInput();
  }

  /**
   * @param {Partial<import('./weaveTextStyleSettings.js').WeaveTextStyle>} partial
   */
  applyPartial(partial) {
    if (partial.colorScheme && !partial.customColors) {
      this._applyColorSchemeId(partial.colorScheme);
      const { colorScheme: _cs, ...rest } = partial;
      Object.assign(this._settings, rest);
    } else {
      Object.assign(this._settings, partial);
      if (partial.customColors?.length) delete this._settings.customColor;
    }
    this._syncAll();
    this._persist();
  }

  _syncAll() {
    for (const [key, sel] of Object.entries(this._selects)) {
      if (sel && this._settings[key] !== undefined) {
        sel.value = this._settings[key] ?? "";
      }
    }
    this._syncColorsInput();
    if (this._sizeRange) {
      const pt = fontSizeToPoints(this._settings.fontSize);
      this._sizeRange.value = String(pt);
      if (this._sizeValue) this._sizeValue.textContent = `${pt} pt`;
    }
  }

  _bind() {
    for (const [key, sel] of Object.entries(this._selects)) {
      sel?.addEventListener("change", () => {
        const v = sel.value;
        this._settings[key] = key === "hybrid" && !v ? undefined : v;
        if (key === "hybrid" && !v) delete this._settings.hybrid;
        this._persist();
      });
    }
    this._colorsInput?.addEventListener("input", () => {
      const parsed = parseColorArrayInput(this._colorsInput?.value ?? "");
      if (!parsed?.length) return;
      this._settings.customColors = parsed;
      delete this._settings.customColor;
      this._persist();
    });
    this._colorsInput?.addEventListener("change", () => this._applyColorsInput());
    this._colorsInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._applyColorsInput();
      }
    });
    this._sizeRange?.addEventListener("input", () => {
      const pt = Number(this._sizeRange.value) || fontSizeToPoints(0.72);
      this._settings.fontSize = pointsToFontSize(pt);
      if (this._sizeValue) this._sizeValue.textContent = `${pt} pt`;
      this._persist();
    });
    this.presetRow?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-preset]");
      if (!btn) return;
      this._settings = applyStylePreset(btn.dataset.preset);
      this._syncAll();
      this._onChange?.();
    });
  }

  _persist() {
    this._settings = saveWeaveTextStyleSettings(this._settings);
    this._onChange?.();
  }
}
