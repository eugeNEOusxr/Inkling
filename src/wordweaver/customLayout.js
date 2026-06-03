export const CUSTOM_LAYOUT_KEY = "inkling:wordweaverCustomLayout";
export const LAYOUT_MODE_KEY = "inkling:wordweaverLayout";
export const LAYOUT_SAVED_AT_KEY = "inkling:wordweaverLayoutSavedAt";

/** @typedef {{ verticalStep: number, horizontalSpread: number, depthSpread: number, spiralTwist: number, yBase: number, name?: string }} CustomLayoutParams */

export const DEFAULT_CUSTOM_LAYOUT = /** @type {CustomLayoutParams} */ ({
  verticalStep: 0.88,
  horizontalSpread: 1.05,
  depthSpread: 0.82,
  spiralTwist: 0.22,
  yBase: 0.4,
  name: "My layout"
});

/** Live slider values — applied immediately in 3D before save. */
let _liveOverride = null;

/**
 * @param {CustomLayoutParams | null} params
 */
export function setCustomLayoutOverride(params) {
  _liveOverride = params ? { ...DEFAULT_CUSTOM_LAYOUT, ...params } : null;
}

/**
 * @returns {CustomLayoutParams}
 */
export function getActiveCustomLayout() {
  if (_liveOverride) return { ..._liveOverride };
  return loadCustomLayout();
}

/**
 * @returns {CustomLayoutParams}
 */
export function loadCustomLayout() {
  try {
    const raw = localStorage.getItem(CUSTOM_LAYOUT_KEY);
    if (!raw) return { ...DEFAULT_CUSTOM_LAYOUT };
    return { ...DEFAULT_CUSTOM_LAYOUT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CUSTOM_LAYOUT };
  }
}

/**
 * @param {CustomLayoutParams} params
 */
export function saveCustomLayout(params) {
  const merged = { ...DEFAULT_CUSTOM_LAYOUT, ...params };
  setCustomLayoutOverride(merged);
  try {
    localStorage.setItem(CUSTOM_LAYOUT_KEY, JSON.stringify(merged));
    localStorage.setItem(LAYOUT_SAVED_AT_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  return merged;
}

/**
 * @param {import('../inkling-core/timelineNode.js').TimelineNode} node
 * @param {number} i
 * @param {number} total
 * @param {CustomLayoutParams} [p]
 */
export function customPlacement(node, i, total, p = getActiveCustomLayout()) {
  const importance = node.importance ?? (node.kind === "appointment" ? 0.75 : 0.5);
  const angle = (i / Math.max(total, 1)) * Math.PI * 2 + i * p.spiralTwist;
  const r = p.horizontalSpread * (1.1 + importance * 0.45);
  const step = p.verticalStep;
  let y = p.yBase + i * step;
  const maxY = p.yBase + Math.max(total - 1, 0) * step;
  if (maxY > 5.2) {
    const scale = 5.2 / maxY;
    y = p.yBase + i * step * scale;
  }
  return {
    x: Math.sin(angle) * r + ((i % 2) * 2 - 1) * 0.1 * p.horizontalSpread,
    y,
    z: Math.cos(angle) * p.depthSpread * (1.2 + importance * 0.35) - i * 0.06,
    rotY: angle * 0.2,
    scale: 0.82 + importance * 0.28,
    glowBoost: importance
  };
}
