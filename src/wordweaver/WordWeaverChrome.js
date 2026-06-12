import { WordWeaverMobileControls } from "./WordWeaverMobileControls.js";

/**
 * WordWeaver chrome — outer scroll, arrow keys, scroll rail, fullscreen, flight key routing.
 */
export class WordWeaverChrome {
  /**
   * @param {import('./WordWeaverEmbed.js').WordWeaverEmbed} embed
   */
  constructor(embed) {
    this.embed = embed;
    this.scrollEl = document.getElementById("wordweaver-embed-scroll");
    this.mountEl = document.getElementById("wordweaver-embed-mount");
    this.fullscreenBtn = document.getElementById("wordweaver-fullscreen-btn");
    this.scrollUpBtn = document.getElementById("wordweaver-scroll-up");
    this.scrollDownBtn = document.getElementById("wordweaver-scroll-down");

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onFullscreenChange = this._onFullscreenChange.bind(this);

    this._keysHeld = new Set();
    this._bound = false;

    this._mobileControls = new WordWeaverMobileControls({
      onInputChange: () => this._pushFlightToScene()
    });
    this._mobileControls.attach(this.mountEl);

    this.fullscreenBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleFullscreen();
    });
    this.scrollUpBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.scrollBy(-120);
    });
    this.scrollDownBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.scrollBy(120);
    });

    document.addEventListener("fullscreenchange", this._onFullscreenChange);
    this._syncFullscreenButton();
  }

  setActive(active) {
    if (active && !this._bound) {
      document.addEventListener("keydown", this._onKeyDown, true);
      document.addEventListener("keyup", this._onKeyUp, true);
      this.attachWheelTargets();
      this._bound = true;
      this.scrollEl?.focus({ preventScroll: true });
      this._mobileControls.attach(this.mountEl);
      this._mobileControls.setEnabled(true);
    } else if (!active && this._bound) {
      document.removeEventListener("keydown", this._onKeyDown, true);
      document.removeEventListener("keyup", this._onKeyUp, true);
      this.detachWheelTargets();
      this._keysHeld.clear();
      this._mobileControls.setEnabled(false);
      this._pushFlightToScene();
      this._bound = false;
    }
  }

  attachWheelTargets() {
    this.detachWheelTargets();
    if (this.mountEl) {
      this.mountEl.addEventListener("wheel", this._onWheel, { passive: false });
      this._wheelMounts = [this.mountEl];
    }
    const canvas = this.embed._scene?.canvas;
    if (canvas) {
      canvas.addEventListener("wheel", this._onWheel, { passive: false });
      this._wheelMounts = [...(this._wheelMounts || []), canvas];
    }
  }

  detachWheelTargets() {
    for (const el of this._wheelMounts || []) {
      el.removeEventListener("wheel", this._onWheel);
    }
    this._wheelMounts = [];
  }

  /**
   * @param {WheelEvent} e
   */
  _onWheel(e) {
    if (!this._isWordWeaverActive() || !this.scrollEl) return;
    if (this._isTypingTarget(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    this.scrollEl.scrollTop += e.deltaY;
    if (e.deltaX) this.scrollEl.scrollLeft += e.deltaX;
  }

  /**
   * @param {KeyboardEvent} e
   */
  _onKeyDown(e) {
    if (!this._isWordWeaverActive()) return;
    if (this._isTypingTarget(e.target)) return;

    // Drill-down nav: Escape steps up a level (day→month→year); ↑/↓ scan notes in day view.
    const dayScene = this.embed?._scene;
    if (dayScene?._navLevel && dayScene._navLevel !== "year") {
      if (e.code === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        dayScene.navBack();
        return;
      }
      if (dayScene._navLevel === "day") {
        if (e.code === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          dayScene.dayViewStep(1);
          return;
        }
        if (e.code === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          dayScene.dayViewStep(-1);
          return;
        }
      }
    }

    const code = e.code;

    if (code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 220 : 90;
      if (code === "ArrowUp") this.scrollBy(-step);
      if (code === "ArrowDown") this.scrollBy(step);
      if (code === "ArrowLeft") this.scrollEl.scrollLeft -= step;
      if (code === "ArrowRight") this.scrollEl.scrollLeft += step;
      return;
    }

    if (this._isFlightKey(code)) {
      if (e.repeat) return;
      this._keysHeld.add(code);
      e.preventDefault();
      this._pushFlightToScene();
    }
  }

  /**
   * @param {KeyboardEvent} e
   */
  _onKeyUp(e) {
    if (!this._keysHeld.has(e.code)) return;
    this._keysHeld.delete(e.code);
    this._pushFlightToScene();
  }

  _pushFlightToScene() {
    const scene = this.embed._scene;
    if (!scene?.setFlightInput) return;
    const k = this._keysHeld;
    let forward = (k.has("KeyW") ? 1 : 0) + (k.has("KeyS") ? -1 : 0);
    let strafe = (k.has("KeyD") ? 1 : 0) + (k.has("KeyA") ? -1 : 0);
    let lift =
      (k.has("Space") ? 1 : 0) +
      (k.has("ShiftLeft") || k.has("ShiftRight") ? -1 : 0) +
      (k.has("KeyQ") ? 1 : 0) +
      (k.has("KeyE") ? -1 : 0);

    if (this._mobileControls?.enabled) {
      const m = this._mobileControls.getInput();
      forward += m.forward;
      strafe += m.strafe;
      lift += m.lift;
    }

    const clamp = (v) => Math.max(-1, Math.min(1, v));
    scene.setFlightInput(clamp(forward), clamp(strafe), clamp(lift));
  }

  /**
   * @param {number} deltaY
   */
  scrollBy(deltaY) {
    if (!this.scrollEl) return;
    this.scrollEl.scrollTop += deltaY;
  }

  scrollToBottom() {
    if (!this.scrollEl) return;
    this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
  }

  async toggleFullscreen() {
    const root = this.embed.el;
    if (!root) return;
    try {
      if (document.fullscreenElement === root) {
        await document.exitFullscreen();
      } else {
        await root.requestFullscreen();
      }
    } catch {
      root.classList.toggle("wordweaver-embed--native-fs");
      this._syncFullscreenButton();
    }
  }

  _onFullscreenChange() {
    this._syncFullscreenButton();
    this.embed._scheduleSceneResize?.();
  }

  _syncFullscreenButton() {
    const root = this.embed.el;
    const on =
      document.fullscreenElement === root || root?.classList.contains("wordweaver-embed--native-fs");
    if (this.fullscreenBtn) {
      this.fullscreenBtn.setAttribute("aria-pressed", String(on));
      this.fullscreenBtn.title = on ? "Exit full screen" : "Full screen";
      this.fullscreenBtn.textContent = on ? "⤢" : "⤢";
      this.fullscreenBtn.classList.toggle("is-active", on);
    }
    document.body.classList.toggle("wordweaver-embed-fullscreen", on);
  }

  _isWordWeaverActive() {
    return (
      document.body.classList.contains("inkling-tab-wordweaver") ||
      document.body.classList.contains("wordweaver-immersive") ||
      document.body.classList.contains("wordweaver-embed-open")
    );
  }

  /**
   * @param {EventTarget | null} target
   */
  _isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return target.isContentEditable;
  }

  /**
   * @param {string} code
   */
  _isFlightKey(code) {
    return (
      code === "KeyW" ||
      code === "KeyA" ||
      code === "KeyS" ||
      code === "KeyD" ||
      code === "KeyQ" ||
      code === "KeyE" ||
      code === "Space" ||
      code === "ShiftLeft" ||
      code === "ShiftRight"
    );
  }

  dispose() {
    this.setActive(false);
    this._mobileControls?.dispose();
    document.removeEventListener("fullscreenchange", this._onFullscreenChange);
  }
}
