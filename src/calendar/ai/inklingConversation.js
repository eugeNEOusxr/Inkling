import { INKLING_CAPABILITY_EXAMPLES, PATTERNS } from "./inklingPhraseLexicon.js";

const CAPABILITIES_HTML = INKLING_CAPABILITY_EXAMPLES.map((e) => `<li>${escapeHtml(e)}</li>`).join("");

/**
 * Natural conversational replies when no structured calendar action matched.
 * @param {string} raw
 * @param {string} lower
 * @param {{ userName?: string, lastIntent?: string, history?: { role: string, content: string }[], awaitingConfirm?: boolean }} [ctx]
 */
export function buildConversationalReply(raw, lower, ctx = {}) {
  const name = ctx.userName ? `, ${ctx.userName}` : "";
  const lastAssistant = [...(ctx.history || [])]
    .reverse()
    .find((t) => t.role === "assistant")?.content;
  const lastUser = [...(ctx.history || [])]
    .reverse()
    .find((t) => t.role === "user" && t.content !== raw)?.content;

  if (lastAssistant && /\?\s*$/.test(lastAssistant) && /^(yes|yeah|yep|ok|okay|sure|do it|add it)\b/i.test(lower)) {
    return "Tap **Yes, add it** below when you're ready — that keeps your calendar under your control.";
  }

  if (lastUser && /\b(note|jot|schedule|free|tomorrow)\b/i.test(lastUser) && /^(what about|and |also )/i.test(lower)) {
    return pick([
      `Got it${name} — building on what you said before. Tell me the day and time and I'll line it up.`,
      `Sure${name} — give me the when (today, tomorrow, a time) and I'll help from there.`
    ]);
  }

  if (PATTERNS.greeting.test(lower)) {
    return pick([
      `Hey${name} — I'm Inkling. Tell me something to jot down, ask what's on your calendar, or say when you're free.`,
      `Hi${name}! You can talk to me like a person: "take notes on…", "what time am I free tomorrow?", or "put lunch with Sam Tuesday at noon."`,
      `Hello${name}. I'm here for notes, appointments, and schedule questions — just say it in your own words.`
    ]);
  }

  if (PATTERNS.thanks.test(lower)) {
    return pick([
      "You're welcome — I'll keep watch on your timeline.",
      "Anytime. Ping me whenever you want something captured or checked.",
      "Happy to help. Your calendar and notebook stay in sync when you confirm adds."
    ]);
  }

  if (/\b(how are you|how's it going|how are things)\b/.test(lower)) {
    return pick([
      "Doing well — focused on keeping your days legible. What should we capture or look up?",
      "All good on my side. Want to jot something down or scan your schedule?",
      "I'm tuned in to your calendar. Notes, free time, or what's on today?"
    ]);
  }

  if (/\b(what can you do|help me|how do i use|what are you for|capabilities)\b/.test(lower)) {
    return (
      `<p>I understand everyday language for <strong>notes</strong>, <strong>appointments</strong>, and <strong>your schedule</strong> — not rigid commands.</p>` +
      `<ul class="inkling-list">${CAPABILITIES_HTML}</ul>` +
      `<p>Say it naturally; I'll propose the entry and wait for you to confirm before saving.</p>`
    );
  }

  if (/\b(calendar|wordweaver|3d|weave)\b/.test(lower)) {
    return pick([
      "The Calendar is your days as 3D month worlds — open it from the bottom nav and fly through them. I can add notes to any day on your Schedule.",
      "Open the Calendar from the bottom nav to explore your months in 3D. I handle notes and appointments in plain language here."
    ]);
  }

  if (/\b(notebook|writer|timeline)\b/.test(lower)) {
    return pick([
      "Notebook Writer is the hour-by-hour lane — pick a time on the clock and type in the slot. I can drop the same text there when you confirm an add.",
      "Open a day on the calendar, use the writer timeline, or tell me what to jot and I'll line it up to a time."
    ]);
  }

  if (/\b(yes|yeah|yep|confirm|do it|add it)\b/.test(lower) && ctx.awaitingConfirm) {
    return "Tap **Yes, add it** on the button below — that keeps you in control of what gets saved.";
  }

  if (/\b(no|nope|cancel|never mind|nevermind|don't)\b/.test(lower)) {
    return pick([
      "No problem — nothing changed.",
      "Got it — I won't add that.",
      "Okay, left your calendar as-is."
    ]);
  }

  if (looksLikePartialNote(raw, lower)) {
    return pick([
      "Sounds like a note — which day and time should I attach it to? Example: \"jot this down tomorrow at 3pm: …\"",
      "I can capture that — add when it should live, like \"today at 5\" or \"Friday morning\".",
      "Almost there — try \"take notes Tuesday 2pm: your text here\" so I know the slot."
    ]);
  }

  if (looksLikePartialSchedule(lower)) {
    return pick([
      "Which day should I check — today, tomorrow, or a weekday?",
      "Give me a day: \"what's on Friday\" or \"when am I free tomorrow afternoon.\"",
      "I can read your schedule — say something like \"what do I have this week?\""
    ]);
  }

  const few = INKLING_CAPABILITY_EXAMPLES.slice(0, 4)
    .map((e) => `<li>${escapeHtml(e)}</li>`)
    .join("");
  return pick([
    "I'm not quite sure — try how you'd tell a friend: jot something down, ask what's on tomorrow, or when you're free.",
    "Say it like you'd dictate to an assistant: \"put in notes: …\", \"what time am I free Friday?\", or \"schedule dentist next Tuesday 2pm.\"",
    `A few things I catch well:<ul class="inkling-list">${few}</ul>Pick one and we'll go from there.`
  ]);
}

/** @param {string} raw @param {string} lower */
function looksLikePartialNote(raw, lower) {
  return (
    (PATTERNS.noteCapture.test(lower) || PATTERNS.noteNoun.test(lower)) &&
    raw.length > 8 &&
    !/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(:\d{2})?\s*(am|pm)?)\b/i.test(
      lower
    )
  );
}

function looksLikePartialSchedule(lower) {
  return (
    (/\b(when|what|schedule|calendar|free|busy)\b/.test(lower) && lower.length < 40) ||
    /\b(today|tomorrow)\?$/.test(lower.trim())
  );
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
