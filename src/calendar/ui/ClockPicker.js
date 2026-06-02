/**
 * Compact SVG clock picker (hour + minute). Lazy-load friendly.
 * Rollback: delete this file and remove AppointmentPanel clock wiring.
 */
export default class ClockPicker {
  /**
   * @param {{ value?: string, onChange?: (value: string) => void, onConfirm?: (value: string) => void }} opts
   */
  constructor(opts = {}) {
    this.value = opts.value ?? "12:00";
    this.onChange = opts.onChange ?? (() => {});
    this.onConfirm = opts.onConfirm ?? (() => {});
    this._dragging = null;
    this._parseValue(this.value);

    this.el = document.createElement("div");
    this.el.className = "clock-picker";
    this.el.setAttribute("role", "application");
    this.el.setAttribute("aria-label", "Time picker");
    this._render();
    this._bindKeyboard();
  }

  _parseValue(v) {
    const [h, m] = String(v).split(":");
    this._hour = Math.min(23, Math.max(0, Number(h) || 0));
    this._minute = Math.min(59, Math.max(0, Number(m) || 0));
    this.value = `${String(this._hour).padStart(2, "0")}:${String(this._minute).padStart(2, "0")}`;
  }

  _render() {
    this.el.innerHTML = `
      <svg viewBox="0 0 200 200" class="clock-svg" aria-hidden="true">
        <circle cx="100" cy="100" r="90" class="clock-bg"/>
        <g class="clock-ticks"></g>
        <line class="hour-hand" x1="100" y1="100" x2="100" y2="62" stroke-linecap="round"/>
        <line class="minute-hand" x1="100" y1="100" x2="100" y2="42" stroke-linecap="round"/>
        <circle cx="100" cy="100" r="6" class="clock-hub"/>
      </svg>
      <div class="clock-readout" data-readout></div>
      <div class="clock-controls">
        <button type="button" class="clock-confirm btn-primary">Set</button>
      </div>
    `;
    this._ticksGroup = this.el.querySelector(".clock-ticks");
    this._hourHand = this.el.querySelector(".hour-hand");
    this._minuteHand = this.el.querySelector(".minute-hand");
    this._readout = this.el.querySelector("[data-readout]");
    this._buildTicks();
    this._updateHands();
    this._attachHandlers();
  }

  _buildTicks() {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const x1 = 100 + Math.sin(angle) * 82;
      const y1 = 100 - Math.cos(angle) * 82;
      const x2 = 100 + Math.sin(angle) * 72;
      const y2 = 100 - Math.cos(angle) * 72;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(x1));
      line.setAttribute("y1", String(y1));
      line.setAttribute("x2", String(x2));
      line.setAttribute("y2", String(y2));
      line.setAttribute("class", "clock-tick");
      this._ticksGroup.appendChild(line);
    }
  }

  _attachHandlers() {
    const svg = this.el.querySelector(".clock-svg");
    svg.addEventListener("pointerdown", (e) => this._onPointer(e));
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerEnd);
    this.el.querySelector(".clock-confirm")?.addEventListener("click", () => {
      this.onConfirm(this.value);
    });
  }

  _bindKeyboard() {
    this.el.tabIndex = 0;
    this.el.addEventListener("keydown", (e) => {
      let { _hour: h, _minute: m } = this;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        m = (m + 1) % 60;
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        m = (m + 59) % 60;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        h = (h + 23) % 24;
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        h = (h + 1) % 24;
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.onConfirm(this.value);
        return;
      } else {
        return;
      }
      this._hour = h;
      this._minute = m;
      this._emit();
      this._updateHands();
    });
  }

  _onPointer(e) {
    const mode = e.shiftKey ? "minute" : "hour";
    this._dragging = mode;
    this.el.querySelector(".clock-svg")?.setPointerCapture(e.pointerId);
    this._setFromPointer(e, mode);
  }

  _onPointerMove(e) {
    if (!this._dragging) return;
    this._setFromPointer(e, this._dragging);
  }

  _onPointerEnd() {
    this._dragging = null;
  }

  _setFromPointer(e, mode) {
    const svg = this.el.querySelector(".clock-svg");
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const angle = Math.atan2(dx, -dy);
    if (mode === "hour") {
      this._hour = Math.round((angle / (Math.PI * 2)) * 24) % 24;
      if (this._hour < 0) this._hour += 24;
    } else {
      this._minute = Math.round((angle / (Math.PI * 2)) * 60) % 60;
      if (this._minute < 0) this._minute += 60;
    }
    this._emit();
    this._updateHands();
  }

  _emit() {
    this.value = `${String(this._hour).padStart(2, "0")}:${String(this._minute).padStart(2, "0")}`;
    if (this._readout) this._readout.textContent = this.value;
    this.onChange(this.value);
  }

  _updateHands() {
    const hAngle = (this._hour / 24) * Math.PI * 2;
    const mAngle = (this._minute / 60) * Math.PI * 2;
    const hTip = this._polar(100, 100, 58, hAngle);
    const mTip = this._polar(100, 100, 76, mAngle);
    this._hourHand?.setAttribute("x2", String(hTip.x));
    this._hourHand?.setAttribute("y2", String(hTip.y));
    this._minuteHand?.setAttribute("x2", String(mTip.x));
    this._minuteHand?.setAttribute("y2", String(mTip.y));
    if (this._readout) this._readout.textContent = this.value;
  }

  _polar(cx, cy, r, angle) {
    return { x: cx + Math.sin(angle) * r, y: cy - Math.cos(angle) * r };
  }

  setValue(value) {
    this._parseValue(value);
    this._updateHands();
  }

  getValue() {
    return this.value;
  }

  mount(container) {
    container.appendChild(this.el);
  }

  unmount() {
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerEnd);
    this.el.remove();
  }
}

/** @returns {Promise<typeof ClockPicker>} */
export function loadClockPicker() {
  return Promise.resolve(ClockPicker);
}
