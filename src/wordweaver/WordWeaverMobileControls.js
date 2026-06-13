/**
 * Touch flight controls — forward pad, fly / descend, optional joystick.
 */
import { isMobileWordWeaver } from "./mobileWordWeaverEnv.js";
import { getCalendarMode } from "./calendarMode.js";

const ENABLE_QUERY = "(max-width: 900px), (hover: none) and (pointer: coarse)";

export function shouldShowWordWeaverMobileControls() {
  if (typeof window === "undefined") return false;
  const onWordWeaver3d =
    (document.body?.classList.contains("inkling-tab-wordweaver") ||
      document.body?.classList.contains("wordweaver-immersive")) &&
    getCalendarMode() === "3d";
  if (!onWordWeaver3d) return false;
  if (document.body?.classList.contains("inkling-native-shell")) return true;
  if (!isMobileWordWeaver()) return false;
  if (!window.matchMedia) return true;
  return window.matchMedia(ENABLE_QUERY).matches;
}

function clamp(v, min = -1, max = 1) {
  return Math.max(min, Math.min(max, v));
}

export class WordWeaverMobileControls {
  /**
   * @param {{ onInputChange?: () => void }} [opts]
   */
  constructor(opts = {}) {
    this.onInputChange = opts.onInputChange ?? (() => {});
    this.enabled = false;
    this._forward = 0;
    this._strafe = 0;
    this._lift = 0;
    this._padForward = 0;
    this._liftUp = false;
    this._liftDown = false;
    this._joystickActive = false;
    this._pointerId = null;
    this._center = { x: 0, y: 0 };
    this._maxRadius = 42;
    this._padPointerId = null;
    this._padStartY = 0;

    this.root = document.createElement("div");
    this.root.className = "ww-mobile-nav";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "3D movement");
    this.root.innerHTML = `
      <div id="moveForwardPad" class="ww-mobile-nav__forward-pad" aria-label="Slide to move forward">
        <span class="ww-mobile-nav__forward-label">Slide forward</span>
      </div>
      <div class="ww-mobile-nav__joystick" data-joystick>
        <div class="ww-mobile-nav__joystick-base" data-joystick-base>
          <span class="ww-mobile-nav__dir ww-mobile-nav__dir--n" aria-hidden="true"></span>
          <span class="ww-mobile-nav__dir ww-mobile-nav__dir--e" aria-hidden="true"></span>
          <span class="ww-mobile-nav__dir ww-mobile-nav__dir--s" aria-hidden="true"></span>
          <span class="ww-mobile-nav__dir ww-mobile-nav__dir--w" aria-hidden="true"></span>
          <div class="ww-mobile-nav__joystick-thumb" data-joystick-thumb></div>
        </div>
      </div>
      <div class="ww-mobile-nav__altitude" aria-label="Altitude">
        <button type="button" id="flyButton" class="ww-mobile-nav__alt-btn ww-mobile-nav__alt-btn--up" data-lift="1" aria-label="Fly up">Fly</button>
        <button type="button" id="descendButton" class="ww-mobile-nav__alt-btn ww-mobile-nav__alt-btn--down" data-lift="-1" aria-label="Descend">Down</button>
      </div>
    `;

    this.moveForwardPad = /** @type {HTMLElement} */ (this.root.querySelector("#moveForwardPad"));
    this.flyButton = /** @type {HTMLButtonElement} */ (this.root.querySelector("#flyButton"));
    this.descendButton = /** @type {HTMLButtonElement} */ (this.root.querySelector("#descendButton"));
    this.baseEl = /** @type {HTMLElement} */ (this.root.querySelector("[data-joystick-base]"));
    this.thumbEl = /** @type {HTMLElement} */ (this.root.querySelector("[data-joystick-thumb]"));
    this.joystickEl = /** @type {HTMLElement} */ (this.root.querySelector("[data-joystick]"));

    this._onJoystickDown = this._onJoystickDown.bind(this);
    this._onJoystickMove = this._onJoystickMove.bind(this);
    this._onJoystickEnd = this._onJoystickEnd.bind(this);
    this._onPadStart = this._onPadStart.bind(this);
    this._onPadMove = this._onPadMove.bind(this);
    this._onPadEnd = this._onPadEnd.bind(this);
    this._onLiftDown = this._onLiftDown.bind(this);
    this._onLiftEnd = this._onLiftEnd.bind(this);
    this._onMediaChange = this._onMediaChange.bind(this);

    this.baseEl.addEventListener("pointerdown", this._onJoystickDown);
    this.moveForwardPad.addEventListener("pointerdown", this._onPadStart);
    for (const btn of [this.flyButton, this.descendButton]) {
      btn.addEventListener("pointerdown", this._onLiftDown);
      btn.addEventListener("pointerup", this._onLiftEnd);
      btn.addEventListener("pointercancel", this._onLiftEnd);
      btn.addEventListener("pointerleave", this._onLiftEnd);
    }

    this._media = window.matchMedia?.(ENABLE_QUERY);
    this._media?.addEventListener?.("change", this._onMediaChange);
    // Kill the long-press "Copy / Share / Select All / Web Search" callout that
    // popped up while holding the flight pads. preventDefault on contextmenu +
    // touch-callout:none in the styles below.
    this.root.addEventListener("contextmenu", (e) => e.preventDefault());
    this._injectStyles();
  }

  _injectStyles() {
    if (document.getElementById("ww-mobile-nav-style")) return;
    const style = document.createElement("style");
    style.id = "ww-mobile-nav-style";
    style.textContent = `
      .ww-mobile-nav, .ww-mobile-nav * {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        touch-action: none;
      }
      .ww-mobile-nav {
        position: absolute;
        inset: auto 8px 12px 8px;
        z-index: 25;
        display: flex;
        align-items: flex-end;
        gap: 10px;
        pointer-events: none;
      }
      /* The gate sets [hidden]; without this, the display:flex above overrides it
         and the overlay shows on desktop too. Honor the hidden attribute. */
      .ww-mobile-nav[hidden] { display: none !important; }
      body.inkling-tab-wordweaver #wordweaver-embed-mount,
      body.inkling-tab-wordweaver .wordweaver-embed__mount,
      body.wordweaver-immersive #wordweaver-embed-mount {
        overflow: visible !important;
      }
      .ww-mobile-nav.is-active { pointer-events: auto; }
      .ww-mobile-nav__forward-pad {
        flex: 1;
        min-height: 72px;
        max-width: 42%;
        border-radius: 14px;
        background: rgba(8, 20, 40, 0.72);
        border: 1px solid rgba(78, 230, 230, 0.35);
        touch-action: none;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #94a3b8;
        font-size: 11px;
        font-weight: 600;
      }
      .ww-mobile-nav__forward-pad.is-active {
        background: rgba(20, 60, 90, 0.85);
        color: #e2e8f0;
      }
      .ww-mobile-nav__alt-btn {
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid rgba(78, 230, 230, 0.4);
        background: rgba(8, 14, 28, 0.9);
        color: #e2e8f0;
        font-weight: 700;
        font-size: 12px;
      }
      .ww-mobile-nav__alt-btn.is-held { background: rgba(30, 80, 120, 0.95); }
      .ww-mobile-nav__altitude { display: flex; flex-direction: column; gap: 8px; }
      .ww-mobile-nav__joystick { width: 96px; height: 96px; }
      .ww-mobile-nav__joystick-base {
        width: 100%; height: 100%; border-radius: 50%;
        background: rgba(0,0,0,0.45);
        border: 1px solid rgba(78,230,230,0.3);
        position: relative;
        touch-action: none;
      }
      .ww-mobile-nav__joystick-thumb {
        position: absolute; left: 50%; top: 50%;
        width: 36px; height: 36px; margin: -18px 0 0 -18px;
        border-radius: 50%;
        background: rgba(78, 230, 230, 0.85);
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * @param {HTMLElement | null} mountEl
   */
  attach(mountEl) {
    if (!mountEl || this.root.parentElement === mountEl) return;
    mountEl.appendChild(this.root);
    this._syncVisibility();
  }

  detach() {
    this.setEnabled(false);
    this.root.remove();
  }

  /**
   * @param {boolean} on
   */
  setEnabled(on) {
    this.enabled = on && shouldShowWordWeaverMobileControls();
    if (!this.enabled) this.reset();
    this._syncVisibility();
  }

  reset() {
    this._forward = 0;
    this._strafe = 0;
    this._lift = 0;
    this._padForward = 0;
    this._liftUp = false;
    this._liftDown = false;
    this._joystickActive = false;
    this._pointerId = null;
    this._padPointerId = null;
    this._resetThumb();
    this.moveForwardPad?.classList.remove("is-active");
    window.removeEventListener("pointermove", this._onJoystickMove);
    window.removeEventListener("pointerup", this._onJoystickEnd);
    window.removeEventListener("pointercancel", this._onJoystickEnd);
    window.removeEventListener("pointermove", this._onPadMove);
    window.removeEventListener("pointerup", this._onPadEnd);
    window.removeEventListener("pointercancel", this._onPadEnd);
  }

  /**
   * @returns {{ forward: number, strafe: number, lift: number }}
   */
  getInput() {
    let lift = 0;
    if (this._liftUp) lift += 1;
    if (this._liftDown) lift -= 1;
    const forward = clamp(this._forward + this._padForward);
    return {
      forward,
      strafe: this._strafe,
      lift
    };
  }

  _syncVisibility() {
    const show = this.enabled && shouldShowWordWeaverMobileControls();
    this.root.hidden = !show;
    this.root.classList.toggle("is-active", show);
    document.body.classList.toggle("wordweaver-mobile-flight", show);
  }

  _onMediaChange() {
    if (!shouldShowWordWeaverMobileControls()) {
      this.reset();
      this._syncVisibility();
      this.onInputChange();
    } else if (this.enabled) {
      this._syncVisibility();
    }
  }

  _measureJoystick() {
    const rect = this.baseEl.getBoundingClientRect();
    this._center.x = rect.left + rect.width * 0.5;
    this._center.y = rect.top + rect.height * 0.5;
    this._maxRadius = Math.max(28, rect.width * 0.5 - 22);
  }

  /**
   * @param {PointerEvent} e
   */
  _onPadStart(e) {
    if (!this.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    this._padPointerId = e.pointerId;
    this._padStartY = e.clientY;
    this._padForward = 0.35;
    this.moveForwardPad.setPointerCapture(e.pointerId);
    this.moveForwardPad.classList.add("is-active");
    window.addEventListener("pointermove", this._onPadMove);
    window.addEventListener("pointerup", this._onPadEnd);
    window.addEventListener("pointercancel", this._onPadEnd);
    this.onInputChange();
  }

  /**
   * @param {PointerEvent} e
   */
  _onPadMove(e) {
    if (e.pointerId !== this._padPointerId) return;
    e.preventDefault();
    const dy = this._padStartY - e.clientY;
    this._padForward = clamp(0.2 + dy / 100, 0, 1.15);
    this.onInputChange();
  }

  /**
   * @param {PointerEvent} e
   */
  _onPadEnd(e) {
    if (e.pointerId !== this._padPointerId) return;
    this._padPointerId = null;
    this._padForward = 0;
    this.moveForwardPad.classList.remove("is-active");
    try {
      this.moveForwardPad.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    window.removeEventListener("pointermove", this._onPadMove);
    window.removeEventListener("pointerup", this._onPadEnd);
    window.removeEventListener("pointercancel", this._onPadEnd);
    this.onInputChange();
  }

  /**
   * @param {PointerEvent} e
   */
  _onJoystickDown(e) {
    if (!this.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    this._measureJoystick();
    this._joystickActive = true;
    this._pointerId = e.pointerId;
    this.baseEl.setPointerCapture(e.pointerId);
    this._applyJoystick(e.clientX, e.clientY);
    window.addEventListener("pointermove", this._onJoystickMove);
    window.addEventListener("pointerup", this._onJoystickEnd);
    window.addEventListener("pointercancel", this._onJoystickEnd);
  }

  /**
   * @param {PointerEvent} e
   */
  _onJoystickMove(e) {
    if (!this._joystickActive || e.pointerId !== this._pointerId) return;
    e.preventDefault();
    this._applyJoystick(e.clientX, e.clientY);
  }

  /**
   * @param {PointerEvent} e
   */
  _onJoystickEnd(e) {
    if (e.pointerId !== this._pointerId) return;
    this._joystickActive = false;
    this._pointerId = null;
    this._forward = 0;
    this._strafe = 0;
    this._resetThumb();
    try {
      this.baseEl.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    window.removeEventListener("pointermove", this._onJoystickMove);
    window.removeEventListener("pointerup", this._onJoystickEnd);
    window.removeEventListener("pointercancel", this._onJoystickEnd);
    this.onInputChange();
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   */
  _applyJoystick(clientX, clientY) {
    let dx = clientX - this._center.x;
    let dy = clientY - this._center.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this._maxRadius) {
      const s = this._maxRadius / dist;
      dx *= s;
      dy *= s;
    }

    const dead = 6;
    const mag = Math.hypot(dx, dy);
    if (mag < dead) {
      this._forward = 0;
      this._strafe = 0;
    } else {
      this._forward = clamp(-dy / this._maxRadius);
      this._strafe = clamp(dx / this._maxRadius);
    }

    this.thumbEl.style.transform = `translate(${dx}px, ${dy}px)`;
    this.joystickEl.classList.toggle("is-engaged", mag >= dead);
    this.onInputChange();
  }

  _resetThumb() {
    this.thumbEl.style.transform = "translate(0, 0)";
    this.joystickEl.classList.remove("is-engaged");
  }

  /**
   * @param {PointerEvent} e
   */
  _onLiftDown(e) {
    if (!this.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    const btn = /** @type {HTMLElement} */ (e.currentTarget);
    const lift = Number(btn.getAttribute("data-lift"));
    if (lift > 0) {
      this._liftUp = true;
      btn.classList.add("is-held");
    } else {
      this._liftDown = true;
      btn.classList.add("is-held");
    }
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.onInputChange();
  }

  /**
   * @param {PointerEvent} e
   */
  _onLiftEnd(e) {
    const btn = /** @type {HTMLElement} */ (e.currentTarget);
    const lift = Number(btn.getAttribute("data-lift"));
    if (lift > 0) {
      this._liftUp = false;
    } else {
      this._liftDown = false;
    }
    btn.classList.remove("is-held");
    this.onInputChange();
  }

  dispose() {
    this.detach();
    this._media?.removeEventListener?.("change", this._onMediaChange);
    this.baseEl.removeEventListener("pointerdown", this._onJoystickDown);
    this.moveForwardPad?.removeEventListener("pointerdown", this._onPadStart);
  }
}
