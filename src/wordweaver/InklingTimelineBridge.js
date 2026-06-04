import { addTimelineEntry } from "./timelineModel.js";

/**
 * Inkling → timeline pipeline (notes, timestamps, moments).
 * @param {{
 *   time: string,
 *   label?: string,
 *   text: string,
 *   color?: string,
 *   fontSize?: number,
 *   weight?: "normal" | "bold"
 * }} payload
 */
export function onInklingNoteCreated(payload) {
  const text = String(payload?.text ?? "").trim();
  if (!text) return null;

  const entry = addTimelineEntry({
    time: payload.time ?? new Date().toISOString(),
    label: payload.label ?? payload.time ?? "Note",
    text,
    color: payload.color,
    fontSize: payload.fontSize,
    weight: payload.weight
  });

  return entry;
}

/**
 * @param {import("../calendar/CalendarApp.js").CalendarApp} inklingApp
 */
export function registerInklingTimelineBridge(inklingApp) {
  if (typeof window === "undefined") return;
  if (window.__inklingTimelineBridgeRegistered) return;
  window.__inklingTimelineBridgeRegistered = true;

  window.addEventListener("wordweaver:add-thought", (event) => {
    const { text, date } = event.detail ?? {};
    if (!text?.trim()) return;
    const now = new Date();
    const time =
      event.detail?.time ??
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    onInklingNoteCreated({
      time: date ? `${date}T${time}:00` : time,
      label: time,
      text: text.trim(),
      color: event.detail?.color,
      fontSize: event.detail?.fontSize,
      weight: event.detail?.weight
    });
  });

  window.addEventListener("inkling:schedule-applied", (event) => {
    const intent = event.detail?.intent ?? event.detail;
    if (!intent?.text) return;
    onInklingNoteCreated({
      time: intent.time ?? intent.date,
      label: intent.kind ?? "Event",
      text: intent.text,
      weight: "bold"
    });
  });

  if (inklingApp?._commitSlotNote && !inklingApp.__timelineCommitWrapped) {
    inklingApp.__timelineCommitWrapped = true;
    const original = inklingApp._commitSlotNote.bind(inklingApp);
    inklingApp._commitSlotNote = (payload) => {
      original(payload);
      if (payload?.note?.trim()) {
        onInklingNoteCreated({
          time: payload.time,
          label: payload.time,
          text: payload.note.trim()
        });
      }
    };
  }
}
