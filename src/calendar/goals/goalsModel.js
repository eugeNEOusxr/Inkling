/**
 * Goals store — the user's goals, kept locally and emitted on the bus so Inkling
 * + the connections world can later build comparative links between goals and the
 * day-to-day notes that move them forward.
 */
import * as bus from "../../utils/EventBus.js";

export const GOALS_KEY = "inkling-goals-v1";

/**
 * @typedef {{
 *   id: string, text: string, category: string,
 *   horizon: "short"|"long", status: "active"|"achieved"|"dropped",
 *   createdAt: number, achievedAt?: number
 * }} Goal
 */

function emit() {
  try { bus.emit("goalsChanged", {}); } catch { /* ignore */ }
}

/** @returns {Goal[]} */
export function loadGoals() {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize);
  } catch { return []; }
}

function normalize(g) {
  return {
    id: String(g.id ?? (crypto.randomUUID?.() ?? `g${Date.now()}${Math.random()}`)),
    text: String(g.text ?? "").trim(),
    category: String(g.category ?? "personal").toLowerCase(),
    horizon: g.horizon === "long" ? "long" : "short",
    status: g.status === "achieved" || g.status === "dropped" ? g.status : "active",
    createdAt: Number(g.createdAt) || Date.now(),
    achievedAt: Number.isFinite(g.achievedAt) ? Number(g.achievedAt) : undefined
  };
}

function save(goals) {
  try { localStorage.setItem(GOALS_KEY, JSON.stringify(goals)); return true; }
  catch { return false; }
}

/**
 * @param {{ text: string, category?: string, horizon?: "short"|"long" }} fields
 * @returns {Goal}
 */
export function addGoal({ text, category = "personal", horizon = "short" }) {
  const goal = normalize({
    id: crypto.randomUUID?.() ?? `g${Date.now()}`,
    text, category, horizon, status: "active", createdAt: Date.now()
  });
  const goals = loadGoals();
  goals.push(goal);
  save(goals);
  emit();
  return goal;
}

/**
 * @param {string} id
 * @param {Partial<Goal>} changes
 */
export function updateGoal(id, changes) {
  const goals = loadGoals();
  const idx = goals.findIndex((g) => g.id === id);
  if (idx < 0) return null;
  goals[idx] = normalize({ ...goals[idx], ...changes });
  save(goals);
  emit();
  return goals[idx];
}

/**
 * @param {string} id
 * @param {"active"|"achieved"|"dropped"} status
 */
export function setGoalStatus(id, status) {
  return updateGoal(id, { status, achievedAt: status === "achieved" ? Date.now() : undefined });
}

/** @param {string} id */
export function removeGoal(id) {
  const goals = loadGoals().filter((g) => g.id !== id);
  save(goals);
  emit();
}

/** Active goals, newest first. @returns {Goal[]} */
export function getActiveGoals() {
  return loadGoals().filter((g) => g.status === "active").sort((a, b) => b.createdAt - a.createdAt);
}
