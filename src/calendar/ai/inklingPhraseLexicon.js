/**
 * Inkling phrase building blocks — how people ask an assistant to manage notes & time.
 * Used by the rule parser and mirrored in the LLM system prompt on the server.
 */

import {
  NOTE_COMMAND_PHRASES,
  APPOINTMENT_COMMAND_PHRASES,
  MEDICAL_APPOINTMENT_PHRASES,
  REMINDER_COMMAND_PHRASES,
  VISUAL_NOTE_COMMAND_PHRASES,
  TASK_COMMAND_PHRASES,
  META_QUERY_PHRASES
} from "./inklingCommandLexicon.js";

function mergeUnique(...lists) {
  return [...new Set(lists.flat())];
}

/** @type {readonly string[]} */
export const GREETINGS = [
  "hi",
  "hello",
  "hey",
  "good morning",
  "good afternoon",
  "good evening",
  "howdy"
];

/** @type {readonly string[]} */
export const THANKS = ["thanks", "thank you", "thx", "appreciate it", "perfect", "awesome"];

/** @type {readonly string[]} */
const NOTE_CAPTURE_BASE = [
  "jot",
  "jot down",
  "write down",
  "take note",
  "take notes",
  "note down",
  "make a note",
  "make notes",
  "capture",
  "record",
  "log",
  "remember",
  "don't forget",
  "dont forget",
  "do not forget",
  "remind me to note",
  "put in my notes",
  "put in notes",
  "put this in",
  "add to notebook",
  "add to my notebook",
  "save this",
  "hold onto",
  "keep track",
  "track that",
  "store this",
  "enter this",
  "type this",
  "scribble",
  "scratch",
  "quick note",
  "voice note",
  "note to self",
  "pencil in",
  "write",
  "add",
  "put",
  "save",
  "store"
];

export const NOTE_CAPTURE_VERBS = mergeUnique(NOTE_CAPTURE_BASE, NOTE_COMMAND_PHRASES, VISUAL_NOTE_COMMAND_PHRASES, TASK_COMMAND_PHRASES);

/** @type {readonly string[]} */
const SCHEDULE_VERBS_BASE = [
  "schedule",
  "book",
  "set",
  "plan",
  "block",
  "hold",
  "reserve",
  "calendar",
  "slot",
  "fit in",
  "squeeze in"
];

export const SCHEDULE_VERBS = mergeUnique(SCHEDULE_VERBS_BASE, APPOINTMENT_COMMAND_PHRASES);

/** @type {readonly string[]} */
const REMINDER_VERBS_BASE = [
  "remind me",
  "reminder",
  "nudge me",
  "ping me",
  "alert me",
  "notify me",
  "heads up"
];

export const REMINDER_VERBS = mergeUnique(REMINDER_VERBS_BASE, REMINDER_COMMAND_PHRASES);

/** @type {readonly string[]} */
export const ALARM_VERBS = ["alarm", "wake me", "wake up"];

/** @type {readonly string[]} */
const APPOINTMENT_NOUNS_BASE = [
  "appointment",
  "meeting",
  "call",
  "dentist",
  "doctor",
  "interview",
  "session",
  "checkup",
  "check-up",
  "visit",
  "lunch",
  "dinner",
  "coffee",
  "sync"
];

export const APPOINTMENT_NOUNS = mergeUnique(APPOINTMENT_NOUNS_BASE, MEDICAL_APPOINTMENT_PHRASES);

/** @type {readonly string[]} */
export const NOTE_NOUNS = ["note", "notes", "thought", "idea", "memo", "entry", "jot", "task", "to-do", "todo"];

/** @type {readonly string[]} */
const SCHEDULE_QUERY_BASE = [
  "what's on",
  "whats on",
  "what is on",
  "what do i have",
  "what have i got",
  "what am i doing",
  "show my schedule",
  "show my calendar",
  "read my schedule",
  "read my calendar",
  "walk me through",
  "run through",
  "tell me what's",
  "tell me what is",
  "anything on",
  "anything scheduled",
  "my day look like",
  "plans for",
  "on my plate"
];

export const SCHEDULE_QUERY_PHRASES = mergeUnique(SCHEDULE_QUERY_BASE, META_QUERY_PHRASES);

/** @type {readonly string[]} */
export const FREE_TIME_PHRASES = [
  "free time",
  "free slot",
  "free window",
  "open slot",
  "open window",
  "opening",
  "openings",
  "available",
  "availability",
  "am i free",
  "when am i free",
  "what time am i free",
  "do i have time",
  "any time open",
  "find time",
  "find a time",
  "squeeze something in",
  "busy",
  "double booked",
  "open afternoon",
  "open morning"
];

/** @type {readonly string[]} */
export const TIME_WORDS = [
  "noon",
  "midday",
  "midnight",
  "morning",
  "afternoon",
  "evening",
  "tonight",
  "this morning",
  "this afternoon",
  "this evening",
  "end of day",
  "eod",
  "first thing",
  "after lunch",
  "before lunch"
];

/**
 * Build a word-boundary regex alternation from phrases (longest first).
 * @param {readonly string[]} phrases
 */
export function phrasePattern(phrases) {
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(?:${escaped.join("|")})\\b`, "i");
}

export const PATTERNS = {
  greeting: phrasePattern(GREETINGS),
  thanks: phrasePattern(THANKS),
  noteCapture: phrasePattern(NOTE_CAPTURE_VERBS),
  scheduleVerb: phrasePattern(SCHEDULE_VERBS),
  reminder: phrasePattern(REMINDER_VERBS),
  alarm: phrasePattern(ALARM_VERBS),
  appointmentNoun: phrasePattern(APPOINTMENT_NOUNS),
  noteNoun: phrasePattern(NOTE_NOUNS),
  scheduleQuery: phrasePattern(SCHEDULE_QUERY_PHRASES),
  freeTime: phrasePattern(FREE_TIME_PHRASES)
};

/** Short list for LLM / welcome copy */
export const INKLING_CAPABILITY_EXAMPLES = [
  "Inkling, log this: follow up with Jeremy Friday 2pm",
  "Inkling, schedule a dentist appointment next Tuesday at 3pm",
  "Inkling, set a reminder at 7am — take medication",
  "Inkling, show my upcoming schedule",
  "Inkling, add this to my to-do list: email landlord",
  "When am I free tomorrow afternoon?"
];

export { buildCommandLanguagePromptForLlm } from "./inklingCommandLexicon.js";
