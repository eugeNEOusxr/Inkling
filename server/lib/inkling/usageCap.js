/**
 * Per-user daily cap on paid AI calls (chat + extraction) so the owner's
 * Anthropic credits can't be drained. In-memory + resets each day (fine for a
 * soft cap; survives within a deploy). Caps are generous defaults, env-tunable.
 */
const counts = new Map(); // email -> { day, chat, extract }

const CAPS = {
  chat: Number(process.env.AI_DAILY_CHAT_CAP || 120),
  extract: Number(process.env.AI_DAILY_EXTRACT_CAP || 300)
};

/**
 * Count one use; returns false when the user is over today's cap for that kind.
 * @param {string} email
 * @param {"chat"|"extract"} kind
 */
export function allowAiUse(email, kind) {
  if (!email) return false;
  const day = new Date().toISOString().slice(0, 10);
  let rec = counts.get(email);
  if (!rec || rec.day !== day) { rec = { day, chat: 0, extract: 0 }; counts.set(email, rec); }
  const cap = CAPS[kind] ?? 100;
  if (rec[kind] >= cap) return false;
  rec[kind] += 1;
  return true;
}
