/**
 * Notebook Calendar — shell-hosted satellite panel (mini month + shortcuts).
 * The 3D month wall, writer, dock, and Inkling are the primary experience in-page.
 */
import { getLastView, saveLastView } from "../../utils/storage.js";
import { renderMiniMonthCalendar } from "../../calendar/ui/MiniMonthCalendar.js";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseIso(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return { year: y, month: m, day: d };
}

function formatHeader(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

/**
 * @param {HTMLElement} container
 * @param {object} opts
 */
export async function mount(container, opts = {}) {
  const last = getLastView();
  const initialView =
    opts.initialView === "today"
      ? todayIso()
      : opts.initialView ?? last?.date ?? todayIso();

  let selectedDate = initialView;
  const { year, month } = parseIso(selectedDate);
  let miniCal = null;

  container.innerHTML = `
    <div class="notebook-calendar-shell notebook-calendar-shell--compact">
      <header class="notebook-header notebook-calendar-shell__header">
        <button type="button" class="notebook-day-nav" data-delta="-1" aria-label="Previous day">‹</button>
        <button type="button" class="notebook-today-btn btn-ghost btn-ghost--sm">Today</button>
        <button type="button" class="notebook-day-nav" data-delta="1" aria-label="Next day">›</button>
        <button type="button" class="notebook-open-reader-btn btn-ghost btn-ghost--sm" title="Notebook Reader">Reader</button>
        <button type="button" class="notebook-close-btn os-window__btn os-window__btn--close" aria-label="Close" title="Close">×</button>
      </header>
      <div class="notebook-calendar-shell__body panel-card reader-holographic glass-panel">
        <div id="notebook-calendar-mini-mount" class="notebook-calendar-mini-mount"></div>
        <p id="notebook-calendar-date-label" class="notebook-calendar-shell__date"></p>
        <div class="notebook-calendar-shell__actions">
          <button type="button" id="notebook-calendar-open-day" class="btn-primary notebook-calendar-shell__open">
            Open day timeline
          </button>
          <button type="button" id="notebook-calendar-focus-month" class="btn-ghost notebook-calendar-shell__focus">
            Show month on calendar
          </button>
        </div>
      </div>
    </div>
  `;

  const dateLabel = container.querySelector("#notebook-calendar-date-label");
  const miniMount = container.querySelector("#notebook-calendar-mini-mount");
  const openDayBtn = container.querySelector("#notebook-calendar-open-day");
  const focusMonthBtn = container.querySelector("#notebook-calendar-focus-month");

  const syncLabel = () => {
    if (dateLabel) dateLabel.textContent = formatHeader(selectedDate);
    saveLastView({ date: selectedDate, time: getLastView()?.time ?? "09:00" });
    miniCal?.setSelectedDate(selectedDate);
  };

  const focusMonthOn3D = async () => {
    if (typeof opts.onFocusCalendar === "function") {
      await opts.onFocusCalendar(selectedDate);
    }
  };

  const openDayTimeline = async () => {
    await focusMonthOn3D();
    if (typeof opts.onOpenDay === "function") {
      await opts.onOpenDay(selectedDate);
    }
  };

  const setDate = (iso) => {
    selectedDate = iso;
    syncLabel();
  };

  if (miniMount) {
    miniCal = renderMiniMonthCalendar(miniMount, {
      year,
      month,
      selectedDate,
      onSelect: (iso) => {
        setDate(iso);
      },
      onMonthChange: (y, m) => {
        const d = parseIso(selectedDate);
        selectedDate = `${y}-${String(m).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
        syncLabel();
      }
    });
  }

  container.querySelectorAll(".notebook-day-nav").forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = Number(btn.getAttribute("data-delta"));
      const d = new Date(`${selectedDate}T12:00:00`);
      d.setDate(d.getDate() + delta);
      setDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
    });
  });

  container.querySelector(".notebook-today-btn")?.addEventListener("click", () => {
    setDate(todayIso());
  });

  container.querySelector(".notebook-open-reader-btn")?.addEventListener("click", () => {
    opts.onOpenReader?.();
  });

  container.querySelector(".notebook-close-btn")?.addEventListener("click", () => {
    opts.onCloseWindow?.();
  });

  openDayBtn?.addEventListener("click", () => void openDayTimeline());
  focusMonthBtn?.addEventListener("click", () => void focusMonthOn3D());

  const onKey = (e) => {
    if (!container.isConnected) return;
    if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      const d = new Date(`${selectedDate}T12:00:00`);
      d.setDate(d.getDate() - 1);
      setDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
    }
    if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      const d = new Date(`${selectedDate}T12:00:00`);
      d.setDate(d.getDate() + 1);
      setDate(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
    }
  };
  window.addEventListener("keydown", onKey);

  syncLabel();
  void focusMonthOn3D();

  if (opts.dayId) {
    void openDayTimeline();
  }

  return () => {
    window.removeEventListener("keydown", onKey);
    container.innerHTML = "";
  };
}
