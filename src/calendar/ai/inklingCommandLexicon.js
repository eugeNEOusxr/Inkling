/**
 * Inkling Command Language — structured task jargon (NOT casual conversation).
 * Phrases may be spoken with or without a leading "Inkling," prefix.
 */

/**
 * @param {readonly string[]} phrases
 */
function phrasePattern(phrases) {
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?:${escaped.join("|")})`, "i");
}

/** @type {readonly string[]} */
export const NOTE_COMMAND_PHRASES = [
  "log this",
  "capture this note",
  "record the following",
  "jot this down",
  "add a note",
  "store this thought",
  "save this idea",
  "write this into my notes",
  "note this for later",
  "append this to my notebook",
  "document this",
  "take this down verbatim",
  "create a new entry",
  "start a fresh note",
  "archive this detail",
  "capture this memory",
  "store this in long-term notes",
  "pin this",
  "snapshot this thought",
  "write this under today",
  "log mode",
  "note-taking mode",
  "note directive",
  "recording mode",
  "begin structured input",
  "task capture mode"
];

/** @type {readonly string[]} */
export const APPOINTMENT_COMMAND_PHRASES = [
  "schedule an appointment",
  "create a booking",
  "add an appointment to my calendar",
  "register this appointment",
  "log an appointment",
  "place this on my schedule",
  "set an appointment for",
  "block out time",
  "reserve time for",
  "add a calendar entry",
  "schedule a session",
  "mark my calendar",
  "create a time slot",
  "put this on the appointments wall",
  "add this to my day planner",
  "set a date for this",
  "schedule this event",
  "add a reminder appointment",
  "create a timed appointment",
  "appointment directive",
  "calendar mode"
];

/** @type {readonly string[]} */
export const MEDICAL_APPOINTMENT_PHRASES = [
  "schedule a dentist appointment",
  "log a doctor visit",
  "add a medical appointment",
  "set a check-up for",
  "set a check up for",
  "record a dental cleaning",
  "add a health appointment",
  "schedule my follow-up",
  "schedule my follow up",
  "book my next dentist slot",
  "add a wellness appointment",
  "put my dental appointment on the calendar",
  "dentist appointment",
  "doctor visit",
  "dental cleaning",
  "medical appointment",
  "health appointment",
  "wellness appointment",
  "follow-up",
  "follow up"
];

/** @type {readonly string[]} */
export const REMINDER_COMMAND_PHRASES = [
  "remind me",
  "set a reminder",
  "alert me at",
  "ping me when it's time",
  "ping me when its time",
  "notify me about this",
  "set a timed alert",
  "create a reminder entry",
  "add a countdown reminder",
  "set a nudge for",
  "schedule a reminder",
  "trigger a reminder at",
  "set a follow-up reminder",
  "set a follow up reminder"
];

/** @type {readonly string[]} */
export const VISUAL_NOTE_COMMAND_PHRASES = [
  "draw this out",
  "sketch this idea",
  "create a diagram",
  "visualize this note",
  "make a quick drawing",
  "render this concept",
  "draft a visual note",
  "illustrate this",
  "map this out",
  "turn this into a chart",
  "draw a layout",
  "diagram the following",
  "produce a visual summary",
  "sketch a flowchart",
  "create a mind map"
];

/** @type {readonly string[]} */
export const TASK_COMMAND_PHRASES = [
  "add this to my to-do list",
  "add this to my todo list",
  "create a task",
  "log this task",
  "add this to my action items",
  "record this as a task",
  "put this on my task board",
  "add this to my checklist",
  "create a follow-up task",
  "create a follow up task",
  "track this task",
  "add this to my workflow",
  "task directive",
  "command mode"
];

/** @type {readonly string[]} */
export const DIRECTIVE_MODE_PHRASES = [
  "command mode",
  "task directive",
  "note directive",
  "appointment directive",
  "recording mode",
  "log mode",
  "calendar mode",
  "note-taking mode",
  "note taking mode",
  "task capture mode",
  "begin structured input"
];

/** @type {readonly string[]} */
export const META_QUERY_PHRASES = [
  "show me my notes",
  "list my appointments",
  "display today's reminders",
  "display todays reminders",
  "summarize my tasks",
  "review my notes from today",
  "open the appointments wall",
  "open the notebook wall",
  "show my upcoming schedule",
  "filter notes by date",
  "search my notes for",
  "list my reminders",
  "show my tasks",
  "show my calendar",
  "display my schedule"
];

/**
 * Only treat as commands when paired with save/log language (otherwise conversational).
 * @type {readonly string[]}
 */
export const RETROACTIVE_STATUS_PHRASES = [
  "did you write down",
  "did you save that note",
  "did you log that",
  "did you add that appointment",
  "did you capture",
  "did you record"
];

export const COMMAND_PATTERNS = {
  note: phrasePattern(NOTE_COMMAND_PHRASES),
  appointment: phrasePattern(APPOINTMENT_COMMAND_PHRASES),
  medical: phrasePattern(MEDICAL_APPOINTMENT_PHRASES),
  reminder: phrasePattern(REMINDER_COMMAND_PHRASES),
  visual: phrasePattern(VISUAL_NOTE_COMMAND_PHRASES),
  task: phrasePattern(TASK_COMMAND_PHRASES),
  directive: phrasePattern(DIRECTIVE_MODE_PHRASES),
  metaQuery: phrasePattern(META_QUERY_PHRASES),
  retroStatus: phrasePattern(RETROACTIVE_STATUS_PHRASES)
};

/**
 * @param {string} text
 */
export function stripInklingCommandPrefix(text) {
  let s = String(text ?? "").trim();
  s = s.replace(/^\s*inkling[,:]?\s*/i, "");
  return s.trim();
}

/**
 * @param {string} lower
 */
export function isInklingCommandLanguage(lower) {
  if (/^\s*inkling[,:]?\s+/i.test(lower) || lower.startsWith("inkling ")) return true;
  return (
    COMMAND_PATTERNS.note.test(lower) ||
    COMMAND_PATTERNS.appointment.test(lower) ||
    COMMAND_PATTERNS.medical.test(lower) ||
    COMMAND_PATTERNS.reminder.test(lower) ||
    COMMAND_PATTERNS.visual.test(lower) ||
    COMMAND_PATTERNS.task.test(lower) ||
    COMMAND_PATTERNS.directive.test(lower) ||
    COMMAND_PATTERNS.metaQuery.test(lower)
  );
}

/**
 * Section 8 — status checks stay chat unless they also request an action.
 * @param {string} lower
 */
export function isRetroactiveStatusCheck(lower) {
  return COMMAND_PATTERNS.retroStatus.test(lower);
}

/**
 * Compact rules for the LLM system prompt (full phrase bank is in parser patterns).
 */
export function buildCommandLanguagePromptForLlm() {
  return `
INKLING COMMAND LANGUAGE (not casual chat):
When the user uses command jargon or starts with "Inkling," treat it as a structured calendar/task request, NOT small talk.

Kinds:
- NOTE: log/capture/jot/document/pin/snapshot/store thought, visual/sketch/diagram/mind map → kind "note"
- APPOINTMENT: schedule/book/block/reserve/calendar entry/session/dentist/doctor/medical/check-up → kind "appointment"
- REMINDER: remind/alert/ping/nudge/notify/timed alert/countdown → kind "reminder"
- ALARM: alarm/wake me → kind "alarm"
- TASK: to-do/task/checklist/action item/workflow → kind "note" (task text in body)
- QUERY: show/list/display/summarize/review/open wall/search/filter schedule or notes → action "query_schedule" (not "none")
- DIRECTIVE MODE: "command mode", "note directive", "calendar mode", "begin structured input" → user wants structured capture; ask what to log if no content yet
- RETROACTIVE STATUS ("did you write down…", "did you save…") WITHOUT a new item to add → action "none", answer conversationally about confirm/save flow

Hard rule: Command phrasing overrides casual tone. "Inkling, log this: …" is propose, not chat.
Never treat "Inkling, schedule…" or "capture this note" as general conversation.
If command text lacks date/time, infer from words (today/tomorrow) or use referenceDate + reasonable default time, and propose for confirmation.

Examples of command (propose/query): "Inkling, jot this down: call pharmacy 3pm", "log an appointment Tuesday 2pm dentist", "remind me at 7am", "show my upcoming schedule", "add this to my to-do list: email landlord".
Examples of chat (action none): "how was your day", "what do you think about…", "hey did you catch the game" (no save/log intent).
`.trim();
}
