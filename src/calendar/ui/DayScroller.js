/**
 * 24-hour day navigator with 30-minute slots (48 total).
 * Vertical timeline mode: time label + comment field per row.
 */

const SLOT_COUNT = 48;

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** @param {number} slotIndex 0–47 */
export function slotIndexToTime(slotIndex) {
  const i = Math.max(0, Math.min(SLOT_COUNT - 1, slotIndex));
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? 0 : 30;
  return `${pad2(h)}:${pad2(m)}`;
}

/** @param {string} time HH:MM */
export function timeToSlotIndex(time) {
  const [h, m] = String(time).split(":").map(Number);
  const hour = Number.isFinite(h) ? h : 0;
  const minute = Number.isFinite(m) ? m : 0;
  return Math.max(0, Math.min(SLOT_COUNT - 1, hour * 2 + (minute >= 30 ? 1 : 0)));
}

function addDaysIso(iso, delta) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatHeader(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default class DayScroller {
  /**
   * @param {HTMLElement} container
   * @param {object} opts
   */
  constructor(container, opts = {}) {
    this.container = container;
    this.date = opts.date ?? todayIso();
    this.selectedIndex = timeToSlotIndex(opts.time ?? "00:00");
    this.onSelect = opts.onSelect ?? (() => {});
    this.onCommit = opts.onCommit ?? (() => {});
    this.onDateChange = opts.onDateChange ?? (() => {});
    this.showDateNav = opts.showDateNav !== false;
    this.compact = Boolean(opts.compact);
    this.orientation = opts.orientation === "horizontal" ? "horizontal" : "vertical";
    this.inlineNotes =
      opts.inlineNotes ?? (this.orientation === "vertical" && !this.compact);
    /** @type {'notes'|'appointments'} */
    this.timelineKind = opts.timelineKind ?? "notes";
    /** @type {Record<string, string>} */
    this.slotNotes = opts.slotNotes ?? {};
    /** @type {Record<string, Array<{ id: string, title: string }>>} */
    this.slotAppointments = opts.slotAppointments ?? {};
    this.onCommitAppointment = opts.onCommitAppointment ?? (() => {});
    this.onDeleteAppointment = opts.onDeleteAppointment ?? (() => {});

    this.el = document.createElement("div");
    this.el.className = [
      "day-scroller",
      this.compact ? "day-scroller--compact" : "",
      this.orientation === "vertical" ? "day-scroller--vertical" : "day-scroller--horizontal",
      this.inlineNotes ? "day-scroller--timeline" : ""
    ]
      .filter(Boolean)
      .join(" ");
    this._render();
    this._bindKeyboard();
    this._enableTouchScroll();
    container.appendChild(this.el);
  }

  /** Touch + mouse wheel: scroll timeline without the 3D canvas or time wheel stealing input. */
  _enableTouchScroll() {
    const track = this.track;
    const wrap = this.el?.querySelector(".day-scroller__track-wrap");
    if (!track) return;

    track.setAttribute("tabindex", "0");

    const stopBubble = (e) => e.stopPropagation();
    for (const el of [track, wrap, this.el]) {
      if (!el || el.dataset.scrollerBound) continue;
      el.dataset.scrollerBound = "1";
      el.addEventListener("touchstart", stopBubble, { passive: true });
      el.addEventListener("touchmove", stopBubble, { passive: true });
      el.addEventListener("pointerdown", stopBubble);
    }

    // Regression guard (enforced by scripts/check-dayscroller-scroll.mjs): the
    // timeline time-slot list MUST stay vertically scrollable. CSS overrides have
    // stripped this repeatedly — e.g. `max-height: none` on .notebook-writer-
    // scroller-mount unbinds the flex height, so the track never overflows and the
    // hours run off-screen instead of scrolling. Enforce it on the track itself
    // with inline !important so no stylesheet edit can remove the scroll again.
    if (this.inlineNotes && this.orientation === "vertical") {
      track.style.setProperty("overflow-y", "auto", "important");
      track.style.setProperty("max-height", "min(62dvh, 700px)", "important");
      track.style.setProperty("-webkit-overflow-scrolling", "touch");
      track.style.setProperty("touch-action", "pan-y");
    }

    // The track is the scroll element (the wrap is overflow:hidden in the
    // notebook layout), so wheel events must scroll the track, not the wrap.
    const wheelTarget = track;
    if (!wheelTarget.dataset.wheelBound) {
      wheelTarget.dataset.wheelBound = "1";
      wheelTarget.addEventListener(
        "wheel",
        (e) => {
          if (wheelTarget.scrollHeight <= wheelTarget.clientHeight) return;
          e.preventDefault();
          e.stopPropagation();
          wheelTarget.scrollTop += e.deltaY;
        },
        { passive: false }
      );
    }
  }

  _render() {
    const trackClass = [
      "day-scroller__track",
      this.inlineNotes ? "day-scroller__track--timeline" : ""
    ]
      .filter(Boolean)
      .join(" ");

    this.el.innerHTML = `
      ${
        this.showDateNav
          ? `
      <div class="day-scroller__nav">
        <button type="button" class="day-scroller__day-btn" data-day-delta="-1" aria-label="Previous day">‹</button>
        <div class="day-scroller__header">
          <span class="day-scroller__month-year">${formatHeader(this.date)}</span>
        </div>
        <button type="button" class="day-scroller__day-btn" data-day-delta="1" aria-label="Next day">›</button>
      </div>
      `
          : !this.inlineNotes
            ? `<div class="day-scroller__header day-scroller__header--compact"><span class="day-scroller__month-year">Select time</span></div>`
            : ""
      }
      <div class="day-scroller__track-wrap">
        <div class="${trackClass}" role="listbox" aria-label="Time slots" tabindex="0"></div>
        <div class="day-scroller__scroll-rail" aria-hidden="true" title="Scroll hours"></div>
      </div>
      ${
        this.showDateNav && !this.inlineNotes
          ? `
      <div class="day-scroller__note">
        <label class="day-scroller__note-label">Note for <span data-slot-label>${slotIndexToTime(this.selectedIndex)}</span></label>
        <textarea class="day-scroller__note-input" rows="2" placeholder="Write a note for this slot…"></textarea>
      </div>
      `
          : ""
      }
    `;

    this.track = this.el.querySelector(".day-scroller__track");
    this.noteInput = this.el.querySelector(".day-scroller__note-input");
    this.slotLabel = this.el.querySelector("[data-slot-label]");

    this._buildSlots();
    this._wireNav();
    this._wireNote();
    this._ensureTrackScrollable();
    this.scrollToTime(slotIndexToTime(this.selectedIndex), false);
  }

  /** Guarantee the full 24h timeline (48 slots) can scroll with a visible bar. */
  _ensureTrackScrollable() {
    const wrap = this.el?.querySelector(".day-scroller__track-wrap");
    const track = this.track;
    if (!wrap || !track) return;

    wrap.style.minHeight = "0";
    if (this.inlineNotes && this.orientation === "vertical") {
      // Single scroll container = the track (see the regression guard in
      // _enableTouchScroll). The wrap must stay a passthrough so we don't nest
      // two scrollers and so scrollToTime targets the element that actually
      // moves. Inline !important beats any stylesheet that tries to re-add a
      // max-height/overflow to the wrap.
      wrap.style.setProperty("overflow", "visible", "important");
      wrap.style.setProperty("max-height", "none", "important");
      wrap.style.setProperty("height", "auto", "important");
      wrap.style.setProperty("padding", "0", "important");
      track.style.setProperty("overflow-y", "auto", "important");
      track.style.setProperty("overflow-x", "hidden", "important");
      track.style.setProperty("max-height", "min(62dvh, 700px)", "important");
    } else {
      track.style.overflowY = "scroll";
      track.style.maxHeight = track.style.maxHeight || "min(58vh, 480px)";
    }
    track.style.scrollbarWidth = "thin";
  }

  _buildSlots() {
    if (!this.track) return;
    this.track.innerHTML = "";

    for (let i = 0; i < SLOT_COUNT; i++) {
      const time = slotIndexToTime(i);
      if (this.inlineNotes) {
        this._appendTimelineRow(i, time);
      } else {
        this._appendSlotButton(i, time);
      }
    }
  }

  /**
   * @param {number} i
   * @param {string} time
   */
  _appendTimelineRow(i, time) {
    if (this.timelineKind === "appointments") {
      this._appendAppointmentTimelineRow(i, time);
      return;
    }

    const row = document.createElement("div");
    row.className = "day-scroller__row";
    row.setAttribute("role", "option");
    row.setAttribute("data-slot", String(i));
    row.setAttribute("data-time", time);
    row.setAttribute("aria-selected", String(i === this.selectedIndex));
    if (i === this.selectedIndex) row.classList.add("is-selected");
    if (this.slotNotes[time]?.trim()) row.classList.add("has-note");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-scroller__slot";
    btn.setAttribute("aria-label", `Select ${time}`);
    btn.innerHTML = `<span class="day-scroller__slot-time">${time}</span>`;
    btn.addEventListener("click", () => this._selectIndex(i));

    const inputWrap = document.createElement("div");
    inputWrap.className = "day-scroller__slot-input-wrap";

    const comment = document.createElement("textarea");
    comment.className = "day-scroller__slot-comment";
    comment.setAttribute("aria-label", `Note at ${time}`);
    comment.rows = 1;
    comment.placeholder = "Type a note…";
    comment.value = this.slotNotes[time] ?? "";
    comment.addEventListener("focus", () => this._selectIndex(i, true, true));
    comment.addEventListener("input", () => {
      this.slotNotes[time] = comment.value;
      row.classList.toggle("has-note", Boolean(comment.value.trim()));
    });
    comment.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this._commitRow(i, time, comment, row);
      }
    });

    const enterBtn = document.createElement("button");
    enterBtn.type = "button";
    enterBtn.className = "day-scroller__slot-enter btn-primary btn-sm";
    enterBtn.textContent = "Enter";
    enterBtn.setAttribute("aria-label", `Save note at ${time}`);
    enterBtn.addEventListener("click", () => this._commitRow(i, time, comment, row));

    inputWrap.append(comment, enterBtn);
    row.append(btn, inputWrap);
    this.track.appendChild(row);
  }

  /**
   * @param {number} i
   * @param {string} time
   */
  _appendAppointmentTimelineRow(i, time) {
    // Exact 30-min slot only. Using the whole hour made an appointment show in
    // BOTH the :00 and :30 rows (the "11:15 overlaps itself" bug).
    const appts = this.slotAppointments[time] ?? [];

    const row = document.createElement("div");
    row.className = "day-scroller__row day-scroller__row--appointment";
    row.setAttribute("role", "option");
    row.setAttribute("data-slot", String(i));
    row.setAttribute("data-time", time);
    row.setAttribute("aria-selected", String(i === this.selectedIndex));
    if (i === this.selectedIndex) row.classList.add("is-selected");
    if (appts.length > 0) row.classList.add("has-appointment");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-scroller__slot";
    btn.setAttribute("aria-label", `Select ${time}`);
    btn.innerHTML = `<span class="day-scroller__slot-time">${time}</span>`;
    btn.addEventListener("click", () => this._selectIndex(i));

    const inputWrap = document.createElement("div");
    inputWrap.className = "day-scroller__slot-input-wrap day-scroller__slot-input-wrap--appointment";

    if (appts.length > 0) {
      const list = document.createElement("ul");
      list.className = "day-scroller__appointment-list";
      for (const appt of appts) {
        const li = document.createElement("li");
        li.className = "day-scroller__appointment-item";
        li.innerHTML = `
          <span class="day-scroller__appointment-title">${escapeHtml(appt.title)}</span>
          <button type="button" class="day-scroller__appointment-delete" data-id="${escapeHtml(appt.id)}" aria-label="Remove appointment">×</button>
        `;
        li.querySelector(".day-scroller__appointment-delete")?.addEventListener("click", (e) => {
          e.stopPropagation();
          this.onDeleteAppointment({ date: this.date, time, appointmentId: appt.id });
        });
        list.appendChild(li);
      }
      inputWrap.appendChild(list);
    }

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "day-scroller__slot-appointment-input";
    titleInput.setAttribute("aria-label", `Appointment at ${time}`);
    titleInput.placeholder = "Appointment title…";
    titleInput.addEventListener("focus", () => this._selectIndex(i, true, true));
    titleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this._commitAppointmentRow(i, time, titleInput, row);
      }
    });

    const enterBtn = document.createElement("button");
    enterBtn.type = "button";
    enterBtn.className = "day-scroller__slot-enter btn-primary btn-sm";
    enterBtn.textContent = "Enter";
    enterBtn.setAttribute("aria-label", `Add appointment at ${time}`);
    enterBtn.addEventListener("click", () => this._commitAppointmentRow(i, time, titleInput, row));

    inputWrap.append(titleInput, enterBtn);
    row.append(btn, inputWrap);
    this.track.appendChild(row);
  }

  /**
   * @param {number} i
   * @param {string} time
   * @param {HTMLInputElement} titleEl
   * @param {HTMLElement} row
   */
  _commitAppointmentRow(i, time, titleEl, row) {
    const title = titleEl.value.trim();
    if (!title) return;
    this._selectIndex(i, true);
    this.onCommitAppointment({
      date: this.date,
      time,
      slotIndex: i,
      title
    });
    titleEl.value = "";
    row.classList.add("has-appointment");
    titleEl.classList.add("is-saved");
    setTimeout(() => titleEl.classList.remove("is-saved"), 1200);
  }

  /**
   * @param {number} i
   * @param {string} time
   * @param {HTMLTextAreaElement} commentEl
   * @param {HTMLElement} row
   */
  _commitRow(i, time, commentEl, row) {
    const note = commentEl.value;
    this.slotNotes[time] = note;
    row.classList.toggle("has-note", Boolean(note.trim()));
    row.classList.toggle("is-committed", Boolean(note.trim()));
    this._selectIndex(i, true);
    this.onCommit({
      date: this.date,
      time,
      slotIndex: i,
      note
    });
    if (note.trim()) {
      commentEl.classList.add("is-saved");
      setTimeout(() => commentEl.classList.remove("is-saved"), 1200);
    }
  }

  /**
   * @param {number} i
   * @param {string} time
   */
  _appendSlotButton(i, time) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-scroller__slot";
    btn.setAttribute("role", "option");
    btn.setAttribute("data-slot", String(i));
    btn.setAttribute("data-time", time);
    btn.setAttribute("aria-selected", String(i === this.selectedIndex));
    if (i === this.selectedIndex) btn.classList.add("is-selected");
    if (this.slotNotes[time]) btn.classList.add("has-note");

    const hourLabel =
      this.orientation === "vertical"
        ? slotIndexToTime(i)
        : i % 2 === 0
          ? `${pad2(Math.floor(i / 2))}:00`
          : "·30";
    btn.innerHTML = `<span class="day-scroller__slot-time">${hourLabel}</span>`;
    btn.addEventListener("click", () => this._selectIndex(i));
    this.track.appendChild(btn);
  }

  _wireNav() {
    this.el.querySelectorAll("[data-day-delta]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const delta = Number(btn.getAttribute("data-day-delta"));
        this.setDate(addDaysIso(this.date, delta));
      });
    });
  }

  _wireNote() {
    if (!this.noteInput) return;
    const time = slotIndexToTime(this.selectedIndex);
    this.noteInput.value = this.slotNotes[time] ?? "";
    this.noteInput.addEventListener("input", () => {
      const t = slotIndexToTime(this.selectedIndex);
      this.slotNotes[t] = this.noteInput.value;
      this.onSelect({
        date: this.date,
        time: t,
        slotIndex: this.selectedIndex,
        note: this.noteInput.value,
        persistNote: true
      });
      this._markHasNote(t, Boolean(this.noteInput.value.trim()));
    });
  }

  /**
   * @param {string} time
   * @param {boolean} hasNote
   */
  _markHasNote(time, hasNote) {
    if (this.inlineNotes) {
      this.track
        ?.querySelector(`.day-scroller__row[data-time="${time}"]`)
        ?.classList.toggle("has-note", hasNote);
    } else {
      this.track?.querySelector(`[data-time="${time}"]`)?.classList.toggle("has-note", hasNote);
    }
  }

  /**
   * @param {number} index
   * @param {boolean} [silent] skip onSelect (sync from parent)
   */
  _selectIndex(index, silent = false, skipScroll = false) {
    this.selectedIndex = index;
    const time = slotIndexToTime(index);

    if (this.inlineNotes) {
      this.track?.querySelectorAll(".day-scroller__row").forEach((el) => {
        const slot = Number(el.getAttribute("data-slot"));
        const on = slot === index;
        el.classList.toggle("is-selected", on);
        el.setAttribute("aria-selected", String(on));
      });
    } else {
      this.track?.querySelectorAll(".day-scroller__slot").forEach((el) => {
        const slot = Number(el.getAttribute("data-slot"));
        const on = slot === index;
        el.classList.toggle("is-selected", on);
        el.setAttribute("aria-selected", String(on));
      });
    }

    if (this.slotLabel) this.slotLabel.textContent = time;
    if (this.noteInput) {
      this.noteInput.value = this.slotNotes[time] ?? "";
    }
    // skipScroll: when the user taps/focuses a slot directly, don't re-center —
    // that snap was making the clock-selected slot the only reachable one. Free
    // scroll + tap any slot (incl. :30) now works.
    if (!skipScroll) this.scrollToTime(time, true);
    if (!silent) {
      this.onSelect({
        date: this.date,
        time,
        slotIndex: index,
        note: this.slotNotes[time] ?? "",
        persistNote: false
      });
    }
  }

  /**
   * @param {string} time HH:MM
   * @param {boolean} [smooth]
   */
  scrollToTime(time, smooth = true) {
    const index = timeToSlotIndex(time);
    const selector = this.inlineNotes
      ? `.day-scroller__row[data-slot="${index}"]`
      : `[data-slot="${index}"]`;
    const slot = this.track?.querySelector(selector);
    if (!slot) return;
    const vertical = this.orientation === "vertical";
    // The track is the single scroll container (see _enableTouchScroll).
    const scrollRoot = this.track;
    if (vertical && scrollRoot && scrollRoot.scrollHeight > scrollRoot.clientHeight) {
      // Rect-based delta so it works no matter what the slot's offsetParent is.
      const slotRect = slot.getBoundingClientRect();
      const rootRect = scrollRoot.getBoundingClientRect();
      const delta =
        slotRect.top - rootRect.top - scrollRoot.clientHeight / 2 + slot.offsetHeight / 2;
      const target = Math.max(0, scrollRoot.scrollTop + delta);
      // Direct assignment is reliable; scrollTo({behavior:"smooth"}) was silently
      // no-op'ing here so picking a time never scrolled the slot into view.
      if (smooth && !prefersReducedMotion() && typeof scrollRoot.scrollTo === "function") {
        scrollRoot.scrollTo({ top: target, behavior: "smooth" });
      }
      scrollRoot.scrollTop = target;
      return;
    }
    slot.scrollIntoView({
      behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
      block: vertical ? "center" : "nearest",
      inline: vertical ? "nearest" : "center"
    });
  }

  /**
   * @param {string} iso YYYY-MM-DD
   */
  setDate(iso) {
    this.date = iso;
    this.onDateChange(iso);
    const header = this.el.querySelector(".day-scroller__month-year");
    if (header && this.showDateNav) header.textContent = formatHeader(iso);
    this._buildSlots();
    this._selectIndex(this.selectedIndex, true);
  }

  getDate() {
    return this.date;
  }

  getSelectedTime() {
    return slotIndexToTime(this.selectedIndex);
  }

  /**
   * @param {string} time HH:MM
   * @param {boolean} [silent]
   */
  selectTime(time, silent = false) {
    this._selectIndex(timeToSlotIndex(time), silent);
  }

  /** Scroll to a slot and focus its note field (vertical timeline). */
  focusSlotAtTime(time) {
    this.scrollToTime(time, !prefersReducedMotion());
    const index = timeToSlotIndex(time);
    const row = this.track?.querySelector(`.day-scroller__row[data-slot="${index}"]`);
    const field = row?.querySelector(
      ".day-scroller__slot-comment, .day-scroller__slot-appointment-input, .day-scroller__note-input"
    );
    // preventScroll: our scrollToTime already positioned the track; letting the
    // browser scroll-on-focus would fight it and jump the panel.
    field?.focus?.({ preventScroll: true });
  }

  setSlotNotes(notes) {
    this.slotNotes = notes ?? {};
    this._buildSlots();
    this._selectIndex(this.selectedIndex, true);
  }

  setSlotAppointments(byTime) {
    this.slotAppointments = byTime ?? {};
    this._buildSlots();
    this._selectIndex(this.selectedIndex, true);
  }

  _bindKeyboard() {
    this.el.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "ArrowLeft" && this.showDateNav && (e.altKey || e.metaKey)) {
        e.preventDefault();
        this.setDate(addDaysIso(this.date, -1));
        return;
      }
      if (e.key === "ArrowRight" && this.showDateNav && (e.altKey || e.metaKey)) {
        e.preventDefault();
        this.setDate(addDaysIso(this.date, 1));
        return;
      }
      const prevKeys =
        this.orientation === "vertical" ? ["ArrowUp"] : ["ArrowLeft", "ArrowUp"];
      const nextKeys =
        this.orientation === "vertical" ? ["ArrowDown"] : ["ArrowRight", "ArrowDown"];
      if (prevKeys.includes(e.key)) {
        e.preventDefault();
        this._selectIndex(Math.max(0, this.selectedIndex - 1));
      }
      if (nextKeys.includes(e.key)) {
        e.preventDefault();
        this._selectIndex(Math.min(SLOT_COUNT - 1, this.selectedIndex + 1));
      }
    });

    this.track?.addEventListener(
      "wheel",
      (e) => {
        if (this.orientation !== "vertical") return;
        e.stopPropagation();
      },
      { passive: true }
    );
  }

  destroy() {
    this.el.remove();
  }
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Lazy loader for bundle splitting. */
export function loadDayScroller() {
  return import("./DayScroller.js").then((m) => m.default);
}
