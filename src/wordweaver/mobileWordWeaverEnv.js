/**
 * Mobile / Android detection without importing weave modules (avoids circular deps).
 * @returns {boolean}
 */
export function isMobileWordWeaver() {
  if (typeof window === "undefined") return false;
  if (document.body?.classList.contains("inkling-native-shell")) return true;
  if (typeof window.matchMedia === "function") {
    if (window.matchMedia("(max-width: 768px)").matches) return true;
    if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return true;
  }
  return window.innerWidth <= 768;
}
