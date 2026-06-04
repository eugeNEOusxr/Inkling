/**
 * Bridges Inkling chat, notebook, and calendar writes into the WordWeaver timeline model.
 */
import { addEntry, DEFAULT_TIMELINE_FORMAT } from "../data/timelineModel.js";
import { parseNoteSlotKey } from "../utils/storage.js";

/** @type {boolean} */
let initialized = false;

/** @type {Record<string, Partial<import('../data/timelineModel.js').TimelineEntryRecord>>} */
const KIND_FORMATTING = {
  note: { color: "#e2e8f0", fontWeight: "700", fontSize: 0.26 },
  appointment: { color: "#4ade80", fontWeight: "700", fontSize: 0.28 },
  reminder: { color: "#38bdf8", fontWeight: "600", fontSize: 0.24 },
  alarm: { color: "#f87171", fontWeight: "800", fontSize: 0.27 }
};

/**
 * @param {Partial<import('../data/timelineModel.js').TimelineEntryRecord>} [formatting]
 * @returns {Partial<import('../data/timelineModel.js').TimelineEntryRecord>}
 */
function mergeFormatting(formatting = {}) {
  return {
    ...DEFAULT_TIMELINE_FORMAT,
    ...formatting
  };
}

/**
 * @param {string} time
 * @param {string} text
 * @param {Partial<import('../data/timelineModel.js').TimelineEntryRecord>} [formatting]
 */
export function pushTimelineEntry(time, text, formatting = {}) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;

  return addEntry(time, trimmed, mergeFormatting(formatting));
}

/**
 * @param {{ kind?: string, date?: string, time?: string, text?: string }} detail
 */
function handleScheduleApplied(detail) {
  const intent = detail?.intent ?? detail;
  if (!intent?.text || !intent?.time) return;

  const kind = intent.kind ?? "note";
  const formatting = KIND_FORMATTING[kind] ?? KIND_FORMATTING.note;
  const label =
    kind === "appointment"
      ? intent.text
      : kind === "reminder" || kind === "alarm"
        ? `[${kind}] ${intent.text}`
        : intent.text;

  pushTimelineEntry(intent.time, label, formatting);
}

/**
 * @param {CustomEvent<{ date?: string, text?: string, weaveTextStyle?: object, typography?: object }>} event
 */
function handleWeaverThought(event) {
  const { text, weaveTextStyle, typography } = event.detail ?? {};
  if (!text?.trim()) return;

  const style = weaveTextStyle ?? typography ?? {};
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  pushTimelineEntry(time, text.trim(), {
    fontSize: Number(style.fontSize) || DEFAULT_TIMELINE_FORMAT.fontSize,
    fontWeight: style.fontWeight ?? style.weight ?? DEFAULT_TIMELINE_FORMAT.fontWeight,
    color: style.color ?? style.hex ?? DEFAULT_TIMELINE_FORMAT.color
  });
}

/**
 * @param {{ date?: string, time?: string, text?: string, kind?: string }} detail
 */
function handleNotebookNote(detail) {
  if (!detail?.text?.trim()) return;
  const time = parseNoteSlotKey(String(detail.time ?? "09:00"));
  const kind = detail.kind ?? "note";
  pushTimelineEntry(time, detail.text.trim(), KIND_FORMATTING[kind] ?? KIND_FORMATTING.note);
}

/**
 * Wire listeners once. Safe to call multiple times.
 */
export function initInklingChatBridge() {
  if (initialized) return;
  initialized = true;

  if (typeof window !== "undefined") {
    window.addEventListener("inkling:schedule-applied", (event) => {
      handleScheduleApplied(event.detail ?? {});
    });

    window.addEventListener("wordweaver:add-thought", handleWeaverThought);

    window.addEventListener("notebook:note-committed", (event) => {
      handleNotebookNote(event.detail ?? {});
    });
  }
}

if (typeof window !== "undefined") {
  initInklingChatBridge();
}

export default {
  initInklingChatBridge,
  pushTimelineEntry
};
