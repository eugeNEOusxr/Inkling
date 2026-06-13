/**
 * Vertical scroll-snap time picker — 30-min steps, 5 visible rows, center selection.
 */
export class VerticalTimeWheel {
  /**
   * @param {HTMLElement} root
   * @param {{ onChange?: (hour24: number, timeLabel: string) => void }} [opts]
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.onChange = opts.onChange ?? (() => {});
    this.hour24 = 12;
    this._slots = [];
    this._scrollRaf = 0;
    this._suppress = false;
    this._currentTime = null;

    this.root.innerHTML = "";
    // Add, don't overwrite: the mount carries `notebook-writer-wheel-mount hidden`
    // and clobbering className strips `hidden`, leaving the wheel stacked on top of
    // the clock and collapsing the timeline below it.
    this.root.classList.add("vertical-time-wheel");

    const viewport = document.createElement("div");
    viewport.className = "vertical-time-wheel__viewport";
    viewport.setAttribute("role", "listbox");
    viewport.setAttribute("aria-label", "Select time");

    const padTop = document.createElement("div");
    padTop.className = "vertical-time-wheel__pad";
    padTop.setAttribute("aria-hidden", "true");
    const padBottom = padTop.cloneNode(false);

    this.list = document.createElement("div");
    this.list.className = "vertical-time-wheel__list";

    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "vertical-time-wheel__slot";
        btn.dataset.hour = String(h);
        btn.dataset.time = time;
        btn.setAttribute("role", "option");
        btn.textContent = this._formatLabel(h, m);
        btn.addEventListener("click", () => {
          // Pick this exact slot (incl :30) → notify so the timeline navigates
          // and focuses the note field, just like the clock.
          this.hour24 = h;
          this._currentTime = time;
          this._suppress = true;
          this._slots.forEach((s) => s.el.classList.toggle("is-centered", s.time === time));
          btn.scrollIntoView({ block: "center", behavior: "smooth" });
          window.setTimeout(() => {
            this._suppress = false;
          }, 350);
          this.onChange(h, time);
        });
        this.list.appendChild(btn);
        this._slots.push({ el: btn, hour: h, time });
      }
    }

    viewport.appendChild(padTop);
    viewport.appendChild(this.list);
    viewport.appendChild(padBottom);
    this.root.appendChild(viewport);
    viewport.setAttribute("title", "Scroll for all times through midnight");

    this._highlight = document.createElement("div");
    this._highlight.className = "vertical-time-wheel__highlight";
    this._highlight.setAttribute("aria-hidden", "true");
    this.root.appendChild(this._highlight);

    this.viewport = viewport;
    viewport.addEventListener(
      "scroll",
      () => {
        cancelAnimationFrame(this._scrollRaf);
        this._scrollRaf = requestAnimationFrame(() => this._syncFromScroll());
      },
      { passive: true }
    );
  }

  _formatLabel(h, m) {
    const h12 = h % 12 || 12;
    const ampm = h < 12 ? "AM" : "PM";
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  _syncFromScroll() {
    const vp = this.viewport;
    const centerY = vp.scrollTop + vp.clientHeight / 2;
    let best = this._slots[0];
    let bestDist = Infinity;
    for (const slot of this._slots) {
      const el = slot.el;
      const mid = el.offsetTop + el.offsetHeight / 2;
      const dist = Math.abs(mid - centerY);
      if (dist < bestDist) {
        bestDist = dist;
        best = slot;
      }
    }
    if (!best) return;
    this._slots.forEach((s) => {
      s.el.classList.toggle("is-centered", s === best);
    });
    if (this._suppress) return;
    // Track by exact time so scrolling within an hour (e.g. 14:00 → 14:30)
    // still navigates the timeline.
    if (this._currentTime !== best.time) {
      this._currentTime = best.time;
      this.hour24 = best.hour;
      this.onChange(best.hour, best.time);
    }
  }

  /**
   * @param {number} hour24
   */
  setHour(hour24) {
    this.hour24 = ((Math.round(hour24) % 24) + 24) % 24;
    this._currentTime = `${String(this.hour24).padStart(2, "0")}:00`;
    const target = this._slots.find((s) => s.hour === this.hour24);
    if (target) {
      // Programmatic sync (from selectHour) — suppress the scroll-driven
      // onChange so it doesn't loop back into selectHour.
      this._suppress = true;
      target.el.scrollIntoView({ block: "center", behavior: "auto" });
      this._slots.forEach((s) => {
        s.el.classList.toggle("is-centered", s.hour === this.hour24);
      });
      window.setTimeout(() => {
        this._suppress = false;
      }, 60);
    }
  }

  destroy() {
    cancelAnimationFrame(this._scrollRaf);
    this.root.innerHTML = "";
  }
}
