/**
 * Cosmos intro — the app lands on the JWST cosmos backdrop with a gentle greeting;
 * a tap reveals "entry portals" (Calendar / Schedule / Alerts / Chat) to choose
 * where to start. The Inkling orb stays visible above it the whole time.
 */
export class CosmosIntro {
  /** @param {import("../CalendarApp.js").CalendarApp} app */
  constructor(app) {
    this.app = app;
    this._el = null;
    this._stage = 0;
  }

  _injectStyles() {
    if (document.getElementById("cosmos-intro-styles")) return;
    const s = document.createElement("style");
    s.id = "cosmos-intro-styles";
    s.textContent = `
      #cosmos-intro {
        position: fixed; inset: 0; z-index: 11004; display: none;
        flex-direction: column; align-items: center; justify-content: center;
        text-align: center; color: #e6ebff; cursor: pointer;
        /* Self-contained cosmos image (so the intro never depends on the app's
           surface, which the calendar dock can navigate away on boot). */
        background-color: #020308;
        background-image:
          radial-gradient(ellipse at 50% 42%, rgba(2,3,8,0.12), rgba(2,3,8,0.62) 78%),
          url("/assets/backgrounds/cosmos-backdrop.jpg");
        background-size: cover, cover;
        background-position: center, center bottom;
        background-repeat: no-repeat, no-repeat;
        font-family: system-ui, sans-serif; padding: 24px;
        animation: cosmos-intro-fade .5s ease both;
      }
      @keyframes cosmos-intro-fade { from{opacity:0} to{opacity:1} }
      @keyframes cosmos-pulse { 0%,100%{opacity:.45} 50%{opacity:1} }
      @keyframes cosmos-portal-in { from{opacity:0;transform:translateY(16px) scale(.95)} to{opacity:1;transform:none} }
      #cosmos-intro-portals { display:none; gap:16px; flex-wrap:wrap; justify-content:center; max-width:700px; }
      #cosmos-intro-portals .cosmos-portal {
        width:154px; min-height:122px; border:1px solid rgba(129,140,248,.4); border-radius:16px;
        background:rgba(12,16,30,.5); backdrop-filter:blur(8px); color:#e6ebff; cursor:pointer;
        padding:16px 12px; display:flex; flex-direction:column; align-items:center; justify-content:center;
        box-shadow:0 8px 30px rgba(0,0,0,.45), 0 0 18px rgba(99,102,241,.22);
        transition:transform .16s ease, box-shadow .2s ease, border-color .2s ease;
        animation:cosmos-portal-in .42s ease both;
      }
      #cosmos-intro-portals .cosmos-portal:hover {
        transform:translateY(-4px) scale(1.04); border-color:#a5b4fc;
        box-shadow:0 14px 42px rgba(0,0,0,.6), 0 0 30px rgba(129,140,248,.5);
      }
    `;
    document.head.appendChild(s);
  }

  _build() {
    if (this._el) return;
    this._injectStyles();
    const el = document.createElement("div");
    el.id = "cosmos-intro";

    const greet = document.createElement("div");
    greet.id = "cosmos-intro-greet";
    greet.innerHTML =
      `<div style="font:800 clamp(34px,8vw,64px) system-ui;letter-spacing:1px;` +
      `background:linear-gradient(90deg,#c7d2fe,#a5b4fc,#f0abfc);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">✦ Inkling</div>` +
      `<div style="margin-top:14px;font:600 16px system-ui;color:#aab6e8">Where would you like to start?</div>` +
      `<div id="cosmos-intro-tap" style="margin-top:30px;font:700 13px system-ui;color:#818cf8;animation:cosmos-pulse 1.8s ease-in-out infinite">Tap anywhere to begin</div>`;
    el.appendChild(greet);

    const portals = document.createElement("div");
    portals.id = "cosmos-intro-portals";
    const PORTALS = [
      ["📅", "Calendar", "Your year in 3D", () => this.app?._handleBottomNavTab?.("wordweaver", { toggle: false })],
      ["🕐", "Schedule", "Plan your day", () => this.app?._handleBottomNavTab?.("writer", { toggle: false })],
      ["🔔", "Alerts", "Your reminders", () => this.app?._handleBottomNavTab?.("alerts", { toggle: false })],
      ["✦", "Chat with Inkling", "Ask me anything", () => this.app?.inklingPanel?.openWithContext?.()]
    ];
    for (const [icon, title, sub, fn] of PORTALS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cosmos-portal";
      b.innerHTML =
        `<div style="font-size:30px;line-height:1">${icon}</div>` +
        `<div style="font:800 15px system-ui;margin-top:8px">${title}</div>` +
        `<div style="font:600 11px system-ui;color:#aab6e8;margin-top:3px">${sub}</div>`;
      b.addEventListener("click", (e) => { e.stopPropagation(); this.hide(); try { fn(); } catch { /* ignore */ } });
      portals.appendChild(b);
    }
    el.appendChild(portals);

    // Tap the backdrop (stage 1) → reveal the portals (stage 2).
    el.addEventListener("click", () => { if (this._stage === 1) this._reveal(); });

    document.body.appendChild(el);
    this._el = el;
    this._greet = greet;
    this._portals = portals;
  }

  show() {
    this._build();
    this._stage = 1;
    const tap = document.getElementById("cosmos-intro-tap");
    if (tap) tap.style.display = "block";
    this._portals.style.display = "none";
    this._el.style.display = "flex";
    document.body.classList.add("cosmos-intro-active");
  }

  _reveal() {
    this._stage = 2;
    const tap = document.getElementById("cosmos-intro-tap");
    if (tap) tap.style.display = "none";
    this._portals.style.display = "flex";
    // restart the staggered entrance
    [...this._portals.children].forEach((c, i) => {
      c.style.animation = "none";
      void c.offsetWidth; // reflow
      c.style.animation = `cosmos-portal-in .42s ease both`;
      c.style.animationDelay = `${i * 0.07}s`;
    });
  }

  hide() {
    if (this._el) this._el.style.display = "none";
    document.body.classList.remove("cosmos-intro-active");
  }

  isOpen() {
    return !!this._el && this._el.style.display !== "none";
  }
}
