import {
  FONT_STYLES,
  GEOMETRY_STYLES,
  MATERIAL_STYLES,
  COLOR_SCHEME_VALUES,
  STYLE_PRESETS,
  GEOMETRY_ENHANCEMENTS,
  ANIMATION_STYLES,
  HYBRID_STYLES,
  COLOR_SCHEMES,
  fontFamilyForId,
  fontWeightForId
} from "./weaveTextStyleCatalog.js";
import { isMobileWordWeaver } from "./mobileWordWeaverEnv.js";

/** Distinct sample color per font id (hex for CSS). */
export const FONT_SHEET_COLORS = /** @type {Record<string, string>} */ ({
  sans: "#4ee6e6",
  serif: "#fbbf24",
  mono: "#7dd3fc",
  techno_orbitron: "#38bdf8",
  techno_exo: "#c084fc",
  techno_audiowide: "#f472b6",
  retro_pixel: "#4ade80",
  script: "#fda4af",
  stencil: "#fb923c",
  geometric: "#22d3ee",
  heavy_bold: "#fef08a",
  ultra_thin: "#e2e8f0"
});

const GEOMETRY_PREVIEW_CLASS = {
  extruded: "ww-sheet-chip--extruded",
  hologram: "ww-sheet-chip--hologram",
  wireframe: "ww-sheet-chip--wireframe",
  voxel: "ww-sheet-chip--voxel",
  ribbon: "ww-sheet-chip--ribbon",
  floating_glyph: "ww-sheet-chip--glyph",
  curved_surface: "ww-sheet-chip--curved",
  billboard: "ww-sheet-chip--billboard",
  sdf: "ww-sheet-chip--sdf",
  glass_pane: "ww-sheet-chip--glass"
};

const MATERIAL_CHIP_COLOR = {
  gold: "#d4af37",
  neon_emissive: "#4ade80",
  copper: "#b87333",
  chrome: "#e2e8f0",
  energy_plasma: "#a855f7",
  molten_lava: "#f97316",
  rose_gold: "#e8b4b8",
  aluminum: "#94a3b8"
};

/**
 * Full style catalog — 2D readable samples + visual chips (3D gallery lives in mount above on mobile).
 */
export class WordWeaverFontSheet {
  /**
   * @param {HTMLElement | null} root
   * @param {{ onPickStyle?: (partial: object) => void }} [opts]
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.onPickStyle = opts.onPickStyle ?? null;
    if (!this.root) return;
    this.render();
  }

  render() {
    if (!this.root) return;
    this._render();
  }

  _shortLabel(label) {
    const dash = label.indexOf("—");
    return (dash >= 0 ? label.slice(0, dash) : label).trim();
  }

  _sampleSentence(font) {
    const name = this._shortLabel(font.label);
    return `${name} — Inkling 3D`;
  }

  _colorForFont(fontId, index) {
    if (FONT_SHEET_COLORS[fontId]) return FONT_SHEET_COLORS[fontId];
    const schemes = Object.values(COLOR_SCHEME_VALUES);
    const s = schemes[index % schemes.length];
    return `#${s.color.toString(16).padStart(6, "0")}`;
  }

  _section(title, hint) {
    const wrap = document.createElement("section");
    wrap.className = "wordweaver-font-sheet__section";
    const h = document.createElement("h3");
    h.className = "wordweaver-font-sheet__section-title";
    h.textContent = title;
    wrap.append(h);
    if (hint) {
      const p = document.createElement("p");
      p.className = "wordweaver-font-sheet__section-hint";
      p.textContent = hint;
      wrap.append(p);
    }
    const list = document.createElement("ul");
    list.className = "wordweaver-font-sheet__list";
    wrap.append(list);
    return { wrap, list };
  }

  _row(list, { name, id, sampleHtml, chipClass, onClick }) {
    const li = document.createElement("li");
    li.className = "wordweaver-font-sheet__row";
    if (id) li.dataset.styleId = id;

    const meta = document.createElement("div");
    meta.className = "wordweaver-font-sheet__meta";
    const nameEl = document.createElement("span");
    nameEl.className = "wordweaver-font-sheet__name";
    nameEl.textContent = name;
    meta.append(nameEl);
    if (id) {
      const code = document.createElement("code");
      code.className = "wordweaver-font-sheet__id";
      code.textContent = id;
      meta.append(code);
    }

    const visual = document.createElement("div");
    visual.className = "wordweaver-font-sheet__visual";
    if (chipClass) {
      const chip = document.createElement("div");
      chip.className = `ww-sheet-chip ${chipClass}`;
      chip.setAttribute("aria-hidden", "true");
      visual.append(chip);
    }
    if (sampleHtml) {
      const sample = document.createElement("div");
      sample.className = "wordweaver-font-sheet__sample-wrap";
      if (typeof sampleHtml === "string") {
        sample.innerHTML = sampleHtml;
      } else {
        sample.append(sampleHtml);
      }
      visual.append(sample);
    }

    li.append(meta, visual);
    if (onClick) {
      li.classList.add("wordweaver-font-sheet__row--pickable");
      li.tabIndex = 0;
      li.setAttribute("role", "button");
      const activate = () => onClick();
      li.addEventListener("click", activate);
      li.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });
    }
    list.append(li);
  }

  _render() {
    this.root.innerHTML = "";
    const mobile = isMobileWordWeaver();

    const intro = document.createElement("p");
    intro.className = "wordweaver-font-sheet__intro";
    intro.textContent = mobile
      ? "Scroll for every 3D format below. The live 3D gallery above shows the same styles in space — pinch and drag to look around."
      : "Every preset, geometry, material, and font at readable size. Match names in the 3D text style panel. Open Style sheet with the 3D view for live samples.";
    this.root.append(intro);

    const { wrap: presetSec, list: presetList } = this._section(
      "Style presets",
      "Ready-made combinations (geometry + material + animation)."
    );
    STYLE_PRESETS.forEach((preset) => {
      this._row(presetList, {
        name: preset.label,
        id: preset.id,
        chipClass: GEOMETRY_PREVIEW_CLASS[preset.style.geometry] ?? "ww-sheet-chip--extruded",
        sampleHtml: `<span class="wordweaver-font-sheet__sample" style="font-family:Orbitron,Arial,sans-serif;font-weight:700;color:#38bdf8">3D · ${preset.label}</span>`,
        onClick: () => this.onPickStyle?.({ ...preset.style })
      });
    });
    this.root.append(presetSec);

    const { wrap: geoSec, list: geoList } = this._section(
      "3D geometry",
      "How letters are built in space — extruded, voxel, hologram, floating glyphs, etc."
    );
    GEOMETRY_STYLES.forEach((geo) => {
      this._row(geoList, {
        name: geo.label,
        id: geo.id,
        chipClass: GEOMETRY_PREVIEW_CLASS[geo.id] ?? "ww-sheet-chip--extruded",
        sampleHtml: `<span class="wordweaver-font-sheet__sample ww-sheet-sample-3d">Aa</span>`,
        onClick: () => this.onPickStyle?.({ geometry: geo.id })
      });
    });
    this.root.append(geoSec);

    const { wrap: matSec, list: matList } = this._section("Materials", "Surface metal, glass, neon, lava.");
    MATERIAL_STYLES.forEach((mat) => {
      const hex = MATERIAL_CHIP_COLOR[mat.id] ?? "#7dd3fc";
      this._row(matList, {
        name: mat.label,
        id: mat.id,
        chipClass: "ww-sheet-chip--material",
        sampleHtml: `<span class="wordweaver-font-sheet__sample" style="color:${hex};text-shadow:0 0 10px ${hex}88">Metal</span>`,
        onClick: () => this.onPickStyle?.({ material: mat.id })
      });
    });
    this.root.append(matSec);

    const { wrap: animSec, list: animList } = this._section("Animation", "Motion applied to woven text.");
    ANIMATION_STYLES.forEach((anim) => {
      this._row(animList, {
        name: anim.label,
        id: anim.id,
        chipClass: "ww-sheet-chip--anim",
        onClick: () => this.onPickStyle?.({ animation: anim.id })
      });
    });
    this.root.append(animSec);

    const { wrap: hySec, list: hyList } = this._section("Hybrid styles", "Combined looks.");
    HYBRID_STYLES.forEach((hy) => {
      this._row(hyList, {
        name: hy.label,
        id: hy.id,
        chipClass: "ww-sheet-chip--hybrid",
        onClick: () => this.onPickStyle?.({ hybrid: hy.id })
      });
    });
    this.root.append(hySec);

    const { wrap: enhSec, list: enhList } = this._section("Geometry FX", "Outline, emboss, double layer.");
    GEOMETRY_ENHANCEMENTS.forEach((fx) => {
      this._row(enhList, {
        name: fx.label,
        id: fx.id,
        onClick: () => this.onPickStyle?.({ enhancement: fx.id })
      });
    });
    this.root.append(enhSec);

    const { wrap: colorSec, list: colorList } = this._section("Color schemes", "Palette for woven text.");
    COLOR_SCHEMES.forEach((scheme) => {
      const c = COLOR_SCHEME_VALUES[scheme.id];
      const hex = c ? `#${c.color.toString(16).padStart(6, "0")}` : "#38bdf8";
      this._row(colorList, {
        name: scheme.label,
        id: scheme.id,
        chipClass: "ww-sheet-chip--material",
        sampleHtml: `<span class="wordweaver-font-sheet__sample" style="color:${hex}">Palette</span>`,
        onClick: () => {
          const c = COLOR_SCHEME_VALUES[scheme.id];
          if (!c) return;
          this.onPickStyle?.({
            colorScheme: scheme.id,
            customColors: [
              `#${c.color.toString(16).padStart(6, "0")}`,
              `#${c.glow.toString(16).padStart(6, "0")}`,
              `#${c.accent.toString(16).padStart(6, "0")}`
            ]
          });
        }
      });
    });
    this.root.append(colorSec);

    const { wrap: fontSec, list: fontList } = this._section(
      "Font styles",
      "Typeface for 3D letters — uses system fonts on device when custom fonts are unavailable."
    );
    FONT_STYLES.forEach((font, index) => {
      const color = this._colorForFont(font.id, index);
      const sample = document.createElement("p");
      sample.className = "wordweaver-font-sheet__sample";
      if (font.id === "retro_pixel") sample.classList.add("wordweaver-font-sheet__sample--pixel");
      if (font.id === "ultra_thin") sample.classList.add("wordweaver-font-sheet__sample--thin");
      sample.textContent = this._sampleSentence(font);
      sample.style.fontFamily = fontFamilyForId(font.id);
      sample.style.fontWeight = fontWeightForId(font.id);
      sample.style.color = color;
      sample.style.textShadow = `0 0 12px ${color}66`;
      this._row(fontList, {
        name: font.label,
        id: font.id,
        sampleHtml: sample,
        onClick: () => this.onPickStyle?.({ fontId: font.id })
      });
    });
    this.root.append(fontSec);
  }
}
