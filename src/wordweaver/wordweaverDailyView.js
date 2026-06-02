/**
 * @param {import('../calendar/calendarState.js').CalendarState} state
 * @param {string} dateStr
 */
export function buildDailySummary(state, dateStr) {
  const day = state.days.find((d) => d.date === dateStr);
  if (!day) {
    return { appointments: [], reminders: [], alarms: [], noteCount: 0 };
  }

  const appointments = [...day.appointments].sort((a, b) => a.hour - b.hour);
  const reminders = [...day.reminders].sort((a, b) => a.hour - b.hour);
  const alarms = [...day.alarms].sort((a, b) => a.hour - b.hour);
  let noteCount = 0;
  for (const thread of day.threads) noteCount += thread.notes.length;

  return { appointments, reminders, alarms, noteCount, dayId: day.id };
}

/**
 * @param {ReturnType<typeof buildDailySummary>} summary
 */
export function renderDailySummaryHtml(summary) {
  const fmt = (hour) => `${String(hour).padStart(2, "0")}:00`;

  const apptRows = summary.appointments.length
    ? summary.appointments
        .map(
          (a) =>
            `<li><span class="ww-daily__time">${fmt(a.hour)}</span> ${escapeHtml(a.title || "Appointment")}</li>`
        )
        .join("")
    : `<li class="ww-daily__empty">No appointments</li>`;

  const remRows = summary.reminders.length
    ? summary.reminders
        .map(
          (r) =>
            `<li><span class="ww-daily__time">${fmt(r.hour)}</span> ${escapeHtml(r.message || "Reminder")}</li>`
        )
        .join("")
    : `<li class="ww-daily__empty">No reminders</li>`;

  const alarmRows = summary.alarms.length
    ? summary.alarms
        .map(
          (a) =>
            `<li><span class="ww-daily__time">${fmt(a.hour)}</span> ${escapeHtml(a.message || "Alarm")}</li>`
        )
        .join("")
    : "";

  return `
    <div class="ww-daily__cols">
      <div class="ww-daily__col">
        <h4>Appointments</h4>
        <ul>${apptRows}</ul>
      </div>
      <div class="ww-daily__col">
        <h4>Reminders</h4>
        <ul>${remRows}</ul>
      </div>
      ${
        alarmRows
          ? `<div class="ww-daily__col"><h4>Alarms</h4><ul>${alarmRows}</ul></div>`
          : ""
      }
    </div>
    <p class="ww-daily__meta">${summary.noteCount} notebook note${summary.noteCount === 1 ? "" : "s"} on the wall</p>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
