/**
 * Typography presets for WordWeaver floating 3D letters.
 */

export const LETTER_TYPOGRAPHY_KEY = "inkling:ww-letter-typography";

/** @typedef {{ fontFamily: string, fontSize: number, color: number, glowColor?: number }} LetterTypography */

export const LETTER_FONT_OPTIONS = /** @type {const} */ ([
  { id: "sans", label: "Sans (Arial)", family: "Arial, Helvetica, sans-serif" },
  { id: "serif", label: "Serif (Georgia)", family: "Georgia, Times New Roman, serif" },
  { id: "mono", label: "Mono", family: "Courier New, Consolas, monospace" },
  { id: "futuristic", label: "Futuristic", family: "Orbitron, Arial, sans-serif" },
  { id: "rounded", label: "Rounded", family: "Segoe UI, system-ui, sans-serif" },
  { id: "classic", label: "Classic", family: "Palatino Linotype, Book Antiqua, serif" }
]);

const DEFAULTS = /** @type {LetterTypography} */ ({
  fontFamily: LETTER_FONT_OPTIONS[0].family,
  fontSize: 0.72,
  color: 0x38bdf8,
  glowColor: 0x6366f1
});

/**
 * @param {string | number} value
 * @returns {number}
 */
export function parseColorToHex(value) {
  if (typeof value === "number") return value;
  const s = String(value).trim().replace("#", "");
  const n = parseInt(s, 16);
  return Number.isFinite(n) ? n : DEFAULTS.color;
}

/**
 * @param {number} hex
 * @returns {string}
 */
export function hexToCssColor(hex) {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

/**
 * @returns {LetterTypography}
 */
export function loadLetterTypographySettings() {
  try {
    const raw = localStorage.getItem(LETTER_TYPOGRAPHY_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      fontFamily: parsed.fontFamily ?? DEFAULTS.fontFamily,
      fontSize: Number(parsed.fontSize) || DEFAULTS.fontSize,
      color: parseColorToHex(parsed.color ?? DEFAULTS.color),
      glowColor: parseColorToHex(parsed.glowColor ?? parsed.color ?? DEFAULTS.glowColor)
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * @param {Partial<LetterTypography>} settings
 */
export function saveLetterTypographySettings(settings) {
  const prev = loadLetterTypographySettings();
  const next = {
    fontFamily: settings.fontFamily ?? prev.fontFamily,
    fontSize: settings.fontSize ?? prev.fontSize,
    color: settings.color ?? prev.color,
    glowColor: settings.glowColor ?? settings.color ?? prev.glowColor
  };
  try {
    localStorage.setItem(LETTER_TYPOGRAPHY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} node
 * @returns {LetterTypography | null}
 */
export function getTypographyFromNode(node) {
  const t = node?.letterTypography;
  if (!t || typeof t !== "object") return null;
  return {
    fontFamily: t.fontFamily ?? DEFAULTS.fontFamily,
    fontSize: Number(t.fontSize) || DEFAULTS.fontSize,
    color: parseColorToHex(t.color ?? DEFAULTS.color),
    glowColor: parseColorToHex(t.glowColor ?? t.color ?? DEFAULTS.glowColor)
  };
}

/**
 * @param {string} fontFamily
 */
export function fontOptionIdForFamily(fontFamily) {
  const hit = LETTER_FONT_OPTIONS.find((f) => f.family === fontFamily);
  return hit?.id ?? LETTER_FONT_OPTIONS[0].id;
}
