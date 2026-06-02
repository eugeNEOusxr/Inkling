/**
 * Performance gating utilities for optional visuals.
 * Rollback: delete this file and remove imports from scene/effects modules.
 */
export function isReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

export function isVisualsEnabled() {
  return window.__EUGENE_VISUALS_ENABLED !== false;
}

export function isHighPerformance() {
  if (isReducedMotion()) return false;
  const memory = Number(navigator.deviceMemory || 4);
  const cores = Number(navigator.hardwareConcurrency || 4);
  return memory >= 4 && cores >= 4;
}

export function particleBudget() {
  if (!isVisualsEnabled()) return 0;
  if (isReducedMotion()) return 0;
  return isHighPerformance() ? 140 : 48;
}

export function applyVisualPerfClass() {
  // Phase D: local-only telemetry and class marker for CSS fallbacks.
  const lowPower = !isVisualsEnabled() || !isHighPerformance();
  document.documentElement.classList.toggle("low-power", lowPower);
  console.info("[visuals] perf-flags", {
    enabled: isVisualsEnabled(),
    reducedMotion: isReducedMotion(),
    highPerformance: isHighPerformance(),
    particleBudget: particleBudget()
  });
}

export function logVisualTiming(name, startMs) {
  const elapsed = Math.max(0, performance.now() - startMs);
  console.info("[visuals] timing", { name, elapsedMs: Math.round(elapsed) });
}
