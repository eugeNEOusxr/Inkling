/**
 * Inkling — hybrid intent parser (free phrasing, not rigid commands).
 */

/**
 * Safe trim only — never drops the first word or token.
 * @param {string} transcript
 */
export function normalizeTranscript(transcript) {
  return String(transcript ?? "").trim();
}

/**
 * Normalize speech-to-text or typed input; preserve the full utterance.
 * @param {string} text
 * @returns {{ raw: string, cleaned: string, words: string[] }}
 */
export function parseSpeechInput(text) {
  const raw = String(text ?? "");
  const cleaned = normalizeTranscript(raw);
  const words = cleaned ? cleaned.split(/\s+/) : [];
  return { raw, cleaned, words };
}

/**
 * @param {string} text
 * @param {Date} [ref]
 */
export function handleVoiceCommand(text, ref = new Date()) {
  const parsed = parseSpeechInput(text);
  const intent = parseInklingMessage(parsed.cleaned, ref);
  return { ...parsed, intent };
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

/**
 * @typedef {'chat'|'query_schedule'|'query_free_time'|'propose_schedule'|'confirm_schedule'|'delete_item'} InklingIntent
 */

/**
 * @param {string} text
 * @param {Date} [ref]
 */
export function parseInklingMessage(text, ref = new Date()) {
  const { raw, cleaned } = parseSpeechInput(text);
  if (!cleaned) return { type: "chat", reply: "Say anything — I’ll help with your calendar." };

  const lower = cleaned.toLowerCase();

  if (/^(hi|hello|hey|thanks|thank you)\b/.test(lower)) {
    return { type: "chat", reply: "Hi — I’m Inkling. Ask what’s on your schedule, or say something like “dentist Friday at 2pm”." };
  }

  if (matchesDelete(lower)) {
    return {
      type: "delete_item",
      reply: "I can help remove items — open that day on the calendar and delete from the timeline, or tell me the exact reminder text.",
      raw
    };
  }

  if (matchesScheduleQuery(lower)) {
    const range = resolveDateRange(lower, ref);
    return {
      type: "query_schedule",
      date: range.start,
      endDate: range.end,
      reply: null
    };
  }

  if (matchesFreeTime(lower)) {
    const date = resolveDateRange(lower, ref).start;
    return { type: "query_free_time", date, reply: null };
  }

  const proposal = tryProposeSchedule(raw, cleaned, lower, ref);
  if (proposal) {
    return {
      type: "propose_schedule",
      proposal,
      reply: `I heard: **${raw}**. Add this to your calendar?`
    };
  }

  return {
    type: "chat",
    reply:
      "I’m not sure yet — try natural phrases like “what’s on tomorrow”, “find free time Friday”, or “put lunch with Sam Tuesday at noon”."
  };
}

function matchesDelete(lower) {
  return (
    /\b(delete|remove|cancel|eliminate|clear)\b/.test(lower) &&
    /\b(alarm|reminder|appointment|alert|note)\b/.test(lower)
  );
}

function matchesScheduleQuery(lower) {
  return (
    /\b(what|show|tell|look|read|my schedule|on my calendar|stored|have)\b/.test(lower) &&
    /\b(schedule|calendar|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|appointment|reminder|alarm|note)\b/.test(
      lower
    )
  );
}

function matchesFreeTime(lower) {
  return /\b(free time|free slot|opening|openings|available|find time)\b/.test(lower);
}

/**
 * @param {string} raw
 * @param {string} cleaned
 * @param {string} lower
 * @param {Date} ref
 */
function tryProposeSchedule(raw, cleaned, lower, ref) {
  const hasVerb =
    /\b(add|put|make|create|save|store|schedule|set|book|jot|write|remind|appointment|note)\b/.test(
      lower
    );
  const time = parseTime(lower, ref);
  const date = parseDatePhrase(lower, ref);
  if (!hasVerb && !time) return null;

  const isAppt =
    /\b(appointment|meeting|dentist|doctor|interview|call|lunch|dinner|coffee|breakfast)\b/.test(lower) &&
    !/\bnote\b/.test(lower);

  // Strip the command verb + date/time tokens so "put lunch with amanda at 130
  // today" stores just "lunch with amanda" — not "put …".
  const title = extractTitle(cleaned) || cleaned;
  const text = title;
  const label = title;

  if (!date) return null;

  return {
    kind: isAppt ? "appointment" : "note",
    date,
    time: time ?? "09:00",
    text,
    label,
    raw,
    cleaned,
    words: cleaned.split(/\s+/)
  };
}

function extractTitle(raw) {
  const cleaned = raw
    .replace(/\b(add|put|make|create|save|store|schedule|set|book|jot|write|remind|me to|please)\b/gi, "")
    .replace(/\b(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, "")
    .replace(/\b(at|on|for|by)\b/gi, " ")
    .replace(/\b\d{1,4}(:\d{2})?\s*(am|pm)?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2) return "";
  return cleaned.slice(0, 120);
}

/**
 * @param {string} lower
 * @param {Date} ref
 */
function parseTime(lower, ref) {
  const fmt = (h, min) => `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  // No am/pm but clearly an afternoon/evening context → treat 1–7 as PM
  // ("lunch ... at 1:30" / "dinner at 6" → PM, not AM).
  const mealPm = /\b(lunch|dinner|afternoon|evening|tonight|noon|pm)\b/.test(lower);
  const adj = (h, hadMeridiem) => (!hadMeridiem && mealPm && h >= 1 && h <= 7 ? h + 12 : h);

  const m12 = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m12) {
    let h = Number(m12[1]) % 12;
    const min = m12[2] ? Number(m12[2]) : 0;
    if (m12[3] === "pm") h += 12;
    if (m12[3] === "am" && Number(m12[1]) === 12) h = 0;
    if (m12[3] === "pm" && Number(m12[1]) === 12) h = 12;
    return fmt(h, min);
  }

  const m24 = lower.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m24) {
    const h = adj(Math.min(23, Number(m24[1])), false);
    return fmt(h, Math.min(59, Number(m24[2])));
  }

  if (/\b(noon|midday)\b/.test(lower)) return "12:00";
  if (/\b(midnight)\b/.test(lower)) return "00:00";

  // Compact "at 130" / "at 1230" (no colon).
  const compact = lower.match(/\b(?:at|@)\s*(\d{1,2})(\d{2})\b/);
  if (compact) {
    const h = adj(Math.min(23, Number(compact[1])), false);
    return fmt(h, Math.min(59, Number(compact[2])));
  }

  const atHour = lower.match(/\b(?:at|@)\s*(\d{1,2})\b/);
  if (atHour) {
    return fmt(adj(Math.min(23, Number(atHour[1])), false), 0);
  }

  return null;
}

/**
 * @param {string} lower
 * @param {Date} ref
 */
function parseDatePhrase(lower, ref) {
  const r = resolveDateRange(lower, ref);
  return r.start;
}

/**
 * @param {string} lower
 * @param {Date} ref
 */
function resolveDateRange(lower, ref) {
  const base = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  if (/\btoday\b/.test(lower)) {
    const d = iso(base);
    return { start: d, end: d };
  }
  if (/\btomorrow\b/.test(lower)) {
    const t = new Date(base);
    t.setDate(t.getDate() + 1);
    const d = iso(t);
    return { start: d, end: d };
  }

  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(lower)) {
      const t = new Date(base);
      const diff = (i - t.getDay() + 7) % 7 || 7;
      t.setDate(t.getDate() + diff);
      const d = iso(t);
      return { start: d, end: d };
    }
  }

  const inDays = lower.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDays) {
    const t = new Date(base);
    t.setDate(t.getDate() + Number(inDays[1]));
    const d = iso(t);
    return { start: d, end: d };
  }

  return { start: iso(base), end: iso(base) };
}

function formatHumanDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatHumanTime(time) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: m ? "2-digit" : undefined });
}
