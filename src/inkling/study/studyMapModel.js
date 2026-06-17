/**
 * Study Maps — universal "study path" structure: Topic → branches → leaves,
 * each leaf with a 4-level mastery. Haiku generates the hierarchy for any topic;
 * stored locally (like goals). Domain-agnostic: math, writing, music, anything.
 */
import { apiFetch } from "../../auth/cloudSync.js";

const KEY = "inkling-studymaps-v1";

export const MASTERY = ["Not yet", "Learning", "Confident", "Mastered"]; // 0..3
export const MASTERY_COLOR = ["#6b7280", "#f5a623", "#58a6ff", "#39d98a"];

function uid(p = "n") { return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

export function loadStudyMaps() {
  try { const r = localStorage.getItem(KEY); const a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function saveAll(maps) { try { localStorage.setItem(KEY, JSON.stringify(maps)); return true; } catch { return false; } }

export function getStudyMap(id) { return loadStudyMaps().find((m) => m.id === id) || null; }

export function saveStudyMap(map) {
  const maps = loadStudyMaps();
  const i = maps.findIndex((m) => m.id === map.id);
  if (i >= 0) maps[i] = map; else maps.unshift(map);
  saveAll(maps);
  return map;
}

export function deleteStudyMap(id) { saveAll(loadStudyMaps().filter((m) => m.id !== id)); }

/** Cycle a leaf's mastery 0→1→2→3→0 and persist. */
export function cycleMastery(mapId, leafId) {
  const map = getStudyMap(mapId);
  if (!map) return null;
  for (const br of map.branches) {
    const leaf = br.leaves.find((l) => l.id === leafId);
    if (leaf) { leaf.mastery = ((leaf.mastery || 0) + 1) % 4; saveStudyMap(map); return leaf.mastery; }
  }
  return null;
}

/** Mark a leaf at least "Learning" by label (auto-light from chat). */
export function touchLeavesByLabel(labels = []) {
  const want = new Set(labels.map((l) => String(l).toLowerCase()));
  if (!want.size) return 0;
  const maps = loadStudyMaps();
  let touched = 0;
  for (const map of maps) {
    for (const br of map.branches) {
      for (const leaf of br.leaves) {
        if (want.has(leaf.label.toLowerCase()) && (leaf.mastery || 0) < 1) { leaf.mastery = 1; touched++; }
      }
    }
  }
  if (touched) saveAll(maps);
  return touched;
}

export function mapProgress(map) {
  let sum = 0, total = 0;
  for (const br of map.branches) for (const leaf of br.leaves) { sum += (leaf.mastery || 0); total++; }
  return { total, pct: total ? Math.round((sum / (total * 3)) * 100) : 0 };
}

/**
 * Generate a study map for a topic via Haiku (server). Saves + returns it.
 * @returns {Promise<{ok:boolean, map?:object, reason?:string}>}
 */
export async function generateStudyMap(topic) {
  const clean = String(topic || "").trim();
  if (clean.length < 2) return { ok: false, reason: "empty" };
  let data;
  try {
    data = await apiFetch("/api/inkling/studymap", { method: "POST", body: JSON.stringify({ topic: clean }) });
  } catch { return { ok: false, reason: "offline" }; }
  if (data?.source === "guest") return { ok: false, reason: "signin" };
  if (data?.source === "capped") return { ok: false, reason: "capped" };
  if (!data?.branches?.length) return { ok: false, reason: "empty" };
  const map = {
    id: uid("sm"),
    topic: data.topic || clean,
    createdAt: Date.now(),
    branches: data.branches.map((br) => ({
      id: uid("b"),
      label: br.label,
      leaves: (br.leaves || []).map((label) => ({ id: uid("l"), label, mastery: 0 }))
    }))
  };
  saveStudyMap(map);
  return { ok: true, map };
}
