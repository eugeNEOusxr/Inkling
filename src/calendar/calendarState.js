/**
 * Central calendar data model — threads, reminders, alarms (never on Three.js meshes).
 */

export const SPACING_X = 2.2;
export const SPACING_Y = 2.2;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const STORAGE_KEY = "calendar3d-state-v2";
const STORAGE_KEY_V1 = "calendar3d-state-v1";

/** @returns {string} */
export function uid(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @typedef {Object} Note
 * @property {string} id
 * @property {number} hour
 * @property {string} text
 * @property {number} createdAt
 */

/**
 * @typedef {Object} NoteThread
 * @property {string} id
 * @property {number} createdAt
 * @property {Note[]} notes
 */

/**
 * @typedef {Object} Reminder
 * @property {string} id
 * @property {number} hour
 * @property {string} message
 * @property {number} createdAt
 * @property {number} triggerAt
 */

/**
 * @typedef {Object} Alarm
 * @property {Alarm} - same shape as Reminder
 */

/**
 * @typedef {Object} Appointment
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {number} hour
 * @property {number} createdAt
 * @property {number} triggerAt
 */

/**
 * @typedef {Object} DayNode
 * @property {string} id
 * @property {string} date
 * @property {{ x: number, y: number, z: number }} position
 * @property {NoteThread[]} threads
 * @property {Reminder[]} reminders
 * @property {Alarm[]} alarms
 * @property {Appointment[]} appointments
 */

/**
 * @typedef {Object} CalendarState
 * @property {number} year
 * @property {number} month
 * @property {DayNode[]} days
 */

/**
 * @param {{ hour: number, text: string, createdAt?: number }} params
 * @returns {Note}
 */
export function createNote({ hour, text, createdAt = Date.now(), needsAttention = false }) {
  return {
    id: uid("note"),
    hour: Number(hour),
    text: String(text),
    createdAt,
    needsAttention: Boolean(needsAttention)
  };
}

/**
 * @param {{ notes?: Note[], createdAt?: number }} [params]
 * @returns {NoteThread}
 */
export function createNoteThread({ notes = [], createdAt = Date.now(), label = "" } = {}) {
  return {
    id: uid("thread"),
    createdAt,
    label: String(label || "").trim(),
    notes: notes.map((n) => ({ ...n }))
  };
}

/**
 * @param {{ hour: number, message: string, triggerAt: number, createdAt?: number }} params
 * @returns {Reminder}
 */
export function createReminder({ hour, message, triggerAt, createdAt = Date.now() }) {
  return {
    id: uid("reminder"),
    hour: Number(hour),
    message: String(message),
    createdAt,
    triggerAt
  };
}

/**
 * @param {{ hour: number, message: string, triggerAt: number, createdAt?: number }} params
 * @returns {Reminder}
 */
export function createAlarm({ hour, message, triggerAt, createdAt = Date.now() }) {
  return {
    id: uid("alarm"),
    hour: Number(hour),
    message: String(message),
    createdAt,
    triggerAt
  };
}

/**
 * @param {{ title: string, description?: string, hour: number, triggerAt: number, createdAt?: number }} params
 * @returns {Appointment}
 */
export function createAppointment({
  title,
  description = "",
  hour,
  triggerAt,
  createdAt = Date.now()
}) {
  return {
    id: uid("appt"),
    title: String(title).trim(),
    description: String(description || ""),
    hour: Number(hour),
    createdAt,
    triggerAt
  };
}

/**
 * @param {Partial<DayNode> & Pick<DayNode, "id" | "date" | "position">} params
 * @returns {DayNode}
 */
export function createDayNode({
  id,
  date,
  position,
  threads = [],
  reminders = [],
  alarms = [],
  appointments = []
}) {
  return {
    id,
    date,
    position: { ...position },
    threads: threads.map((t) => ({
      ...t,
      label: t.label ?? "",
      notes: t.notes.map((n) => ({ ...n }))
    })),
    reminders: reminders.map((r) => ({ ...r })),
    alarms: alarms.map((a) => ({ ...a })),
    appointments: appointments.map((a) => ({ ...a }))
  };
}

export function getFirstDayOffset(year, month) {
  const d = new Date(year, month - 1, 1);
  return (d.getDay() + 6) % 7;
}

export function formatDate(year, month, day) {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export function parseDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { year: y, month: m, day: d };
}

export function isToday(dateStr) {
  const today = new Date();
  const t = formatDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
  return dateStr === t;
}

export function isWeekend(dateStr) {
  const { year, month, day } = parseDate(dateStr);
  const dow = (new Date(year, month - 1, day).getDay() + 6) % 7;
  return dow === 5 || dow === 6;
}

export function computeGridPosition(year, month, dayNumber, firstDayOffset) {
  const d = new Date(year, month - 1, dayNumber);
  const dayOfWeek = (d.getDay() + 6) % 7;
  const gridIndex = firstDayOffset + dayNumber - 1;
  const row = Math.floor(gridIndex / 7);
  return {
    x: dayOfWeek * SPACING_X,
    y: -row * SPACING_Y,
    z: 0
  };
}

/**
 * @param {Record<string, string>} notesByHour
 * @returns {NoteThread[]}
 */
export function migrateNotesToThreads(notesByHour) {
  const notes = [];
  for (const [hour, text] of Object.entries(notesByHour)) {
    if (text && String(text).trim()) {
      notes.push(createNote({ hour: Number(hour), text: String(text).trim() }));
    }
  }
  if (notes.length === 0) return [];
  return [createNoteThread({ notes, createdAt: Date.now() })];
}

/**
 * @param {object} saved
 * @returns {import("./calendarState.js").DayNode["threads"]}
 */
function threadsFromSaved(saved) {
  if (saved.threads?.length) return saved.threads;
  if (saved.notes) return migrateNotesToThreads(saved.notes);
  return [];
}

/**
 * @param {number} year
 * @param {number} month
 * @param {Record<string, object>} [dayDataByDate]
 */
export function generateDayNodes(year, month, dayDataByDate = {}) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOffset = getFirstDayOffset(year, month);
  const nodes = [];

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
    const date = formatDate(year, month, dayNumber);
    const position = computeGridPosition(year, month, dayNumber, firstDayOffset);
    const id = `day-${date}`;
    const saved = dayDataByDate[date] ?? {};

    nodes.push(
      createDayNode({
        id,
        date,
        position,
        threads: threadsFromSaved(saved),
        reminders: saved.reminders ?? [],
        alarms: saved.alarms ?? [],
        appointments: saved.appointments ?? []
      })
    );
  }

  return nodes;
}

/**
 * @param {CalendarState} state
 */
export function extractDayDataByDate(state) {
  const map = {};
  for (const day of state.days) {
    if (
      day.threads.length > 0 ||
      day.reminders.length > 0 ||
      day.alarms.length > 0 ||
      day.appointments.length > 0
    ) {
      map[day.date] = {
        threads: day.threads,
        reminders: day.reminders,
        alarms: day.alarms,
        appointments: day.appointments
      };
    }
  }
  return map;
}

export function createCalendarState(year, month, previousState = null) {
  const dayData = previousState ? extractDayDataByDate(previousState) : {};
  return { year, month, days: generateDayNodes(year, month, dayData) };
}

export function createCalendarStateFromSaved(year, month, dayDataByDate = {}) {
  return { year, month, days: generateDayNodes(year, month, dayDataByDate) };
}

export function getDayById(state, dayId) {
  return state.days.find((d) => d.id === dayId);
}

export function getThreadById(day, threadId) {
  return day.threads.find((t) => t.id === threadId);
}

/**
 * @param {DayNode} day
 */
export function dayHasNotes(day) {
  return day.threads.some((t) => t.notes.length > 0);
}

/**
 * @param {DayNode} day
 */
export function dayHasReminders(day) {
  return day.reminders.length > 0;
}

/**
 * @param {DayNode} day
 */
export function dayHasAlarms(day) {
  return day.alarms.length > 0;
}

/**
 * @param {DayNode} day
 */
export function dayHasActivity(day) {
  return dayHasNotes(day) || dayHasReminders(day) || dayHasAlarms(day);
}

/**
 * @param {DayNode} day
 */
export function getDayActivityBadges(day) {
  return {
    notes: dayHasNotes(day),
    reminder: dayHasReminders(day),
    alarm: dayHasAlarms(day)
  };
}

/**
 * Appointments wall badges: gold = appointments, blue = reminders, red = alarms.
 * @param {DayNode} day
 */
export function getAppointmentActivityBadges(day) {
  return {
    notes: day.appointments.length > 0,
    reminder: dayHasReminders(day),
    alarm: dayHasAlarms(day)
  };
}

/**
 * @param {DayNode} day
 * @returns {Appointment[]}
 */
export function getAppointmentsForDay(day) {
  return [...day.appointments].sort((a, b) => a.hour - b.hour || a.createdAt - b.createdAt);
}

/**
 * @param {DayNode} day
 * @returns {Note[]}
 */
export function getAllNotesForDay(day) {
  const all = [];
  for (const thread of day.threads) {
    for (const note of thread.notes) {
      all.push({ ...note, threadId: thread.id });
    }
  }
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * @param {CalendarState} state
 * @returns {Array<Reminder & { date: string, dayId: string, kind: 'reminder'|'alarm' }>}
 */
export function getAllScheduledItems(state) {
  const items = [];
  for (const day of state.days) {
    for (const r of day.reminders) {
      items.push({
        ...r,
        date: day.date,
        dayId: day.id,
        kind: "reminder",
        message: r.message
      });
    }
    for (const a of day.alarms) {
      items.push({
        ...a,
        date: day.date,
        dayId: day.id,
        kind: "alarm",
        message: a.message
      });
    }
    for (const ap of day.appointments) {
      items.push({
        ...ap,
        date: day.date,
        dayId: day.id,
        kind: "appointment",
        message: ap.title + (ap.description ? ` — ${ap.description}` : "")
      });
    }
  }
  return items;
}

/**
 * @param {CalendarState} state
 * @param {string} dayId
 * @param {{ title: string, description?: string, hour: number, triggerAt: number }} data
 */
export function addAppointment(state, dayId, data) {
  const day = getDayById(state, dayId);
  if (!day) return null;
  const appt = createAppointment({
    title: data.title,
    description: data.description ?? "",
    hour: data.hour,
    triggerAt: data.triggerAt
  });
  day.appointments.push(appt);
  return appt;
}

/**
 * @param {CalendarState} state
 * @param {string} dayId
 * @param {string} appointmentId
 * @param {{ title?: string, description?: string, hour?: number, triggerAt?: number }} updates
 */
export function editAppointment(state, dayId, appointmentId, updates) {
  const day = getDayById(state, dayId);
  const appt = day?.appointments.find((a) => a.id === appointmentId);
  if (!appt) return false;
  if (updates.title !== undefined) appt.title = String(updates.title).trim();
  if (updates.description !== undefined) appt.description = String(updates.description);
  if (updates.hour !== undefined) appt.hour = Number(updates.hour);
  if (updates.triggerAt !== undefined) appt.triggerAt = updates.triggerAt;
  return true;
}

/**
 * @param {CalendarState} state
 * @param {string} dayId
 * @param {string} appointmentId
 */
export function deleteAppointment(state, dayId, appointmentId) {
  const day = getDayById(state, dayId);
  if (!day) return false;
  const idx = day.appointments.findIndex((a) => a.id === appointmentId);
  if (idx === -1) return false;
  day.appointments.splice(idx, 1);
  return true;
}

export function addThread(state, dayId) {
  const day = getDayById(state, dayId);
  if (!day) return null;
  const thread = createNoteThread();
  day.threads.unshift(thread);
  return thread;
}

export function addNoteToThread(state, dayId, threadId, hour, text) {
  const day = getDayById(state, dayId);
  const thread = day ? getThreadById(day, threadId) : null;
  if (!thread || !text.trim()) return null;
  const note = createNote({ hour: Number(hour), text: text.trim() });
  thread.notes.push(note);
  return note;
}

export function updateNote(state, dayId, threadId, noteId, { hour, text, needsAttention }) {
  const day = getDayById(state, dayId);
  const thread = day ? getThreadById(day, threadId) : null;
  const note = thread?.notes.find((n) => n.id === noteId);
  if (!note) return false;
  if (hour !== undefined) note.hour = Number(hour);
  if (text !== undefined) note.text = String(text);
  if (needsAttention !== undefined) note.needsAttention = Boolean(needsAttention);
  return true;
}

export function deleteNote(state, dayId, threadId, noteId) {
  const day = getDayById(state, dayId);
  const thread = day ? getThreadById(day, threadId) : null;
  if (!thread) return false;
  const idx = thread.notes.findIndex((n) => n.id === noteId);
  if (idx === -1) return false;
  thread.notes.splice(idx, 1);
  return true;
}

export function deleteThread(state, dayId, threadId) {
  const day = getDayById(state, dayId);
  if (!day) return false;
  const idx = day.threads.findIndex((t) => t.id === threadId);
  if (idx === -1) return false;
  day.threads.splice(idx, 1);
  return true;
}

export function addReminder(state, dayId, hour, message, triggerAt) {
  const day = getDayById(state, dayId);
  if (!day) return null;
  const item = createReminder({ hour, message, triggerAt });
  day.reminders.push(item);
  return item;
}

export function addAlarm(state, dayId, hour, message, triggerAt) {
  const day = getDayById(state, dayId);
  if (!day) return null;
  const item = createAlarm({ hour, message, triggerAt });
  day.alarms.push(item);
  return item;
}

export function deleteReminder(state, dayId, reminderId) {
  const day = getDayById(state, dayId);
  if (!day) return false;
  const idx = day.reminders.findIndex((r) => r.id === reminderId);
  if (idx === -1) return false;
  day.reminders.splice(idx, 1);
  return true;
}

export function deleteAlarm(state, dayId, alarmId) {
  const day = getDayById(state, dayId);
  if (!day) return false;
  const idx = day.alarms.findIndex((a) => a.id === alarmId);
  if (idx === -1) return false;
  day.alarms.splice(idx, 1);
  return true;
}

/**
 * @param {string} dateStr
 * @param {number} hour
 */
export function computeTriggerAt(dateStr, hour) {
  const { year, month, day } = parseDate(dateStr);
  return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

export function getMonthLabel(state) {
  return `${MONTH_NAMES[state.month - 1]} ${state.year}`;
}

export function addMonths(year, month, delta) {
  let m = month + delta;
  let y = year;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return { year: y, month: m };
}

export function persistCalendarState(state) {
  try {
    const payload = {
      year: state.year,
      month: state.month,
      dayDataByDate: extractDayDataByDate(state)
    };
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(payload)
    );

  } catch (error) {

  }
}

function loadV1DayData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V1);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data.notesByDate ?? null;
  } catch {
    return null;
  }
}

export function loadSavedMonth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.year && data.month) {

        return {
          year: data.year,
          month: data.month,
          dayDataByDate: data.dayDataByDate ?? {}
        };
      }
    }

    const v1 = loadV1DayData();
    if (v1) {
      const dayDataByDate = {};
      for (const [date, notes] of Object.entries(v1)) {
        dayDataByDate[date] = { threads: migrateNotesToThreads(notes) };
      }
      return {
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        dayDataByDate
      };
    }
  } catch (error) {

  }
  return null;
}

export function formatTimestamp(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatHour(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * @param {DayNode} day
 * @param {number} hour
 */
export function hourHasNotesInDay(day, hour) {
  const h = Number(hour);
  return day.threads.some((t) => t.notes.some((n) => n.hour === h));
}

/**
 * @param {DayNode} day
 * @param {string} threadId
 * @param {number} hour
 * @returns {Note|null}
 */
export function getNoteInThreadForHour(day, threadId, hour) {
  const thread = getThreadById(day, threadId);
  if (!thread) return null;
  return thread.notes.find((n) => n.hour === Number(hour)) ?? null;
}

/**
 * Update existing note at hour in thread, or create one.
 * @param {CalendarState} state
 * @param {string} dayId
 * @param {string} threadId
 * @param {number} hour
 * @param {string} text
 */
export function upsertNoteInThread(state, dayId, threadId, hour, text) {
  const day = getDayById(state, dayId);
  const thread = day ? getThreadById(day, threadId) : null;
  if (!thread) return null;
  const trimmed = String(text).trim();
  const h = Number(hour);
  const existing = thread.notes.find((n) => n.hour === h);
  if (!trimmed) {
    if (existing) deleteNote(state, dayId, threadId, existing.id);
    return null;
  }
  if (existing) {
    existing.text = trimmed;
    return existing;
  }
  return addNoteToThread(state, dayId, threadId, h, trimmed);
}
