/**
 * AI usage caps so the owner's Anthropic/Claude credits can't be run up by users.
 * Two layers, both in-memory + reset each day (soft caps; survive within a deploy):
 *   1. PER-USER daily cap per kind (chat / extract / studymap / flashcards).
 *   2. A GLOBAL daily ceiling across ALL users — the owner's hard cost backstop:
 *      once the whole app has made this many paid AI calls today, everything falls
 *      back to the free/local mode until tomorrow, no matter how many users.
 * All values are env-tunable so they can be raised once monetization funds them.
 */
const counts = new Map(); // email -> { day, chat, extract, studymap, flashcards }

const CAPS = {
  chat: Number(process.env.AI_DAILY_CHAT_CAP || 40),
  extract: Number(process.env.AI_DAILY_EXTRACT_CAP || 120),
  studymap: Number(process.env.AI_DAILY_STUDYMAP_CAP || 15),
  flashcards: Number(process.env.AI_DAILY_FLASHCARD_CAP || 30)
};

// Hard ceiling on total paid AI calls across ALL users per day. Set conservatively
// so a bad day can't surprise-bill the owner; raise via env as revenue allows.
const GLOBAL_CAP = Number(process.env.AI_DAILY_GLOBAL_CAP || 600);
let gDay = null, gCount = 0;

/**
 * Count one use; returns false when the user is over today's per-kind cap OR the
 * whole app is over today's global ceiling. Only counts a use when it's allowed.
 * @param {string} email
 * @param {"chat"|"extract"|"studymap"|"flashcards"} kind
 */
export function allowAiUse(email, kind) {
  if (!email) return false;
  const day = new Date().toISOString().slice(0, 10);

  // Global daily ceiling — the owner's cost backstop.
  if (gDay !== day) { gDay = day; gCount = 0; }
  if (gCount >= GLOBAL_CAP) return false;

  // Per-user daily cap. Initialize ALL kinds to 0 (previously studymap/flashcards
  // were undefined here, so `undefined >= cap` was false and they never capped).
  let rec = counts.get(email);
  if (!rec || rec.day !== day) { rec = { day, chat: 0, extract: 0, studymap: 0, flashcards: 0 }; counts.set(email, rec); }
  const cap = CAPS[kind] ?? 50;
  if ((rec[kind] || 0) >= cap) return false;

  rec[kind] = (rec[kind] || 0) + 1;
  gCount += 1;
  return true;
}

/** Current usage snapshot (for an owner/debug endpoint). */
export function usageSnapshot() {
  const day = new Date().toISOString().slice(0, 10);
  return { day, globalUsed: gDay === day ? gCount : 0, globalCap: GLOBAL_CAP, activeUsers: counts.size };
}
