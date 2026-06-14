/**
 * Inkling pattern brain — reads the logged timeline + resolved alerts and surfaces
 * connections the user might miss: sleep window, busiest day/hour, free time,
 * what they log most, and follow-through. Pure heuristics (no LLM), so it works
 * for guests too. The 3D "connections world" will later render these same facts.
 *
 * KEY TRUTH (tell the user): connections only emerge with DATA. A near-empty
 * calendar yields "jot more" — that's honest, not a failure.
 */
import { getEventsForYear, classifyText } from "../../wordweaver/timelineModel.js";
import { getResolvedAlerts, getAlertsAwaitingReview, loadAlerts } from "../alerts/alertsModel.js";

const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SLEEP_RE = /\b(sleep|bed|bedtime|asleep|nap|lights?\s*out|turn in|wind ?down)\b/i;
const WAKE_RE = /\b(wake|woke|wake-?up|alarm|get up|rise|rose|morning)\b/i;

export const CONNECTIONS_PROMPT = "Are there any connections you would like help making?";

function parseMin(t) {
  const m = /(\d{1,2}):(\d{2})/.exec(String(t || ""));
  if (!m) return null;
  return Math.min(1439, Math.max(0, Number(m[1]) * 60 + Number(m[2])));
}

/** 540 → "9:00 AM" */
export function fmtClock(min) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Crunch the year's events into a structured pattern summary.
 * @param {{ year?: number, now?: number }} [opts]
 */
export function analyzePatterns({ year = new Date().getFullYear(), now = Date.now() } = {}) {
  let events = [];
  try { events = getEventsForYear(year); } catch { /* ignore */ }
  const total = events.length;

  /** @type {Record<string, number>} */
  const catCounts = {};
  const byWeekday = new Array(7).fill(0);
  const byHour = new Array(24).fill(0);
  /** @type {Record<string, number>} */
  const byDate = {};
  const wakeMins = [];
  const sleepMins = [];

  for (const e of events) {
    let cat = String(e.category || "").toLowerCase().trim();
    if (!cat || cat === "default") { try { cat = classifyText(e.text || "") || "other"; } catch { cat = "other"; } }
    catCounts[cat] = (catCounts[cat] || 0) + 1;
    const d = new Date(`${e.date}T12:00:00`);
    if (!Number.isNaN(d.getTime())) byWeekday[d.getDay()]++;
    const mm = parseMin(e.time);
    if (mm != null) byHour[Math.floor(mm / 60)]++;
    byDate[e.date] = (byDate[e.date] || 0) + 1;
    const text = `${e.text || ""} ${cat}`;
    if (mm != null) {
      if (WAKE_RE.test(text) && mm < 12 * 60) wakeMins.push(mm);
      if (SLEEP_RE.test(text)) sleepMins.push(mm);
    }
  }

  const busiestWeekday = byWeekday.some((c) => c > 0) ? byWeekday.indexOf(Math.max(...byWeekday)) : -1;
  const busiestHour = byHour.some((c) => c > 0) ? byHour.indexOf(Math.max(...byHour)) : -1;
  let busiestDay = null;
  let busiestDayCount = 0;
  for (const [d, c] of Object.entries(byDate)) {
    if (c > busiestDayCount) { busiestDayCount = c; busiestDay = d; }
  }

  // Free daytime hours (07:00–22:00) with the fewest events.
  const dayHours = [];
  for (let h = 7; h <= 22; h++) dayHours.push([h, byHour[h]]);
  dayHours.sort((a, b) => a[1] - b[1]);
  const freeHours = dayHours.filter(([, c]) => c === 0).slice(0, 3).map(([h]) => h);

  let resolved = [];
  try { resolved = getResolvedAlerts(now, 30 * 24 * 60 * 60 * 1000); } catch { /* ignore */ }
  const done = resolved.filter((a) => a.status === "done").length;
  const missed = resolved.filter((a) => a.status === "missed").length;

  const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return {
    year, total, catCounts, topCats,
    byWeekday, byHour, byDate,
    busiestWeekday, busiestHour, busiestDay, busiestDayCount,
    freeHours,
    wake: median(wakeMins), sleep: median(sleepMins),
    done, missed,
    activeDays: Object.keys(byDate).length,
    sufficiency: total < 20 ? "low" : total < 80 ? "medium" : "high"
  };
}

/**
 * Human-readable insight lines from a pattern summary.
 * @param {ReturnType<typeof analyzePatterns>} [p]
 * @returns {string[]}
 */
export function patternInsights(p = analyzePatterns()) {
  if (p.total === 0) {
    return ["I don't see any notes yet. Jot down your days — alarms, meals, workouts, work blocks, appointments — and I'll start spotting the connections between them."];
  }
  const lines = [];
  if (p.wake != null) lines.push(`🌅 You usually start your day around <b>${fmtClock(p.wake)}</b>.`);
  if (p.sleep != null) lines.push(`🌙 Your wind-down/sleep tends to land near <b>${fmtClock(p.sleep)}</b>.`);
  if (p.busiestWeekday >= 0) lines.push(`📊 <b>${WD[p.busiestWeekday]}</b> is your busiest day of the week.`);
  if (p.busiestHour >= 0) lines.push(`⏰ Your most packed hour is around <b>${fmtClock(p.busiestHour * 60)}</b>.`);
  if (p.freeHours.length) lines.push(`🪟 You often have free time around <b>${p.freeHours.map((h) => fmtClock(h * 60)).join(", ")}</b>.`);
  if (p.topCats.length) lines.push(`🗂 Most of what you log is <b>${p.topCats.map(([c, n]) => `${c} (${n})`).join(", ")}</b>.`);
  if (p.done + p.missed > 0) lines.push(`✅ Lately you've completed <b>${p.done}</b> and missed <b>${p.missed}</b> of the reminders you checked off.`);
  return lines;
}

/**
 * The honest "you need more data" nudge, scaled to how much is logged.
 * @param {ReturnType<typeof analyzePatterns>} [p]
 * @returns {string | null}
 */
export function dataNudge(p = analyzePatterns()) {
  if (p.sufficiency === "high") return null;
  if (p.total === 0) return "The more you jot down, the more I can connect. Even a week of honest logging unlocks real patterns.";
  if (p.sufficiency === "low") {
    return `You've logged <b>${p.total}</b> notes across <b>${p.activeDays}</b> days. Keep going — patterns get sharp once you're logging most days. The richer the diary, the more I can connect.`;
  }
  return `Good start — <b>${p.total}</b> notes in. A few more weeks of consistent logging and these patterns will firm up into reports.`;
}

/**
 * Reports Inkling COULD generate once the user logs the right specifics.
 * @returns {{ id: string, label: string, need: string }[]}
 */
export function reportSuggestions() {
  return [
    { id: "sleep", label: "😴 Sleep-consistency report", need: "log a bedtime + wake-up each day" },
    { id: "focus", label: "🎯 Focus / productivity windows", need: "tag work & study blocks with times" },
    { id: "health", label: "💪 Health & habit streaks", need: "log workouts, meals, water" },
    { id: "adherence", label: "✅ Follow-through report", need: "check reminders off ✓/✗ as you go" },
    { id: "balance", label: "⚖️ Work–life balance", need: "log both work and personal/social time" }
  ];
}

// ── People-aware connections ───────────────────────────────────────────────
// Names that follow a relational cue ("lunch with Tom", "call Sarah", "meet …").
const PEOPLE_RE = /\b(?:with|w\/|meet(?:ing)?(?:\s+with)?|call|see|saw|visit|lunch with|dinner with|coffee with|catch up with)\s+([A-Z][a-z]+)\b/g;
const ACTION_RE = /\b(lunch|dinner|coffee|breakfast|brunch|drinks|meeting|call|chat|catch ?up|date|appointment)\b/i;
const NOT_NAMES = new Set([
  "the", "me", "my", "myself", "team", "him", "her", "them", "you", "i",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "today", "tomorrow", "everyone", "someone", "work", "lunch", "dinner"
]);

/**
 * People the user logs time with, most-frequent first.
 * @returns {{ name: string, count: number, lastIso: string, lastText: string }[]}
 */
export function extractPeople({ year = new Date().getFullYear() } = {}) {
  let events = [];
  try { events = getEventsForYear(year); } catch { /* ignore */ }
  /** @type {Map<string, { name: string, count: number, lastIso: string, lastText: string }>} */
  const map = new Map();
  for (const e of events) {
    const text = `${e.text || ""} ${e.title || ""}`;
    PEOPLE_RE.lastIndex = 0;
    let m;
    while ((m = PEOPLE_RE.exec(text))) {
      const name = m[1].trim();
      if (NOT_NAMES.has(name.toLowerCase())) continue;
      const cur = map.get(name) || { name, count: 0, lastIso: "", lastText: "" };
      cur.count++;
      if (!cur.lastIso || (e.date && e.date >= cur.lastIso)) {
        cur.lastIso = e.date || cur.lastIso;
        cur.lastText = (e.text || e.title || "").trim();
      }
      map.set(name, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/**
 * Casual check-in questions about recent past hangouts ("How did lunch with Tom go?").
 * @returns {string[]}
 */
export function checkInQuestions({ now = Date.now(), max = 3 } = {}) {
  const today = new Date(now).toISOString().slice(0, 10);
  const out = [];
  for (const p of extractPeople()) {
    if (!p.lastIso || p.lastIso > today) continue; // only past events
    const act = (ACTION_RE.exec(p.lastText)?.[1] || "time").toLowerCase();
    out.push(`How did ${act === "time" ? "your time" : act} with ${p.name} go?`);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * "Follow up with X" nudges for people you haven't logged recently.
 * @returns {{ name: string, label: string, dueIso: string }[]}
 */
export function followUpSuggestions({ now = Date.now(), max = 4 } = {}) {
  const due = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return extractPeople().slice(0, max).map((p) => ({
    name: p.name,
    label: `Follow up with ${p.name}`,
    dueIso: due
  }));
}

/**
 * Recently-saved alert remarks ("Appointment with Tom — no show"), newest first.
 * @returns {{ text: string, remark: string, status: string }[]}
 */
export function recentRemarks({ max = 6 } = {}) {
  let all = [];
  try { all = loadAlerts(); } catch { /* ignore */ }
  // Touch the alert-read helpers so a stale import is obvious if the API changes.
  void getAlertsAwaitingReview;
  return all
    .filter((a) => a.remark && a.remark.trim() && !a.dismissed)
    .sort((a, b) => (b.resolvedAt ?? b.createdAt ?? 0) - (a.resolvedAt ?? a.createdAt ?? 0))
    .slice(0, max)
    .map((a) => ({ text: a.text || "Reminder", remark: a.remark, status: a.status || "pending" }));
}
