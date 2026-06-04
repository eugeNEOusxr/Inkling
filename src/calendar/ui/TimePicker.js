import { renderTimeList, ALL_HALF_HOUR_TIMES } from "./TimeList.js";
import { bindNoteInputEnter } from "./TimeSlotEditor.js";

/** @type {import("./TimeList.js").ReturnType<typeof renderTimeList> | null} */
let timeListApi = null;
let selectedTime = "09:00";
let panelObserver = null;
let writerSyncBound = false;

/**
 * @returns {string}
 */
export function getSelectedTime() {
  return timeListApi?.getSelectedTime?.() ?? selectedTime;
}

/**
 * @param {string} time
 */
export function setSelectedTime(time) {
  selectedTime = time;
  timeListApi?.setSelectedTime?.(time);
  document.dispatchEvent(
    new CustomEvent("inkling:time-entry-select", { detail: { time } })
  );
}

function syncTimeFromWriterUi() {
  const activeChip = document.querySelector(".notebook-writer-hour-chip.is-active");
  if (activeChip?.dataset?.hour != null) {
    const h = String(activeChip.dataset.hour).padStart(2, "0");
    setSelectedTime(`${h}:00`);
    return;
  }

  const centered = document.querySelector(".vertical-time-wheel__slot.is-centered");
  if (centered?.dataset?.time) {
    setSelectedTime(centered.dataset.time);
  }
}

function mountTimeEntryPanel() {
  const writerPanel = document.getElementById("notebook-writer-panel");
  const hourStrip = document.getElementById("notebook-writer-hour-strip");
  if (!writerPanel || !hourStrip || writerPanel.classList.contains("hidden")) {
    return false;
  }

  let panel = document.getElementById("inkling-time-entry-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "inkling-time-entry-panel";
    panel.className = "time-entry-panel";
    hourStrip.insertAdjacentElement("afterend", panel);
  }

  panel.innerHTML = "";

  const scroll = document.createElement("div");
  scroll.className = "time-entry-panel__scroll";

  const listMount = document.createElement("div");
  listMount.className = "time-entry-list-mount";
  scroll.appendChild(listMount);

  const inputWrap = document.createElement("div");
  inputWrap.className = "time-entry-input";
  const input = document.createElement("input");
  input.type = "text";
  input.id = "noteInput";
  input.placeholder = "Write a note… then press Enter";
  input.setAttribute("aria-label", "Note text");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("enterkeyhint", "done");
  inputWrap.appendChild(input);

  panel.append(scroll, inputWrap);

  timeListApi = renderTimeList(listMount, {
    selectedTime,
    onSelect: (time) => {
      selectedTime = time;
    }
  });

  bindNoteInputEnter(input, getSelectedTime);

  if (!writerSyncBound) {
    document.addEventListener("click", onWriterTimeSyncClick);
    writerSyncBound = true;
  }

  return true;
}

/**
 * @param {MouseEvent} e
 */
function onWriterTimeSyncClick(e) {
  const chip = e.target.closest?.(".notebook-writer-hour-chip");
  if (chip?.dataset?.hour != null) {
    setSelectedTime(`${String(chip.dataset.hour).padStart(2, "0")}:00`);
    return;
  }
  const slot = e.target.closest?.(".vertical-time-wheel__slot[data-time]");
  if (slot?.dataset?.time) {
    setSelectedTime(slot.dataset.time);
    return;
  }
  const row = e.target.closest?.(".day-scroller__row[data-time]");
  if (row?.dataset?.time) {
    setSelectedTime(row.dataset.time);
  }
}

/**
 * Bootstrap time-entry UI when the writer panel is in the DOM.
 */
export function bootTimeEntryPanel() {
  if (mountTimeEntryPanel()) {
    syncTimeFromWriterUi();
  }

  if (panelObserver) return;

  panelObserver = new MutationObserver(() => {
    const writer = document.getElementById("notebook-writer-panel");
    if (!writer || writer.classList.contains("hidden")) return;
    if (!document.getElementById("inkling-time-entry-panel")) {
      mountTimeEntryPanel();
      syncTimeFromWriterUi();
    }
  });
  panelObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class"]
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bootTimeEntryPanel());
  } else {
    bootTimeEntryPanel();
  }
}

export { ALL_HALF_HOUR_TIMES };
