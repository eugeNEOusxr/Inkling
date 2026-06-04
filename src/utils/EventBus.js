/** @type {Map<string, Set<(payload: unknown) => void>>} */
const listeners = new Map();

/**
 * Subscribe to a named event.
 * @param {string} eventName
 * @param {(payload: unknown) => void} callback
 * @returns {() => void} unsubscribe
 */
export function on(eventName, callback) {
  const key = String(eventName);
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(callback);
  return () => off(eventName, callback);
}

/**
 * Remove a listener.
 * @param {string} eventName
 * @param {(payload: unknown) => void} callback
 */
export function off(eventName, callback) {
  listeners.get(String(eventName))?.delete(callback);
}

/**
 * Emit an event to all subscribers.
 * @param {string} eventName
 * @param {unknown} [payload]
 */
export function emit(eventName, payload) {
  const key = String(eventName);
  const set = listeners.get(key);
  if (!set?.size) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[EventBus] handler failed for "${key}"`, err);
    }
  }
}

export default { on, off, emit };
