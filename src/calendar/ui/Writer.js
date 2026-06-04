import { scrollToTime, scrollToFirstAvailableTime } from "./CalendarDayView.js";

/** @type {import("../CalendarApp.js").CalendarApp | null} */
let inklingApp = null;

/**
 * @param {import("../CalendarApp.js").CalendarApp} app
 */
export function registerInklingApp(app) {
  inklingApp = app;
}

/**
 * @param {import("./NotebookWriterPanel.js").NotebookWriterPanel} writerPanel
 * @param {string} timeString
 */
export function scrollWriterToTime(writerPanel, timeString) {
  if (!writerPanel) return;
  const normalized = normalizeTimeString(timeString);
  const scroller = writerPanel._dayScroller;
  if (scroller?.scrollToTime) {
    scroller.scrollToTime(normalized, true);
    return;
  }
  scrollToTime(writerPanel.scrollerMount ?? scroller?.track, normalized);
}

/**
 * @param {string} timeString
 */
function normalizeTimeString(timeString) {
  const m = String(timeString ?? "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return "09:00";
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

/**
 * Wire clock / strip / wheel time picks to the day timeline scroll.
 */
export function installWriterNavigation() {
  import("./NotebookWriterPanel.js")
    .then((mod) => {
      const Cls = mod.NotebookWriterPanel;
      if (Cls.__inklingWriterNavInstalled) return;
      Cls.__inklingWriterNavInstalled = true;

      const origSelect = Cls.prototype.selectHour;
      Cls.prototype.selectHour = function (hour, notify = false) {
        origSelect.call(this, hour, notify);
        scrollWriterToTime(this, `${String(hour).padStart(2, "0")}:00`);
      };
    })
    .catch((err) => console.warn("[Writer] navigation install failed", err));

  document.addEventListener(
    "click",
    (event) => {
      const dayBtn = event.target.closest?.(".mini-month-cal__day[data-date]");
      if (!dayBtn || !inklingApp) return;
      const iso = dayBtn.getAttribute("data-date");
      if (!iso) return;

      queueMicrotask(async () => {
        await inklingApp.openNotebookDayByDate(iso);
        const panel = inklingApp.notebookWriterPanel;
        scrollToFirstAvailableTime(panel?.scrollerMount, panel?._dayScroller);
      });
    },
    true
  );
}
