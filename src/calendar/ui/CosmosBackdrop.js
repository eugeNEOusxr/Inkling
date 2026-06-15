/**
 * Idle "cosmos" surface — JWST backdrop image with scrims; procedural starfield fallback.
 */

/** Default idle backdrop (served from public/) */
export const DEFAULT_COSMOS_BACKDROP_URL = "/assets/backgrounds/cosmos-backdrop.jpg";

/** Image credit (Pismis 24, JWST) */
export const COSMOS_BACKDROP_CREDIT =
  "NASA, ESA, CSA, STScI — JWST image, star cluster Pismis 24";

/** @type {CosmosBackdrop | null} */
let singleton = null;

function injectStyles() {
  if (document.getElementById("cosmos-backdrop-styles")) return;
  const tag = document.createElement("style");
  tag.id = "cosmos-backdrop-styles";
  tag.textContent = `
    .cosmos-backdrop {
      position: fixed;
      inset: 0;
      z-index: 5;
      overflow: hidden;
      background: #020308;
      pointer-events: none;
    }
    .cosmos-backdrop.hidden {
      display: none !important;
      visibility: hidden !important;
    }
    .cosmos-backdrop__photo {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      /* Portrait image; bias the crop toward the BOTTOM so the nebula cliffs
         (the best part) stay on screen in landscape instead of being cropped. */
      object-position: center bottom;
      display: none;
      /* Rest zoom gives the gyroscope/pointer parallax room to pan without
         exposing the image edges. JS overrides this with translate + scale. */
      transform: scale(1.18);
      transform-origin: center center;
      transition: none;
      will-change: transform;
    }
    .cosmos-backdrop--image-loaded .cosmos-backdrop__photo {
      display: block;
    }
    .cosmos-backdrop__scrim {
      position: absolute;
      left: 0;
      right: 0;
      pointer-events: none;
      z-index: 2;
    }
    .cosmos-backdrop__scrim--top {
      top: 0;
      height: min(32vh, 220px);
      background: linear-gradient(
        to bottom,
        rgba(2, 4, 12, 0.78) 0%,
        rgba(2, 4, 12, 0.35) 45%,
        transparent 100%
      );
    }
    .cosmos-backdrop__scrim--bottom {
      bottom: 0;
      height: min(48vh, 320px);
      background: linear-gradient(
        to top,
        rgba(2, 4, 10, 0.92) 0%,
        rgba(2, 4, 10, 0.55) 40%,
        rgba(2, 4, 10, 0.12) 70%,
        transparent 100%
      );
    }
    .cosmos-backdrop__canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      z-index: 1;
    }
    .cosmos-backdrop--image-loaded .cosmos-backdrop__canvas {
      opacity: 0;
      visibility: hidden;
    }
    .cosmos-backdrop__credit {
      position: absolute;
      left: 12px;
      bottom: calc(var(--inkling-bottom-nav-h, 62px) + 8px + env(safe-area-inset-bottom, 0px));
      z-index: 3;
      margin: 0;
      max-width: min(300px, 72vw);
      font-size: 10px;
      line-height: 1.35;
      letter-spacing: 0.02em;
      color: rgba(226, 232, 240, 0.5);
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
    }
    .cosmos-backdrop:not(.cosmos-backdrop--image-loaded) .cosmos-backdrop__credit {
      display: none;
    }
    body.inkling-surface-idle .cosmos-backdrop:not(.hidden) {
      display: block;
      visibility: visible;
    }
  `;
  document.head.appendChild(tag);
}

/**
 * Idle cosmos surface: cover-fit JWST image + legibility scrims; canvas starfield on load failure.
 */
export class CosmosBackdrop {
  constructor() {
    this.el = null;
    this.photoEl = null;
    this.canvas = null;
    /** @type {CanvasRenderingContext2D | null} */
    this.ctx = null;
    /** @type {number[]} */
    this.stars = [];
    this._raf = 0;
    this._running = false;
    /** @type {string | null} */
    this._imageUrl = DEFAULT_COSMOS_BACKDROP_URL;
    this._imageLoaded = false;
  }

  /**
   * @param {HTMLElement} [parent]
   */
  mount(parent = document.getElementById("app")) {
    if (this.el) return;
    injectStyles();
    const root = document.createElement("div");
    root.id = "cosmos-backdrop";
    root.className = "cosmos-backdrop hidden";
    root.setAttribute("aria-hidden", "true");

    const photo = document.createElement("img");
    photo.className = "cosmos-backdrop__photo";
    photo.alt = "";
    photo.decoding = "async";
    photo.setAttribute("aria-hidden", "true");

    const scrimTop = document.createElement("div");
    scrimTop.className = "cosmos-backdrop__scrim cosmos-backdrop__scrim--top";
    scrimTop.setAttribute("aria-hidden", "true");

    const scrimBottom = document.createElement("div");
    scrimBottom.className = "cosmos-backdrop__scrim cosmos-backdrop__scrim--bottom";
    scrimBottom.setAttribute("aria-hidden", "true");

    const canvas = document.createElement("canvas");
    canvas.className = "cosmos-backdrop__canvas";
    canvas.setAttribute("aria-hidden", "true");

    const credit = document.createElement("p");
    credit.className = "cosmos-backdrop__credit";
    credit.textContent = "NASA, ESA, CSA, STScI";

    root.append(photo, scrimTop, scrimBottom, canvas, credit);
    parent?.appendChild(root);

    this.el = root;
    this.photoEl = photo;
    this.canvas = canvas;
    this._seedStars(220);
    this._resize();
    window.addEventListener("resize", () => this._resize(), { passive: true });

    photo.addEventListener("load", () => this._onImageReady());
    photo.addEventListener("error", () => this._onImageFailed());

    this._applyImageUrl(this._imageUrl);
  }

  /**
   * @param {string | null} url
   */
  _applyImageUrl(url) {
    if (!this.photoEl || !this.el) return;
    this._imageLoaded = false;
    this.el.classList.remove("cosmos-backdrop--image-loaded");
    if (!url) {
      this.photoEl.removeAttribute("src");
      this._onImageFailed();
      return;
    }
    this._imageUrl = url;
    this.photoEl.src = url;
    if (this.photoEl.complete && this.photoEl.naturalWidth > 0) {
      this._onImageReady();
    }
  }

  _onImageReady() {
    this._imageLoaded = true;
    this.el?.classList.add("cosmos-backdrop--image-loaded");
    this._stop();
    this._initParallax();
  }

  /**
   * Subtle "viewport into the cosmos" parallax: the slightly-zoomed backdrop
   * pans a little as the phone tilts (gyroscope) or the pointer moves (desktop),
   * so it reads as a window onto the scene rather than a flat image. Not real 3D.
   */
  _initParallax() {
    if (this._parallaxInit || !this.photoEl) return;
    // Honour reduced-motion: keep the rest zoom, skip the motion.
    try {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    } catch { /* ignore */ }
    this._parallaxInit = true;

    this._baseScale = 1.18;
    this._tilt = { x: 0, y: 0 };       // target, normalised -1..1
    this._tiltCur = { x: 0, y: 0 };    // smoothed current
    this._parallaxRaf = 0;
    this._applyParallax();

    // Desktop / no-gyro: pointer position drives the pan.
    window.addEventListener(
      "pointermove",
      (e) => {
        if (!this.isVisible()) return;
        const w = window.innerWidth || 1;
        const h = window.innerHeight || 1;
        this._tilt.x = (e.clientX / w) * 2 - 1;
        this._tilt.y = (e.clientY / h) * 2 - 1;
        this._runParallax();
      },
      { passive: true }
    );

    // Phone gyroscope.
    const onOrient = (e) => {
      if (e.gamma == null && e.beta == null) return;
      const landscape = Math.abs(window.orientation || 0) === 90;
      // gamma: left-right tilt [-90..90]; beta: front-back [-180..180], with
      // ~45° treated as the neutral "holding the phone" angle.
      const g = Math.max(-40, Math.min(40, e.gamma || 0)) / 40;
      let b = Math.max(-40, Math.min(40, (e.beta || 0) - 45)) / 40;
      this._tilt.x = landscape ? b : g;
      this._tilt.y = landscape ? g : b;
      this._runParallax();
    };

    const attachGyro = async () => {
      try {
        const DOE = window.DeviceOrientationEvent;
        if (DOE && typeof DOE.requestPermission === "function") {
          const res = await DOE.requestPermission();
          if (res !== "granted") return;
        }
        window.addEventListener("deviceorientation", onOrient, { passive: true });
      } catch { /* ignore */ }
    };

    // iOS 13+ requires a user gesture to grant orientation access; wait for the
    // first tap. Android/others can attach immediately.
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      const once = () => {
        window.removeEventListener("pointerdown", once);
        attachGyro();
      };
      window.addEventListener("pointerdown", once, { once: true });
    } else if (DOE) {
      attachGyro();
    }
  }

  _runParallax() {
    if (this._parallaxRaf || !this.isVisible()) return;
    const tick = () => {
      this._tiltCur.x += (this._tilt.x - this._tiltCur.x) * 0.08;
      this._tiltCur.y += (this._tilt.y - this._tiltCur.y) * 0.08;
      this._applyParallax();
      const settled =
        Math.abs(this._tilt.x - this._tiltCur.x) < 0.001 &&
        Math.abs(this._tilt.y - this._tiltCur.y) < 0.001;
      this._parallaxRaf = settled ? 0 : requestAnimationFrame(tick);
    };
    this._parallaxRaf = requestAnimationFrame(tick);
  }

  _applyParallax() {
    if (!this.photoEl) return;
    const S = this._baseScale || 1.18;
    // Never pan past the zoom overflow, so edges stay covered (0.85 safety).
    const maxX = ((S - 1) / 2) * 0.85 * (window.innerWidth || 0);
    const maxY = ((S - 1) / 2) * 0.85 * (window.innerHeight || 0);
    const tx = -(this._tiltCur?.x || 0) * maxX;
    const ty = -(this._tiltCur?.y || 0) * maxY;
    this.photoEl.style.transform =
      `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${S})`;
  }

  _onImageFailed() {
    this._imageLoaded = false;
    this.el?.classList.remove("cosmos-backdrop--image-loaded");
    if (this.isVisible()) this._start();
  }

  _seedStars(count) {
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push(Math.random(), Math.random(), Math.random() * 1.4 + 0.2, Math.random() * 0.03);
    }
  }

  _resize() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx = this.canvas.getContext("2d");
    if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  show() {
    this.el?.classList.remove("hidden");
    this.el?.setAttribute("aria-hidden", "false");
    if (!this._imageLoaded) this._start();
  }

  hide() {
    this.el?.classList.add("hidden");
    this.el?.setAttribute("aria-hidden", "true");
    this._stop();
  }

  isVisible() {
    return Boolean(this.el && !this.el.classList.contains("hidden"));
  }

  /**
   * Swap backdrop image (e.g. user upload). Pass null to use procedural fallback only.
   * @param {string | null} url
   */
  setBackgroundImage(url) {
    const next = url ?? DEFAULT_COSMOS_BACKDROP_URL;
    if (this.el) this._applyImageUrl(next);
    else this._imageUrl = next;
  }

  _start() {
    if (this._running || this._imageLoaded) return;
    this._running = true;
    const loop = (t) => {
      if (!this._running) return;
      this._paint(t);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  /**
   * @param {number} t
   */
  _paint(t) {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0a0e1a");
    grad.addColorStop(0.5, "#060810");
    grad.addColorStop(1, "#020308");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const drift = t * 0.00002;
    for (let i = 0; i < this.stars.length; i += 4) {
      let x = this.stars[i];
      let y = this.stars[i + 1];
      const br = this.stars[i + 2];
      const tw = this.stars[i + 3];
      y = (y + drift * (0.3 + (i % 7) * 0.05)) % 1;
      const px = x * w;
      const py = y * h;
      const alpha = br * (0.65 + 0.35 * Math.sin(t * tw + i));
      ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, br * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * @returns {CosmosBackdrop}
 */
export function getCosmosBackdrop() {
  if (!singleton) singleton = new CosmosBackdrop();
  return singleton;
}

/**
 * @param {string | null} url
 */
export function setCosmosBackdropImage(url) {
  getCosmosBackdrop().setBackgroundImage(url);
}
