/**
 * Day graph skeleton — lazy-rendered note density per hour.
 * Rollback: delete file and dynamic import from notebook-calendar/index.js
 */

/**
 * @param {HTMLElement} container
 * @param {import("../../calendar/calendarState.js").DayNode | null} day
 * @param {{ onHourClick?: (hour: number) => void, slotNotes?: Record<string, string> }} [opts]
 */
export function renderDayGraph(container, day, opts = {}) {
  if (!container) return;

  const counts = new Array(24).fill(0);
  if (day) {
    for (const thread of day.threads) {
      for (const note of thread.notes) {
        const h = Number(note.hour);
        if (h >= 0 && h < 24) counts[h] += 1;
      }
    }
  }

  if (opts.slotNotes) {
    for (const [time, text] of Object.entries(opts.slotNotes)) {
      if (!text?.trim()) continue;
      const h = Number(time.split(":")[0]);
      if (h >= 0 && h < 24) counts[h] += 1;
    }
  }

  const max = Math.max(1, ...counts);
  container.innerHTML = `
    <div class="day-graph-skeleton" role="img" aria-label="Note activity by hour">
      <div class="day-graph-skeleton__bars">
        ${counts
          .map((c, hour) => {
            const pct = Math.round((c / max) * 100);
            return `<button type="button" class="day-graph-skeleton__bar${c ? " is-active" : ""}" data-hour="${hour}" style="--h:${pct}%" title="${hour}:00 — ${c}"></button>`;
          })
          .join("")}
      </div>
      <p class="day-graph-skeleton__hint">Tap a bar to jump to that hour</p>
    </div>
  `;

  container.querySelectorAll(".day-graph-skeleton__bar").forEach((bar) => {
    bar.addEventListener("click", () => {
      opts.onHourClick?.(Number(bar.getAttribute("data-hour")));
    });
  });
}

export function loadDayGraph() {
  return import("./dayGraph.js");
}
