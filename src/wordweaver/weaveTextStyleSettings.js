import {
  WEAVE_STYLE_STORAGE_KEY,
  STYLE_PRESETS,
  HYBRID_STYLE_OVERRIDES,
  COLOR_SCHEME_VALUES,
  fontFamilyForId
} from "./weaveTextStyleCatalog.js";
import { parseColorToHex, hexToCssColor } from "./letterTypography.js";
import { isMobileWordWeaver } from "./mobileWordWeaverEnv.js";

/** Slider 0.35–2 maps to readable point labels in the style panel. */
const FONT_SIZE_MIN = 0.35;
const FONT_SIZE_MAX = 2;
const FONT_POINTS_MIN = 12;
const FONT_POINTS_MAX = 96;

/**
 * @typedef {Object} WeaveTextStyle
 * @property {string} [preset]
 * @property {string} geometry
 * @property {string} fontId
 * @property {string} material
 * @property {string} colorScheme
 * @property {string} [customColor]
 * @property {string[]} [customColors]
 * @property {string} enhancement
 * @property {string} lighting
 * @property {string} animation
 * @property {string} [hybrid]
 * @property {number} fontSize
 */

/**
 * @param {number} fontSize
 */
export function fontSizeToPoints(fontSize) {
  const fs = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Number(fontSize) || 0.72));
  const t = (fs - FONT_SIZE_MIN) / (FONT_SIZE_MAX - FONT_SIZE_MIN);
  return Math.round(FONT_POINTS_MIN + t * (FONT_POINTS_MAX - FONT_POINTS_MIN));
}

/**
 * @param {number} points
 */
export function pointsToFontSize(points) {
  const pt = Math.max(FONT_POINTS_MIN, Math.min(FONT_POINTS_MAX, Number(points) || FONT_POINTS_MIN));
  const t = (pt - FONT_POINTS_MIN) / (FONT_POINTS_MAX - FONT_POINTS_MIN);
  return FONT_SIZE_MIN + t * (FONT_SIZE_MAX - FONT_SIZE_MIN);
}

/**
 * @param {WeaveTextStyle | Partial<WeaveTextStyle>} style
 * @returns {string[]}
 */
export function colorsHexStringsFromStyle(style) {
  if (style.customColors?.length) {
    return style.customColors.map((c) => hexToCssColor(parseColorToHex(c)));
  }
  if (style.customColor) {
    const one = hexToCssColor(parseColorToHex(style.customColor));
    const scheme =
      COLOR_SCHEME_VALUES[style.colorScheme ?? "nexaris_blue_gold"] ??
      COLOR_SCHEME_VALUES.nexaris_blue_gold;
    return [one, hexToCssColor(scheme.glow), hexToCssColor(scheme.accent)];
  }
  const scheme =
    COLOR_SCHEME_VALUES[style.colorScheme ?? "nexaris_blue_gold"] ??
    COLOR_SCHEME_VALUES.nexaris_blue_gold;
  return [
    hexToCssColor(scheme.color),
    hexToCssColor(scheme.glow),
    hexToCssColor(scheme.accent)
  ];
}

/**
 * @param {string} raw
 * @returns {string[] | null}
 */
export function parseColorArrayInput(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  /** @type {string[]} */
  let parts = [];
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) parts = parsed.map(String);
    } catch {
      return null;
    }
  } else {
    parts = s.split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
  }
  const out = [];
  for (const part of parts) {
    const hex = parseColorToHex(part);
    const css = hexToCssColor(hex);
    if (!out.includes(css)) out.push(css);
  }
  return out.length ? out : null;
}

/**
 * @param {Partial<WeaveTextStyle>} partial
 */
function migrateLegacyColors(partial) {
  if (partial.customColors?.length) return partial;
  if (partial.customColor) {
    const scheme =
      COLOR_SCHEME_VALUES[partial.colorScheme ?? "nexaris_blue_gold"] ??
      COLOR_SCHEME_VALUES.nexaris_blue_gold;
    return {
      ...partial,
      customColors: [
        hexToCssColor(parseColorToHex(partial.customColor)),
        hexToCssColor(scheme.glow),
        hexToCssColor(scheme.accent)
      ]
    };
  }
  return partial;
}

export const DEFAULT_WEAVE_TEXT_STYLE = /** @type {WeaveTextStyle} */ ({
  geometry: "floating_glyph",
  fontId: "techno_orbitron",
  material: "neon_emissive",
  colorScheme: "nexaris_blue_gold",
  enhancement: "outline_fill",
  lighting: "backlit",
  animation: "bobbing",
  fontSize: 0.72
});

/**
 * @param {Partial<WeaveTextStyle>} [partial]
 * @returns {WeaveTextStyle}
 */
export function resolveWeaveTextStyle(partial = {}) {
  let base = { ...DEFAULT_WEAVE_TEXT_STYLE, ...migrateLegacyColors(partial) };
  if (partial.preset) {
    const preset = STYLE_PRESETS.find((p) => p.id === partial.preset);
    if (preset) base = { ...base, ...preset.style, ...partial };
  }
  if (base.hybrid && HYBRID_STYLE_OVERRIDES[base.hybrid]) {
    base = { ...base, ...HYBRID_STYLE_OVERRIDES[base.hybrid], ...partial };
  }
  return base;
}

/**
 * @returns {WeaveTextStyle}
 */
export function loadWeaveTextStyleSettings() {
  try {
    const raw = localStorage.getItem(WEAVE_STYLE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WEAVE_TEXT_STYLE };
    return resolveWeaveTextStyle(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WEAVE_TEXT_STYLE };
  }
}

/**
 * @param {Partial<WeaveTextStyle>} settings
 */
export function saveWeaveTextStyleSettings(settings) {
  const merged = { ...loadWeaveTextStyleSettings(), ...settings };
  if (merged.customColors?.length) delete merged.customColor;
  const next = resolveWeaveTextStyle(merged);
  try {
    localStorage.setItem(WEAVE_STYLE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * @param {string} presetId
 */
export function applyStylePreset(presetId) {
  const preset = STYLE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return loadWeaveTextStyleSettings();
  return saveWeaveTextStyleSettings(preset.style);
}

/**
 * @param {WeaveTextStyle} style
 */
export function styleToTypography(style) {
  const scheme = COLOR_SCHEME_VALUES[style.colorScheme] ?? COLOR_SCHEME_VALUES.nexaris_blue_gold;
  const palette = style.customColors?.length
    ? {
        color: parseColorToHex(style.customColors[0]),
        glow: parseColorToHex(style.customColors[1] ?? style.customColors[0]),
        accent: parseColorToHex(
          style.customColors[2] ?? style.customColors[1] ?? style.customColors[0]
        )
      }
    : style.customColor
      ? {
          color: parseColorToHex(style.customColor),
          glow: scheme.glow,
          accent: scheme.accent
        }
      : scheme;
  return {
    fontFamily: fontFamilyForId(style.fontId),
    fontSize: Number(style.fontSize) || 0.72,
    color: palette.color,
    glowColor: palette.glow,
    accentColor: palette.accent,
    /** @deprecated alias */ glow: palette.glow
  };
}

/**
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} node
 * @returns {WeaveTextStyle | null}
 */
export function getWeaveTextStyleFromNode(node) {
  const s = node?.weaveTextStyle ?? node?.letterTypography;
  if (!s || typeof s !== "object") return null;
  if (s.geometry || s.fontId || s.preset) {
    return resolveWeaveTextStyle(/** @type {Partial<WeaveTextStyle>} */ (s));
  }
  return resolveWeaveTextStyle({
    fontId: "sans",
    fontSize: Number(s.fontSize) || 0.72,
    customColor: s.color,
    geometry: "floating_glyph"
  });
}

/** Panel settings (size, font, geometry, etc.) apply live to all woven text in the 3D view. */
const LIVE_PANEL_KEYS = [
  "geometry",
  "fontId",
  "material",
  "colorScheme",
  "customColors",
  "enhancement",
  "lighting",
  "animation",
  "hybrid",
  "fontSize",
  "preset"
];

/**
 * Merge saved node style with current style panel so sliders/dropdowns update the scene.
 * @param {import('../inkling-core/timelineNode.js').TimelineNode | null | undefined} node
 */
const MOBILE_GLYPH_MODES = new Set(["floating_glyph", "floating_glyph_particles"]);

/**
 * On mobile, one extruded word label reads better than per-letter meshes (font/WebView).
 * @param {WeaveTextStyle} style
 * @returns {WeaveTextStyle}
 */
function adaptStyleForMobile(style) {
  if (!isMobileWordWeaver()) return style;
  const next = { ...style };
  if (MOBILE_GLYPH_MODES.has(next.geometry)) {
    next.geometry = "extruded";
    next.enhancement = next.enhancement === "none" ? "outline_fill" : next.enhancement;
  }
  return resolveWeaveTextStyle(next);
}

export function getDisplayWeaveStyle(node) {
  const global = adaptStyleForMobile(loadWeaveTextStyleSettings());
  const fromNode = node ? getWeaveTextStyleFromNode(node) : null;
  if (!fromNode) return global;
  /** @type {Partial<WeaveTextStyle>} */
  const live = {};
  for (const key of LIVE_PANEL_KEYS) {
    if (global[key] !== undefined) live[key] = global[key];
  }
  return adaptStyleForMobile(resolveWeaveTextStyle({ ...fromNode, ...live }));
}
