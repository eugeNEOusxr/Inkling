/**
 * Inkling + WordWeaver conversational routing — intent, tone, context, side chat.
 */

import { classifyText, CategoryColors } from "../../wordweaver/timelineModel.js";

/** @typedef {{ category: string, priority: string, icon: string, color: string }} ClassifiedEvent */

const EVENT_ICONS = {
  health: "♥",
  study: "📚",
  work: "💼",
  personal: "✦",
  creative: "🎨",
  errands: "🛒",
  errand: "🛒",
  finance: "💰",
  appointment: "📅",
  deadline: "⚠",
  reminder: "⏰",
  alarm: "⏰",
  default: "•"
};

/**
 * Classify note/event text for 3D calendar surfaces.
 * @param {string} text
 * @returns {ClassifiedEvent}
 */
export function classifyEvent(text) {
  const raw = String(text ?? "").trim();
  const category = classifyText(raw);
  const key = category === "errand" ? "errands" : category;
  const color = CategoryColors[key] ?? CategoryColors.default;
  let priority = "normal";
  if (/urgent|asap|emergency|critical/i.test(raw)) priority = "high";
  else if (/deadline|due|important/i.test(raw)) priority = "medium";
  const icon = EVENT_ICONS[key] ?? EVENT_ICONS.default;
  return { category: key, priority, icon, color };
}

/** @typedef {'openWriter'|'openCalendar'|'openWordWeaver'|'storeNote'|'createAlert'|'sideConversation'|'askClarification'|'none'} BrainAction */

/**
 * @typedef {Object} BrainState
 * @property {{ role: string, content: string }[]} [history]
 * @property {string} [userName]
 * @property {boolean} [awaitingConfirm]
 * @property {string} [referenceDate]
 * @property {{ active?: boolean, turns?: number }} [sideThread]
 * @property {string} [lastAction]
 * @property {string} [lastContext]
 */

/**
 * @typedef {Object} BrainResult
 * @property {BrainAction} action
 * @property {Record<string, unknown>} payload
 * @property {string | null} aiResponse
 */

const INTENTS = [
  "note_creation",
  "reminder_creation",
  "scheduling",
  "rescheduling",
  "canceling_events",
  "asking_questions",
  "emotional_venting",
  "emotional_distress",
  "excitement",
  "confusion",
  "clarification_requests",
  "meta_questions_ai",
  "side_conversations",
  "philosophical_questions",
  "personal_reflection",
  "task_planning",
  "journaling",
  "memory_recall",
  "timeline_navigation",
  "time_selection",
  "date_selection",
  "writing_mode",
  "reading_mode",
  "editing_mode",
  "deleting_mode",
  "summarization_requests",
  "explanation_requests",
  "definition_requests",
  "creative_writing",
  "brainstorming",
  "idea_expansion",
  "problem_solving",
  "debugging",
  "technical_questions",
  "health_notes",
  "study_notes",
  "work_notes",
  "personal_notes",
  "errands",
  "finance_notes",
  "creative_project_notes",
  "mood_tracking",
  "habit_tracking",
  "gratitude_entries",
  "daily_logs",
  "future_planning",
  "past_reflection",
  "random_thoughts",
  "conversational_banter",
  "jokes",
  "sarcasm",
  "rhetorical_questions",
  "incomplete_thoughts",
  "fragmented_input",
  "accidental_input",
  "voice_to_text_errors",
  "profanity_handling",
  "ambiguous_intent",
  "multi_intent",
  "context_switching",
  "follow_up_questions",
  "conversational_threading"
];

const TONES = [
  "happy",
  "sad",
  "stressed",
  "overwhelmed",
  "confused",
  "angry",
  "excited",
  "tired",
  "neutral",
  "sarcastic",
  "playful",
  "anxious",
  "reflective",
  "determined",
  "frustrated",
  "distracted",
  "focused",
  "bored",
  "curious",
  "inspired"
];

const CONTEXTS = [
  "health",
  "study",
  "work",
  "personal",
  "creative",
  "errands",
  "finance",
  "relationships",
  "fitness",
  "mental_health",
  "appointments",
  "deadlines",
  "meetings",
  "chores",
  "travel",
  "ideas",
  "journaling",
  "reminders",
  "goals",
  "habits",
  "gratitude",
  "dreams",
  "random_thoughts"
];

/** @type {Record<string, RegExp[]>} */
const INTENT_PATTERNS = {
  note_creation: [
    /\b(jot|note|write down|log this|capture|record|take notes?|put in notes?|memo)\b/i,
    /\b(remember to|don't forget)\b/i
  ],
  reminder_creation: [
    /\b(remind me|reminder|alert me|ping me|nudge me)\b/i,
    /\b(set a reminder|create a reminder)\b/i
  ],
  scheduling: [
    /\b(schedule|book|plan|add appointment|put on calendar|set up meeting)\b/i,
    /\b(at \d{1,2}(:\d{2})?\s*(am|pm)?)\b/i,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i
  ],
  rescheduling: [/\b(reschedule|move to|push to|change to|switch to)\b/i, /\b(later|earlier)\b.*\b(appointment|meeting)\b/i],
  canceling_events: [/\b(cancel|delete|remove|clear)\b.*\b(event|appointment|meeting|reminder)\b/i],
  asking_questions: [/\?$/, /\b(what|when|where|who|why|how|which|can you|could you|is there)\b/i],
  emotional_venting: [/\b(vent|rant|ugh|so tired of|can't stand|sick of)\b/i, /\b(just need to say|had to get this out)\b/i],
  emotional_distress: [
    /\b(hopeless|panic|panicking|can't cope|breaking down|desperate|crisis)\b/i,
    /\b(so alone|want to disappear|don't want to be here)\b/i
  ],
  excitement: [/\b(amazing|awesome|can't wait|so excited|yay|woohoo|let's go)\b/i, /!{2,}/],
  confusion: [/\b(confused|don't understand|makes no sense|lost|unclear|huh)\b/i, /\bwhat do you mean\b/i],
  clarification_requests: [/\b(clarify|what did you mean|say that again|be more specific)\b/i],
  meta_questions_ai: [
    /\b(who are you|what are you|are you ai|are you real|how do you work)\b/i,
    /\b(inkling|your name|what can you do)\b/i
  ],
  side_conversations: [/\b(by the way|btw|random thought|off topic|sidebar)\b/i],
  philosophical_questions: [/\b(meaning of|philosophy|existential|why are we|purpose of life)\b/i],
  personal_reflection: [/\b(i've been thinking|looking back|reflecting|realized that)\b/i],
  task_planning: [/\b(plan my day|to-?do|tasks for|break down|prioritize)\b/i],
  journaling: [/\b(journal|dear diary|daily entry|morning pages)\b/i],
  memory_recall: [/\b(what did i|remember when|last time i|recall)\b/i],
  timeline_navigation: [/\b(timeline|scroll to|jump to|go to)\b.*\b(time|hour|slot)\b/i],
  time_selection: [/\b(pick a time|what time|at noon|at \d|half past)\b/i],
  date_selection: [/\b(which day|pick a date|next week|this weekend|on friday)\b/i],
  writing_mode: [/\b(open writer|notebook writer|writing mode|start writing)\b/i],
  reading_mode: [/\b(read my notes|notebook reader|what did i write)\b/i],
  editing_mode: [/\b(edit|update|change)\b.*\b(note|entry|text)\b/i],
  deleting_mode: [/\b(delete|remove|erase)\b.*\b(note|entry)\b/i],
  summarization_requests: [/\b(summarize|summary|tldr|recap)\b/i],
  explanation_requests: [/\b(explain|help me understand|walk me through|break down how)\b/i],
  definition_requests: [/\b(what is|what's|define|meaning of)\b/i],
  creative_writing: [/\b(story|poem|lyrics|creative write|fiction)\b/i],
  brainstorming: [/\b(brainstorm|ideas for|thought starters|spitball)\b/i],
  idea_expansion: [/\b(expand on|build on this idea|more ideas like)\b/i],
  problem_solving: [/\b(how do i solve|figure out|work through|stuck on)\b/i],
  debugging: [/\b(debug|bug|error|stack trace|not working)\b/i],
  technical_questions: [/\b(code|api|javascript|python|database|server)\b/i],
  health_notes: [/\b(doctor|gym|workout|meds|medicine|sleep|meal|symptom|health)\b/i],
  study_notes: [/\b(class|homework|exam|study|course|lecture|quiz)\b/i],
  work_notes: [/\b(work|office|meeting|deadline|project|boss|client|email)\b/i],
  personal_notes: [/\b(family|friend|home|personal|relax|weekend plans)\b/i],
  errands: [/\b(errand|grocery|pickup|drop off|bank|post office|chores)\b/i],
  finance_notes: [/\b(budget|bill|pay|invoice|tax|money|expense|savings)\b/i],
  creative_project_notes: [/\b(design|art|music|paint|album|portfolio|craft)\b/i],
  mood_tracking: [/\b(mood|feeling|felt|anxious|depressed|energized)\b/i],
  habit_tracking: [/\b(habit|streak|routine|daily habit)\b/i],
  gratitude_entries: [/\b(grateful|thankful|gratitude|appreciate)\b/i],
  daily_logs: [/\b(daily log|today i|end of day|check-?in)\b/i],
  future_planning: [/\b(next month|future|long term|someday|goals for)\b/i],
  past_reflection: [/\b(yesterday|last year|used to|back when|remember when)\b/i],
  random_thoughts: [/\b(random|shower thought|weird thought)\b/i],
  conversational_banter: [/\b(hey|hi|hello|how are you|what's up|sup)\b/i],
  jokes: [/\b(joke|funny|laugh|pun)\b/i],
  sarcasm: [/\b(yeah right|sure sure|obviously|as if)\b/i],
  rhetorical_questions: [/\b(why me|can you believe|who even)\b.*\?/i],
  incomplete_thoughts: [/^.{1,18}$/],
  fragmented_input: [/\.\.\.|--|^\w+\s+\w+$/],
  accidental_input: [/^[a-z]{1,3}$/i, /^[\d\s\W]+$/, /^(asdf|qwerty|test|ok|k)$/i],
  voice_to_text_errors: [/\b(gonna|wanna|kinda|lemme|dunno)\b/i, /\b(two|too)\b.*\b(too|to)\b/i],
  profanity_handling: [/\b(damn|hell|crap|shit|fuck|wtf)\b/i],
  ambiguous_intent: [/\b(maybe|perhaps|not sure|idk|i guess)\b/i],
  multi_intent: [/\band also\b/i, /\bthen\b.*\band\b/i],
  context_switching: [/\b(anyway|switching gears|different topic|new topic)\b/i],
  follow_up_questions: [/\b(what about|and what|also|follow up)\b/i],
  conversational_threading: [/\b(yes but|no but|going back to|like i said)\b/i]
};

/** @type {Record<string, RegExp[]>} */
const TONE_PATTERNS = {
  happy: [/\b(happy|glad|joy|great day|love this)\b/i, /:\)|😊|🙂/],
  sad: [/\b(sad|down|lonely|miss|cry|depressed)\b/i, /:\(|😢/],
  stressed: [/\b(stressed|overloaded|pressure|deadline|overwhelming)\b/i],
  overwhelmed: [/\b(overwhelmed|too much|can't handle|drowning)\b/i],
  confused: [/\b(confused|lost|unclear|don't get)\b/i],
  angry: [/\b(angry|mad|furious|pissed|annoyed)\b/i],
  excited: [/\b(excited|pumped|can't wait|amazing)\b/i, /!{2,}/],
  tired: [/\b(tired|exhausted|sleepy|burnt out|burned out)\b/i],
  neutral: [/\b(okay|fine|alright|sure)\b/i],
  sarcastic: [/\b(yeah right|sure sure|totally|as if)\b/i],
  playful: [/\b(lol|haha|hehe|funny|jk)\b/i],
  anxious: [/\b(anxious|worried|nervous|scared|panic)\b/i],
  reflective: [/\b(reflect|thinking about|wondering if|realized)\b/i],
  determined: [/\b(focused|determined|let's do|get it done)\b/i],
  frustrated: [/\b(frustrated|stuck|ugh|annoying|why won't)\b/i],
  distracted: [/\b(distracted|can't focus|scatterbrained)\b/i],
  focused: [/\b(deep work|in the zone|focused|heads down)\b/i],
  bored: [/\b(bored|nothing to do|dull)\b/i],
  curious: [/\b(curious|wonder|interested|how does)\b/i],
  inspired: [/\b(inspired|motivated|idea|creative spark)\b/i]
};

/** @type {Record<string, RegExp[]>} */
const CONTEXT_PATTERNS = {
  health: [/\b(doctor|nurse|hospital|gym|workout|sleep|meal|vitamin|therapy)\b/i],
  study: [/\b(class|exam|homework|university|school|lecture|study)\b/i],
  work: [/\b(work|office|boss|client|project|deadline|meeting|email)\b/i],
  personal: [/\b(family|friend|home|personal|self care)\b/i],
  creative: [/\b(art|design|music|write|paint|creative)\b/i],
  errands: [/\b(errand|grocery|store|pickup|mail|chore)\b/i],
  finance: [/\b(money|budget|bill|pay|bank|tax|invoice)\b/i],
  relationships: [/\b(partner|spouse|date|relationship|mom|dad)\b/i],
  fitness: [/\b(run|yoga|lift|cardio|steps|workout)\b/i],
  mental_health: [/\b(anxiety|depression|therapy|counseling|mental health)\b/i],
  appointments: [/\b(appointment|dentist|checkup|visit)\b/i],
  deadlines: [/\b(deadline|due|due date|submit by)\b/i],
  meetings: [/\b(meeting|standup|sync|call with)\b/i],
  chores: [/\b(clean|laundry|dishes|vacuum|chore)\b/i],
  travel: [/\b(flight|trip|travel|hotel|airport)\b/i],
  ideas: [/\b(idea|concept|brainstorm|thought)\b/i],
  journaling: [/\b(journal|diary|entry)\b/i],
  reminders: [/\b(remind|reminder|don't forget)\b/i],
  goals: [/\b(goal|milestone|objective|target)\b/i],
  habits: [/\b(habit|routine|streak)\b/i],
  gratitude: [/\b(grateful|thankful|gratitude)\b/i],
  dreams: [/\b(dream|nightmare|woke up)\b/i],
  random_thoughts: [/\b(random|shower thought)\b/i]
};

/**
 * @param {string} text
 * @param {Record<string, RegExp[]>} patterns
 * @returns {string[]}
 */
function scoreLabels(text, patterns) {
  const hits = [];
  for (const [label, regs] of Object.entries(patterns)) {
    let score = 0;
    for (const re of regs) {
      if (re.test(text)) score += 1;
    }
    if (score > 0) hits.push({ label, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.map((h) => h.label);
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function detectIntents(text) {
  const ranked = scoreLabels(text, INTENT_PATTERNS);
  if (ranked.length > 1 && INTENT_PATTERNS.multi_intent.some((re) => re.test(text))) {
    return ["multi_intent", ...ranked.filter((l) => l !== "multi_intent").slice(0, 3)];
  }
  return ranked.length ? ranked : ["ambiguous_intent"];
}

/**
 * @param {string} text
 * @returns {string}
 */
function detectTone(text) {
  const ranked = scoreLabels(text, TONE_PATTERNS);
  return ranked[0] ?? "neutral";
}

/**
 * @param {string} text
 * @returns {string}
 */
function classifyContext(text) {
  const ranked = scoreLabels(text, CONTEXT_PATTERNS);
  return ranked[0] ?? "random_thoughts";
}

/**
 * @param {string[]} intents
 * @param {string} tone
 * @param {string} text
 */
function shouldIntercept(intents, tone, text) {
  const interceptIntents = new Set([
    "emotional_venting",
    "emotional_distress",
    "confusion",
    "clarification_requests",
    "meta_questions_ai",
    "side_conversations",
    "philosophical_questions",
    "personal_reflection",
    "asking_questions",
    "explanation_requests",
    "definition_requests",
    "conversational_banter",
    "jokes",
    "excitement",
    "emotional_distress"
  ]);
  if (intents.some((i) => interceptIntents.has(i))) return true;
  if (/\?$/.test(text.trim())) return true;
  if (["sad", "stressed", "overwhelmed", "anxious", "angry", "frustrated", "confused"].includes(tone)) {
    return true;
  }
  if (/\b(help|advice|meaning|why|explain)\b/i.test(text)) return true;
  return false;
}

/**
 * @param {string} text
 * @param {string} tone
 * @param {string[]} intents
 * @param {BrainState} state
 */
function buildSideResponse(text, tone, intents, state) {
  const name = state.userName ? `, ${state.userName}` : "";
  const lastAssistant = [...(state.history ?? [])]
    .reverse()
    .find((t) => t.role === "assistant")?.content;

  if (intents.includes("meta_questions_ai")) {
    return `I'm Inkling${name} — your calendar and notebook companion. I help you capture notes, plan time, and explore the Calendar's 3D timeline. Say what you need in plain language.`;
  }
  if (intents.includes("emotional_distress")) {
    return `I hear you${name}, and I'm glad you said something. I'm not a crisis service — if you're in danger, please reach out to someone you trust or local emergency help. I can still help you jot things down or organize your day when you're ready.`;
  }
  if (intents.includes("emotional_venting") || tone === "frustrated" || tone === "angry") {
    return `That sounds really frustrating${name}. Want to vent a bit more, or should we channel this into a note or time slot so it's not just swirling around?`;
  }
  if (tone === "excited" || intents.includes("excitement")) {
    return `Love the energy${name}! Want me to capture this on your timeline, or keep chatting?`;
  }
  if (intents.includes("philosophical_questions") || intents.includes("personal_reflection")) {
    return `That's a thoughtful one${name}. I don't have all the answers, but I can reflect with you — or we can park it in a journal note for later.`;
  }
  if (intents.includes("jokes") || tone === "playful") {
    return `Ha — I'm better at calendars than comedy${name}. Want to switch back to notes, or keep the banter going?`;
  }
  if (intents.includes("confusion") || intents.includes("clarification_requests")) {
    return `Let me clarify${name}. Tell me if you want to **write a note**, **check your schedule**, or **open the Calendar** — I'll follow your lead.`;
  }
  if (intents.includes("conversational_banter")) {
    return `Hey${name}! I'm here. Notes, Schedule, or Calendar — what sounds good?`;
  }
  if (lastAssistant && /\?\s*$/.test(lastAssistant) && /^(yes|yeah|yep|ok|okay|sure)\b/i.test(text)) {
    return `Whenever you're ready, confirm with **Yes, add it** or tell me the day and time again.`;
  }
  if (intents.includes("asking_questions") || intents.includes("explanation_requests")) {
    return `Good question${name}. I can explain how Inkling works, or look at your calendar if you name a day — which would help more?`;
  }
  return `I'm with you${name}. We can keep talking, or you can say something like "open writer" or "jot this down tomorrow at 3pm" whenever you want to act on it.`;
}

/**
 * @param {string[]} intents
 * @param {string} tone
 * @param {string} text
 * @param {string} context
 * @param {BrainState} state
 * @returns {{ route: string, action: BrainAction, payload: Record<string, unknown>, aiResponse: string | null }}
 */
function routeAction(intents, tone, text, context, state) {
  const primary = intents[0] ?? "ambiguous_intent";
  const lower = text.toLowerCase();
  const payload = {
    intents,
    primaryIntent: primary,
    tone,
    context,
    text,
    secondaryIntents: intents.slice(1, 4),
    category: mapContextToCategory(context)
  };

  if (INTENT_PATTERNS.accidental_input.some((re) => re.test(lower)) && text.length < 6) {
    return {
      route: "doNothing",
      action: "none",
      payload,
      aiResponse: null
    };
  }

  const alertPhrase =
    /\b(remind me|alert me|don'?t let me forget|wake me up|notify me when|tell me at|set an alarm)\b/i;
  if (alertPhrase.test(lower)) {
    return {
      route: "createAlert",
      action: "createAlert",
      payload: {
        ...payload,
        time: extractTimeHint(lower) ?? "09:00",
        text: text,
        category: mapContextToCategory(context)
      },
      aiResponse: "Okay, I'll alert you."
    };
  }

  if (INTENT_PATTERNS.writing_mode.some((re) => re.test(lower)) || /\b(open|show)\b.*\bwriter\b/i.test(lower)) {
    return {
      route: "openWriter",
      action: "openWriter",
      payload: { ...payload, scrollToTime: extractTimeHint(lower) },
      aiResponse: `Opening Notebook Writer${state.userName ? `, ${state.userName}` : ""}.`
    };
  }

  if (/\b(calendar|3d calendar|wordweaver|3d timeline|weave|thought space)\b/i.test(lower)) {
    return {
      route: "openWordWeaver",
      action: "openWordWeaver",
      payload,
      aiResponse: "Opening the Calendar — your days as 3D month worlds."
    };
  }

  if (/\b(calendar|month view|schedule view|open calendar)\b/i.test(lower)) {
    return {
      route: "openCalendar",
      action: "openCalendar",
      payload: { ...payload, scrollToDate: extractDateHint(lower) },
      aiResponse: "Opening your calendar."
    };
  }

  if (
    ["note_creation", "reminder_creation", "scheduling", "journaling", "daily_logs", "health_notes", "work_notes"].some(
      (i) => intents.includes(i)
    ) &&
    !shouldIntercept(intents, tone, text)
  ) {
    return {
      route: "storeNote",
      action: "storeNote",
      payload: {
        ...payload,
        time: extractTimeHint(lower),
        date: extractDateHint(lower),
        kind: intents.includes("scheduling") ? "appointment" : intents.includes("reminder_creation") ? "reminder" : "note"
      },
      aiResponse: null
    };
  }

  if (intents.includes("timeline_navigation") || intents.includes("time_selection")) {
    return {
      route: "scrollToTime",
      action: "openWriter",
      payload: { ...payload, scrollToTime: extractTimeHint(lower) ?? "09:00" },
      aiResponse: `I'll line you up near ${payload.scrollToTime ?? "that time"} in the Writer.`
    };
  }

  if (intents.includes("date_selection")) {
    return {
      route: "scrollToDate",
      action: "openCalendar",
      payload: { ...payload, scrollToDate: extractDateHint(lower) },
      aiResponse: "Let's look at that day on your calendar."
    };
  }

  if (shouldIntercept(intents, tone, text) || state.sideThread?.active) {
    const aiResponse = buildSideResponse(text, tone, intents, state);
    const isClarify =
      intents.includes("ambiguous_intent") ||
      intents.includes("incomplete_thoughts") ||
      intents.includes("fragmented_input") ||
      intents.includes("voice_to_text_errors");
    return {
      route: isClarify ? "askClarification" : "startSideConversation",
      action: isClarify ? "askClarification" : "sideConversation",
      payload: { ...payload, sideThread: true },
      aiResponse
    };
  }

  if (intents.includes("reading_mode") || intents.includes("memory_recall")) {
    return {
      route: "respondDirectly",
      action: "sideConversation",
      payload,
      aiResponse: `I can help you browse notes in Notebook Reader or check a specific day — which date should I look at?`
    };
  }

  return {
    route: "doNothing",
    action: "none",
    payload,
    aiResponse: null
  };
}

/**
 * @param {string} context
 */
function mapContextToCategory(context) {
  const map = {
    health: "health",
    fitness: "health",
    mental_health: "health",
    study: "study",
    work: "work",
    meetings: "work",
    deadlines: "work",
    appointments: "work",
    personal: "personal",
    relationships: "personal",
    creative: "creative",
    ideas: "creative",
    errands: "errand",
    finance: "work",
    chores: "errand",
    travel: "personal",
    journaling: "personal",
    gratitude: "personal",
    goals: "personal",
    habits: "personal",
    dreams: "personal",
    reminders: "work",
    random_thoughts: "default"
  };
  return map[context] ?? "default";
}

/**
 * @param {string} lower
 */
function extractTimeHint(lower) {
  const m = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * @param {string} lower
 */
function extractDateHint(lower) {
  if (/\btomorrow\b/.test(lower)) return "tomorrow";
  if (/\btoday\b/.test(lower)) return "today";
  const wd = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (wd) return wd[1];
  return null;
}

/**
 * @param {string} text
 * @param {BrainState} [state]
 * @returns {BrainResult}
 */
export function processUserInput(text, state = {}) {
  const raw = String(text ?? "").trim();
  const normalized = raw.replace(/\s+/g, " ");

  if (!normalized) {
    return {
      action: "askClarification",
      payload: { intents: [], tone: "neutral", context: "random_thoughts" },
      aiResponse: "I'm listening — say anything about your notes, schedule, or how you're feeling."
    };
  }

  const intents = detectIntents(normalized);
  const tone = detectTone(normalized);
  const context = classifyContext(normalized);
  const routed = routeAction(intents, tone, normalized, context, state);

  return {
    action: routed.action,
    payload: {
      ...routed.payload,
      route: routed.route,
      intentCatalog: INTENTS,
      toneCatalog: TONES,
      contextCatalog: CONTEXTS
    },
    aiResponse: routed.aiResponse
  };
}
