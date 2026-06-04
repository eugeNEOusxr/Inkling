import {
  saveNoteToTimeline,
  closeTimeEntryPanel,
  classifyText
} from "../../wordweaver/timelineModel.js";

/**
 * @param {HTMLInputElement | null} input
 * @param {() => string} getSelectedTime
 * @param {{ onSaved?: () => void }} [opts]
 */
export function bindNoteInputEnter(input, getSelectedTime, opts = {}) {
  if (!input) return;

  if (input.dataset.timeSlotEditorBound === "1") return;
  input.dataset.timeSlotEditorBound = "1";

  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const text = input.value.trim();
    if (!text) return;

    const time = getSelectedTime();
    saveNoteToTimeline({
      time,
      text,
      category: classifyText(text)
    });

    input.value = "";
    closeTimeEntryPanel();
    opts.onSaved?.();
  });
}
