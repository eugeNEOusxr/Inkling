/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/**
 * @param {string} eventName
 * @param {Function} handler
 */
export function on(eventName, handler) {
  const key = String(eventName);
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(handler);
}

/**
 * @param {string} eventName
 * @param {Function} handler
 */
export function off(eventName, handler) {
  listeners.get(String(eventName))?.delete(handler);
}

/**
 * @param {string} eventName
 * @param {unknown} [payload]
 */
export function emit(eventName, payload) {
  const set = listeners.get(String(eventName));
  if (!set?.size) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[EventBus] ${eventName}`, err);
    }
  }
}
