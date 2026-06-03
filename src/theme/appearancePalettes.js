/**
 * Inkling appearance palettes — feminine, masculine, neutral.
 * Works with light/dark mode (theme-light / theme-dark on :root).
 */

export const APPEARANCE_STORAGE_KEY = "inkling:appearancePalette";

export const APPEARANCE_GROUPS = [
  {
    id: "neutral",
    label: "Neutral",
    hint: "Aqua highlights & gold accents — the classic Inkling wall."
  },
  {
    id: "masculine",
    label: "Masculine",
    hint: "Steel blue, indigo depth & crisp cool contrast."
  },
  {
    id: "feminine",
    label: "Feminine",
    hint: "Hot pink, UV magenta & coral glow — atomic notes with orbiting light."
  }
];

/** @typedef {'neutral'|'masculine'|'feminine'} AppearancePaletteId */

/** @type {Record<AppearancePaletteId, object>} */
export const PALETTES = {
  neutral: {
    id: "neutral",
    accent: "#0a7ea4",
    accentRgb: "10, 126, 164",
    aqua: "#4ee6e6",
    gold: "#d4af37",
    glow: "#6366f1",
    writerScroll: "rgba(78, 230, 230, 0.78)",
    clockFaceCenter: "rgba(168, 247, 247, 0.14)",
    clockRingStart: "rgba(212, 175, 55, 0.85)",
    clockRingMid: "rgba(56, 189, 248, 0.55)",
    clockHand: "#fde68a",
    wwNode: 0x0a7ea4,
    wwInsight: 0x7c3aed,
    wwGlowDefault: 0x4ee6e6,
    atomOrbits: false
  },
  masculine: {
    id: "masculine",
    accent: "#3b82f6",
    accentRgb: "59, 130, 246",
    aqua: "#38bdf8",
    gold: "#94a3b8",
    glow: "#4338ca",
    writerScroll: "rgba(96, 165, 250, 0.82)",
    clockFaceCenter: "rgba(56, 189, 248, 0.12)",
    clockRingStart: "rgba(148, 163, 184, 0.9)",
    clockRingMid: "rgba(59, 130, 246, 0.65)",
    clockHand: "#e2e8f0",
    wwNode: 0x38bdf8,
    wwInsight: 0x6366f1,
    wwGlowDefault: 0x3b82f6,
    atomOrbits: false
  },
  feminine: {
    id: "feminine",
    accent: "#ff2d8f",
    accentRgb: "255, 45, 143",
    aqua: "#f472b6",
    gold: "#fb7185",
    glow: "#e879f9",
    writerScroll: "rgba(255, 45, 143, 0.85)",
    clockFaceCenter: "rgba(255, 105, 180, 0.22)",
    clockRingStart: "rgba(255, 45, 143, 0.95)",
    clockRingMid: "rgba(192, 38, 211, 0.75)",
    clockHand: "#fda4af",
    wwNode: 0xff4da6,
    wwInsight: 0xe879f9,
    wwGlowDefault: 0xf472b6,
    atomOrbits: true
  }
};

/**
 * @param {string} [id]
 * @returns {typeof PALETTES.neutral}
 */
export function getPalette(id) {
  const key = id && PALETTES[id] ? id : "neutral";
  return PALETTES[key];
}

/**
 * @returns {AppearancePaletteId}
 */
export function getActivePaletteId() {
  if (typeof document !== "undefined") {
    const fromDom = document.documentElement.dataset.appearance;
    if (fromDom && PALETTES[fromDom]) return /** @type {AppearancePaletteId} */ (fromDom);
  }
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (raw && PALETTES[raw]) return /** @type {AppearancePaletteId} */ (raw);
    const notif = localStorage.getItem("calendar3d-notification-settings-v1");
    if (notif) {
      const p = JSON.parse(notif).appearancePalette;
      if (p && PALETTES[p]) return /** @type {AppearancePaletteId} */ (p);
    }
  } catch {
    /* ignore */
  }
  return "neutral";
}

/**
 * @returns {typeof PALETTES.neutral}
 */
export function getActivePalette() {
  return getPalette(getActivePaletteId());
}

/**
 * @param {AppearancePaletteId} id
 */
export function applyPaletteToDocument(id) {
  const palette = getPalette(id);
  const root = document.documentElement;
  const body = document.body;
  if (!root) return palette;

  root.dataset.appearance = palette.id;
  if (body) body.dataset.appearance = palette.id;

  root.style.setProperty("--inkling-accent", palette.accent);
  root.style.setProperty("--inkling-accent-rgb", palette.accentRgb);
  root.style.setProperty("--inkling-aqua", palette.aqua);
  root.style.setProperty("--inkling-gold", palette.gold);
  root.style.setProperty("--inkling-glow", palette.glow);
  root.style.setProperty("--writer-scroll-thumb-aqua", palette.writerScroll);
  root.style.setProperty("--writer-scroll-thumb-gold", palette.gold);
  root.style.setProperty("--clock-face-center", palette.clockFaceCenter);
  root.style.setProperty("--clock-ring-start", palette.clockRingStart);
  root.style.setProperty("--clock-ring-mid", palette.clockRingMid);
  root.style.setProperty("--clock-hand", palette.clockHand);

  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, palette.id);
  } catch {
    /* ignore */
  }

  window.dispatchEvent(
    new CustomEvent("inkling:appearance-change", { detail: { paletteId: palette.id } })
  );

  return palette;
}
