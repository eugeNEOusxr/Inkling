import { getActivePalette } from "../../theme/appearancePalettes.js";

let _clockInstanceSeq = 0;

/**
 * 12-hour analog clock (12 at top, 1–11 clockwise) with AM/PM — reminder or alarm styling.
 */
export class CircularTimePicker {
  /**
   * @param {HTMLElement} root
   * @param {{ onChange?: (hour24: number) => void, variant?: 'reminder'|'alarm'|'appointment' }} [opts]
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.onChange = opts.onChange ?? (() => {});
    this.variant = opts.variant ?? "reminder";
    this.hour24 = 12;
    this.isPm = false;
    this._dragging = false;
    this._gradSuffix = `c${++_clockInstanceSeq}`;

    this.root.innerHTML = "";
    this.root.className = `circular-clock-mount circular-clock-mount--${this.variant}`;

    const variantLabel =
      this.variant === "alarm"
        ? "Alarm time"
        : this.variant === "appointment"
          ? "Appointment time"
          : "Reminder time";

    this.root.innerHTML = `
      <div class="circular-clock circular-clock--${this.variant}" role="group" aria-label="${variantLabel}">
        <div class="circular-clock__bezel" aria-hidden="true"></div>
        <svg class="circular-clock__svg" viewBox="0 0 240 240" aria-hidden="true">
          <defs>
            <radialGradient id="clock-face-glow" cx="50%" cy="38%" r="65%">
              <stop offset="0%" stop-color="rgba(168, 247, 247, 0.14)"/>
              <stop offset="55%" stop-color="rgba(18, 28, 48, 0.95)"/>
              <stop offset="100%" stop-color="rgba(8, 12, 22, 1)"/>
            </radialGradient>
            <linearGradient id="clock-ring-gold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="rgba(212, 175, 55, 0.85)"/>
              <stop offset="50%" stop-color="rgba(56, 189, 248, 0.55)"/>
              <stop offset="100%" stop-color="rgba(212, 175, 55, 0.75)"/>
            </linearGradient>
          </defs>
          <circle class="circular-clock__ring" cx="120" cy="120" r="100" fill="none"></circle>
          <circle class="circular-clock__face" cx="120" cy="120" r="86" fill="url(#clock-face-glow)"></circle>
          <g class="circular-clock__ticks"></g>
          <g class="circular-clock__numerals"></g>
          <line class="circular-clock__hand" x1="120" y1="120" x2="120" y2="52"></line>
          <circle class="circular-clock__hub" cx="120" cy="120" r="8"></circle>
          ${
            this.variant === "alarm"
              ? `<text class="circular-clock__icon" x="120" y="36" text-anchor="middle" font-size="14">⏰</text>`
              : `<text class="circular-clock__icon" x="120" y="36" text-anchor="middle" font-size="14">🔔</text>`
          }
        </svg>
        <div class="circular-clock__controls">
          <div class="circular-clock__ampm" role="group" aria-label="AM or PM">
            <button type="button" class="circular-clock__ampm-btn" data-ampm="am">AM</button>
            <button type="button" class="circular-clock__ampm-btn" data-ampm="pm">PM</button>
          </div>
          <div class="circular-clock__readout" data-readout>12:00 PM</div>
        </div>
      </div>
    `;

    this.svg = this.root.querySelector(".circular-clock__svg");
    this.hand = this.root.querySelector(".circular-clock__hand");
    this.readout = this.root.querySelector("[data-readout]");
    this.ticksGroup = this.root.querySelector(".circular-clock__ticks");
    this.numeralsGroup = this.root.querySelector(".circular-clock__numerals");
    this.ampmAm = this.root.querySelector('[data-ampm="am"]');
    this.ampmPm = this.root.querySelector('[data-ampm="pm"]');

    this._buildTicks();
    this._buildNumerals();

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    this.svg.addEventListener("pointerdown", this._onPointerDown);
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);

    this.ampmAm?.addEventListener("click", () => this._setAmPm(false));
    this.ampmPm?.addEventListener("click", () => this._setAmPm(true));

    this._onAppearanceChange = () => this._applyPaletteGradients();
    window.addEventListener("inkling:appearance-change", this._onAppearanceChange);
    this._applyPaletteGradients();
  }

  _applyPaletteGradients() {
    const palette = getActivePalette();
    const defs = this.root.querySelector("[data-clock-defs]");
    const face = this.root.querySelector("[data-clock-face]");
    const ring = this.root.querySelector(".circular-clock__ring");
    if (!defs || !face) return;

    const faceId = `clock-face-glow-${this._gradSuffix}`;
    const ringId = `clock-ring-glow-${this._gradSuffix}`;

    defs.innerHTML = `
      <radialGradient id="${faceId}" cx="50%" cy="38%" r="65%">
        <stop offset="0%" stop-color="${palette.clockFaceCenter}"/>
        <stop offset="55%" stop-color="rgba(18, 28, 48, 0.95)"/>
        <stop offset="100%" stop-color="rgba(8, 12, 22, 1)"/>
      </radialGradient>
      <linearGradient id="${ringId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${palette.clockRingStart}"/>
        <stop offset="50%" stop-color="${palette.clockRingMid}"/>
        <stop offset="100%" stop-color="${palette.clockRingStart}"/>
      </linearGradient>
    `;

    face.setAttribute("fill", `url(#${faceId})`);
    if (ring) {
      ring.setAttribute("stroke", `url(#${ringId})`);
    }
    if (this.hand) {
      this.hand.setAttribute("stroke", palette.clockHand);
    }
    const hub = this.root.querySelector(".circular-clock__hub");
    if (hub) {
      hub.setAttribute("fill", palette.accent);
    }
  }

  setVariant(variant) {
    this.variant = variant;
    const clock = this.root.querySelector(".circular-clock");
    clock?.classList.remove("circular-clock--reminder", "circular-clock--alarm", "circular-clock--appointment");
    clock?.classList.add(`circular-clock--${variant}`);
    this.root.className = `circular-clock-mount circular-clock-mount--${variant}`;
  }

  _buildTicks() {
    for (let i = 0; i < 60; i++) {
      const isMajor = i % 5 === 0;
      const angle = this._markAngle(i * 6);
      const outerR = isMajor ? 96 : 92;
      const innerR = isMajor ? 82 : 88;
      const outer = this._polar(120, 120, outerR, angle);
      const inner = this._polar(120, 120, innerR, angle);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(outer.x));
      line.setAttribute("y1", String(outer.y));
      line.setAttribute("x2", String(inner.x));
      line.setAttribute("y2", String(inner.y));
      line.setAttribute(
        "class",
        isMajor ? "circular-clock__tick circular-clock__tick--major" : "circular-clock__tick"
      );
      this.ticksGroup.appendChild(line);
    }
  }

  _buildNumerals() {
    for (let h = 1; h <= 12; h++) {
      const angle = this._hour12ToAngle(h);
      const pos = this._polar(120, 120, 68, angle);
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(pos.x));
      text.setAttribute("y", String(pos.y));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.setAttribute("class", "circular-clock__numeral");
      text.textContent = String(h);
      this.numeralsGroup.appendChild(text);
    }
  }

  /**
   * @param {number} hour24 0–23
   */
  setHour(hour24) {
    this.hour24 = ((Math.round(hour24) % 24) + 24) % 24;
    this.isPm = this.hour24 >= 12;
    const h12 = this.hour24 % 12 || 12;
    this._hour12 = h12;
    this._render();
    // NOTE: setHour is the *programmatic* setter (parent syncing the clock).
    // It must NOT fire onChange, or selectHour()→setHour()→onChange()→selectHour()
    // recurses infinitely and the tap never reaches the timeline. User input
    // (_setFromPointer / _setAmPm) is what fires onChange.
  }

  getHour() {
    return this.hour24;
  }

  destroy() {
    this.svg?.removeEventListener("pointerdown", this._onPointerDown);
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("inkling:appearance-change", this._onAppearanceChange);
  }

  _setAmPm(pm) {
    this.isPm = pm;
    this.hour24 = this._to24(this._hour12, this.isPm);
    this._render();
    this.onChange(this.hour24);
  }

  _onPointerDown(event) {
    this._dragging = true;
    this.svg.setPointerCapture(event.pointerId);
    this._setFromPointer(event);
  }

  _onPointerMove(event) {
    if (!this._dragging) return;
    this._setFromPointer(event);
  }

  _onPointerUp() {
    this._dragging = false;
  }

  _setFromPointer(event) {
    const rect = this.svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    let angle = Math.atan2(dx, -dy);
    if (angle < 0) angle += Math.PI * 2;

    let hour12 = Math.round((angle / (Math.PI * 2)) * 12) % 12;
    if (hour12 === 0) hour12 = 12;

    this._hour12 = hour12;
    this.hour24 = this._to24(hour12, this.isPm);
    this._render();
    this.onChange(this.hour24);
  }

  _render() {
    const h12 = this._hour12 ?? (this.hour24 % 12 || 12);
    const angle = this._hour12ToAngle(h12);
    const tip = this._polar(120, 120, 62, angle);
    this.hand.setAttribute("x2", String(tip.x));
    this.hand.setAttribute("y2", String(tip.y));

    const ampm = this.isPm ? "PM" : "AM";
    const min = ":00";
    if (this.readout) {
      this.readout.textContent = `${h12}${min} ${ampm}`;
    }

    this.ampmAm?.classList.toggle("is-active", !this.isPm);
    this.ampmPm?.classList.toggle("is-active", this.isPm);
    this.ampmAm?.setAttribute("aria-pressed", String(!this.isPm));
    this.ampmPm?.setAttribute("aria-pressed", String(this.isPm));
  }

  /** 12 at top, 3 at right — standard clock */
  _hour12ToAngle(h12) {
    return ((h12 % 12) / 12) * Math.PI * 2;
  }

  _markAngle(deg) {
    return (deg / 360) * Math.PI * 2;
  }

  _to24(h12, isPm) {
    if (h12 === 12) return isPm ? 12 : 0;
    return isPm ? h12 + 12 : h12;
  }

  _polar(cx, cy, radius, angle) {
    return {
      x: cx + Math.sin(angle) * radius,
      y: cy - Math.cos(angle) * radius
    };
  }
}
