import {
  FONT_STYLES,
  MATERIAL_STYLES,
  COLOR_SCHEME_VALUES,
  COLOR_SCHEMES,
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
import { getCalendarMode, toggleCalendarMode, onCalendarModeChange } from "./calendarMode.js";

const STYLE_TAG_ID = "wordweaver-ui-styles";

const MENU_SECTIONS = [
  { id: "size", label: "Size", type: "size" },
  { id: "styleSheet", label: "Style sheet", type: "presets" },
  { id: "enhancement", label: "Geometry FX", type: "select", key: "enhancement", options: GEOMETRY_ENHANCEMENTS },
  { id: "lighting", label: "Lighting", type: "select", key: "lighting", options: LIGHTING_STYLES },
  { id: "animation", label: "Animation", type: "select", key: "animation", options: ANIMATION_STYLES },
  { id: "hybrid", label: "Hybrid style", type: "select", key: "hybrid", options: [{ id: "", label: "None" }, ...HYBRID_STYLES] },
  { id: "fontId", label: "Font", type: "select", key: "fontId", options: FONT_STYLES },
  { id: "material", label: "Material", type: "select", key: "material", options: MATERIAL_STYLES },
  { id: "color", label: "Color", type: "color" }
];

function injectStyles() {
  if (document.getElementById(STYLE_TAG_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_TAG_ID;
  tag.textContent = `
.wordweaver-ui {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 12;
  pointer-events: none;
  font-family: "DM Sans", system-ui, sans-serif;
}
.wordweaver-ui * { box-sizing: border-box; }
.wordweaver-ui__toolbar {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 6px;
  pointer-events: auto;
}
.wordweaver-ui__btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid rgba(78, 230, 230, 0.45);
  background: rgba(8, 14, 28, 0.88);
  color: #a8f6ff;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}
.wordweaver-ui__btn:hover,
.wordweaver-ui__btn.is-active {
  border-color: rgba(212, 175, 55, 0.65);
  background: rgba(78, 230, 230, 0.2);
  color: #f0fdff;
}
.wordweaver-ui__btn--first { order: -1; }
.wordweaver-ui__btn--mode {
  width: auto;
  min-width: 72px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.wordweaver-ui__menu {
  margin-top: 8px;
  width: min(92vw, 300px);
  max-height: min(70vh, 420px);
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(78, 230, 230, 0.35);
  background: rgba(6, 10, 20, 0.94);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
}
.wordweaver-ui__menu.is-hidden { display: none; }
.wordweaver-ui__menu-scroll {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 6px 0;
  max-height: min(70vh, 420px);
}
.wordweaver-ui__section {
  border-bottom: 1px solid rgba(51, 65, 85, 0.5);
}
.wordweaver-ui__section:last-child { border-bottom: none; }
.wordweaver-ui__section > summary {
  list-style: none;
  cursor: pointer;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 700;
  color: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wordweaver-ui__section > summary::-webkit-details-marker { display: none; }
.wordweaver-ui__section > summary::after {
  content: "▾";
  font-size: 11px;
  color: #94a3b8;
  transition: transform 0.15s ease;
}
.wordweaver-ui__section[open] > summary::after { transform: rotate(180deg); }
.wordweaver-ui__section-body {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wordweaver-ui__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #94a3b8;
}
.wordweaver-ui__select,
.wordweaver-ui__colors-input {
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(78, 230, 230, 0.3);
  background: rgba(15, 23, 42, 0.9);
  color: #f1f5f9;
  font-size: 12px;
}
.wordweaver-ui__range {
  width: 100%;
  accent-color: #4de3ff;
}
.wordweaver-ui__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.wordweaver-ui__preset-btn {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(78, 230, 230, 0.28);
  background: rgba(15, 23, 42, 0.85);
  color: #cbd5e1;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.wordweaver-ui__preset-btn:hover {
  border-color: rgba(212, 175, 55, 0.5);
  color: #f0fdff;
}
`;
  document.head.appendChild(tag);
}

/**
 * Top-left WordWeaver customization dropdown (full style menu).
 */
export class WordWeaverUI {
  constructor() {
    /** @type {import("./weaveTextStyleSettings.js").WeaveTextStyle} */
    this._settings = loadWeaveTextStyleSettings();
    /** @type {Record<string, HTMLSelectElement>} */
    this._selects = {};
    this._menuOpen = false;
    this._root = null;
    this._menu = null;
    this._toggleBtn = null;
    this._colorsInput = null;
    this._colorSchemeSelect = null;
    this._sizeRange = null;
    this._sizeValue = null;
    this._modeBtn = null;
    this._offModeChange = null;
  }

  mount(container) {
    if (!container || container.querySelector(".wordweaver-ui")) return;

    injectStyles();

    const root = document.createElement("div");
    root.className = "wordweaver-ui";
    root.setAttribute("aria-label", "WordWeaver tools");

    const toolbar = document.createElement("div");
    toolbar.className = "wordweaver-ui__toolbar";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "wordweaver-ui__btn wordweaver-ui__btn--first";
    toggleBtn.title = "3D text style & appearance";
    toggleBtn.setAttribute("aria-label", "Open style customization");
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.textContent = "🎨";
    this._toggleBtn = toggleBtn;

    const modeBtn = document.createElement("button");
    modeBtn.type = "button";
    modeBtn.className = "wordweaver-ui__btn wordweaver-ui__btn--mode";
    modeBtn.title = "Switch between 2D calendar and 3D WordWeaver";
    this._modeBtn = modeBtn;
    this._syncModeButtonLabel();

    modeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCalendarMode();
    });

    toolbar.appendChild(modeBtn);
    toolbar.appendChild(toggleBtn);

    const menu = document.createElement("div");
    menu.className = "wordweaver-ui__menu is-hidden";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "WordWeaver style menu");

    const scroll = document.createElement("div");
    scroll.className = "wordweaver-ui__menu-scroll";

    for (const sec of MENU_SECTIONS) {
      scroll.appendChild(this._buildSection(sec));
    }

    menu.append(scroll);
    root.append(toolbar, menu);
    container.appendChild(root);

    this._root = root;
    this._menu = menu;

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._setMenuOpen(!this._menuOpen);
    });

    document.addEventListener("click", (e) => {
      if (!this._menuOpen) return;
      if (root.contains(e.target)) return;
      this._setMenuOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this._menuOpen) this._setMenuOpen(false);
    });

    this._syncAll();
    this._offModeChange = onCalendarModeChange(() => this._syncModeButtonLabel());
  }

  _syncModeButtonLabel() {
    if (!this._modeBtn) return;
    const mode = getCalendarMode();
    this._modeBtn.textContent = mode === "3d" ? "2D Mode" : "3D Mode";
    this._modeBtn.setAttribute("aria-pressed", String(mode === "2d"));
  }

  /**
   * @param {typeof MENU_SECTIONS[number]} sec
   */
  _buildSection(sec) {
    const details = document.createElement("details");
    details.className = "wordweaver-ui__section";
    details.dataset.section = sec.id;

    const summary = document.createElement("summary");
    summary.textContent = sec.label;
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "wordweaver-ui__section-body";

    if (sec.type === "size") {
      const label = document.createElement("label");
      label.className = "wordweaver-ui__field";
      const out = document.createElement("output");
      out.id = "ww-ui-size-value";
      out.textContent = "36 pt";
      label.innerHTML = `<span>Point size</span>`;
      label.append(out);

      const range = document.createElement("input");
      range.type = "range";
      range.min = "12";
      range.max = "96";
      range.step = "1";
      range.className = "wordweaver-ui__range";
      range.addEventListener("input", () => {
        const pt = Number(range.value) || 36;
        this._settings.fontSize = pointsToFontSize(pt);
        out.textContent = `${pt} pt`;
        this._persist();
      });
      label.appendChild(range);
      body.appendChild(label);
      this._sizeRange = range;
      this._sizeValue = out;
    } else if (sec.type === "presets") {
      const wrap = document.createElement("div");
      wrap.className = "wordweaver-ui__presets";
      for (const p of STYLE_PRESETS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wordweaver-ui__preset-btn";
        btn.dataset.preset = p.id;
        btn.textContent = p.label;
        btn.addEventListener("click", () => {
          this._settings = applyStylePreset(p.id);
          this._syncAll();
          this._notifyChange();
        });
        wrap.appendChild(btn);
      }
      body.appendChild(wrap);
    } else if (sec.type === "select" && sec.key) {
      const label = document.createElement("label");
      label.className = "wordweaver-ui__field";
      const span = document.createElement("span");
      span.textContent = sec.label;
      const sel = document.createElement("select");
      sel.className = "wordweaver-ui__select";
      sel.dataset.key = sec.key;
      for (const opt of sec.options) {
        const o = document.createElement("option");
        o.value = opt.id;
        o.textContent = opt.label;
        sel.appendChild(o);
      }
      sel.addEventListener("change", () => {
        const v = sel.value;
        if (sec.key === "hybrid") {
          if (!v) delete this._settings.hybrid;
          else this._settings.hybrid = v;
        } else {
          this._settings[sec.key] = v;
        }
        this._persist();
      });
      label.append(span, sel);
      body.appendChild(label);
      this._selects[sec.key] = sel;
    } else if (sec.type === "color") {
      const schemeLabel = document.createElement("label");
      schemeLabel.className = "wordweaver-ui__field";
      schemeLabel.innerHTML = "<span>Palette</span>";
      const schemeSel = document.createElement("select");
      schemeSel.className = "wordweaver-ui__select";
      for (const scheme of COLOR_SCHEMES) {
        const o = document.createElement("option");
        o.value = scheme.id;
        o.textContent = scheme.label;
        schemeSel.appendChild(o);
      }
      schemeSel.addEventListener("change", () => {
        this._applyColorSchemeId(schemeSel.value);
        this._persist();
      });
      schemeLabel.appendChild(schemeSel);
      body.appendChild(schemeLabel);
      this._colorSchemeSelect = schemeSel;

      const colorsLabel = document.createElement("label");
      colorsLabel.className = "wordweaver-ui__field";
      colorsLabel.innerHTML = "<span>Colors (text, glow, accent)</span>";
      const colorsInput = document.createElement("input");
      colorsInput.type = "text";
      colorsInput.className = "wordweaver-ui__colors-input";
      colorsInput.placeholder = '["#38bdf8","#d4af37","#4ade80"]';
      colorsInput.addEventListener("input", () => {
        const parsed = parseColorArrayInput(colorsInput.value);
        if (!parsed?.length) return;
        this._settings.customColors = parsed;
        delete this._settings.customColor;
        this._persist();
      });
      colorsInput.addEventListener("change", () => this._applyColorsInput());
      colorsInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this._applyColorsInput();
        }
      });
      colorsLabel.appendChild(colorsInput);
      body.appendChild(colorsLabel);
      this._colorsInput = colorsInput;
    }

    details.appendChild(body);
    return details;
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

  _applyColorsInput() {
    const parsed = parseColorArrayInput(this._colorsInput?.value ?? "");
    if (!parsed) return;
    this._settings.customColors = parsed;
    delete this._settings.customColor;
    this._syncColorsInput();
    this._persist();
  }

  _syncColorsInput() {
    if (!this._colorsInput) return;
    this._colorsInput.value = JSON.stringify(colorsHexStringsFromStyle(this._settings));
  }

  _syncAll() {
    for (const [key, sel] of Object.entries(this._selects)) {
      if (sel && this._settings[key] !== undefined) {
        sel.value = this._settings[key] ?? "";
      }
    }
    if (this._colorSchemeSelect && this._settings.colorScheme) {
      this._colorSchemeSelect.value = this._settings.colorScheme;
    }
    this._syncColorsInput();
    if (this._sizeRange) {
      const pt = fontSizeToPoints(this._settings.fontSize);
      this._sizeRange.value = String(pt);
      if (this._sizeValue) this._sizeValue.textContent = `${pt} pt`;
    }
  }

  _persist() {
    this._settings = saveWeaveTextStyleSettings(this._settings);
    this._notifyChange();
  }

  _notifyChange() {
    window.dispatchEvent(
      new CustomEvent("wordweaver:text-style-changed", {
        detail: { settings: { ...this._settings } }
      })
    );
  }

  /**
   * @param {boolean} open
   */
  _setMenuOpen(open) {
    this._menuOpen = open;
    this._menu?.classList.toggle("is-hidden", !open);
    this._toggleBtn?.classList.toggle("is-active", open);
    this._toggleBtn?.setAttribute("aria-expanded", String(open));
  }
}

/** @type {WordWeaverUI | null} */
let instance = null;
let booted = false;

function tryMount() {
  const mount = document.getElementById("wordweaver-embed-mount");
  if (!mount) return false;
  if (!instance) instance = new WordWeaverUI();
  instance.mount(mount);
  return true;
}

/**
 * Attach style UI when the WordWeaver 3D mount exists.
 */
export function bootWordWeaverUI() {
  if (booted) return;
  if (tryMount()) {
    booted = true;
    return;
  }
  const observer = new MutationObserver(() => {
    if (tryMount()) {
      booted = true;
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bootWordWeaverUI());
  } else {
    bootWordWeaverUI();
  }
}
