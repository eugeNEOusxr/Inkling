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
      /* Drifting nebula clouds + shooting stars over the cosmos */
      #cosmos-sky { position:absolute; inset:0; overflow:hidden; pointer-events:none; }
      #cosmos-sky .nebula {
        position:absolute; border-radius:50%; filter:blur(48px);
        mix-blend-mode:screen; opacity:.42; will-change:transform;
      }
      #cosmos-sky .nebula.n1 { width:46vw; height:46vw; left:-8vw; top:-6vh;
        background:radial-gradient(circle, rgba(167,139,250,.9), rgba(167,139,250,0) 68%);
        animation:nebula-a 26s ease-in-out infinite; }
      #cosmos-sky .nebula.n2 { width:52vw; height:52vw; right:-12vw; top:18vh;
        background:radial-gradient(circle, rgba(56,189,248,.8), rgba(56,189,248,0) 68%);
        animation:nebula-b 32s ease-in-out infinite; }
      #cosmos-sky .nebula.n3 { width:40vw; height:40vw; left:24vw; bottom:-14vh;
        background:radial-gradient(circle, rgba(240,171,252,.75), rgba(240,171,252,0) 68%);
        animation:nebula-c 38s ease-in-out infinite; }
      @keyframes nebula-a { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(5vw,4vh) scale(1.18)} }
      @keyframes nebula-b { 0%,100%{transform:translate(0,0) scale(1.05)} 50%{transform:translate(-6vw,-3vh) scale(0.9)} }
      @keyframes nebula-c { 0%,100%{transform:translate(0,0) scale(0.95)} 50%{transform:translate(3vw,-5vh) scale(1.2)} }
      /* A streak whose trail aligns with its travel: bright HEAD on the right
         (leading), tail fading to the left (behind). Rotated 45° + translated
         along its own axis so it shoots toward the bottom-right. */
      #cosmos-sky .shooting-star {
        position:absolute; width:150px; height:2px; border-radius:2px;
        background:linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.9) 100%);
        opacity:0; transform-origin:center;
        animation:cosmos-shoot 1.2s ease-in forwards;
      }
      #cosmos-sky .shooting-star::after {
        content:""; position:absolute; right:-2px; top:50%; width:4px; height:4px;
        border-radius:50%; background:#fff; box-shadow:0 0 9px 3px rgba(255,255,255,.9);
        transform:translate(50%,-50%);
      }
      @keyframes cosmos-shoot {
        0%{opacity:0; transform:rotate(45deg) translateX(-10px)}
        12%{opacity:1}
        100%{opacity:0; transform:rotate(45deg) translateX(460px)}
      }
    `;
    document.head.appendChild(s);
  }

  _build() {
    if (this._el) return;
    this._injectStyles();
    const el = document.createElement("div");
    el.id = "cosmos-intro";

    // Drifting nebula clouds behind the content.
    const sky = document.createElement("div");
    sky.id = "cosmos-sky";
    sky.innerHTML = `<div class="nebula n1"></div><div class="nebula n2"></div><div class="nebula n3"></div>`;
    el.appendChild(sky);
    this._sky = sky;

    const greet = document.createElement("div");
    greet.id = "cosmos-intro-greet";
    greet.innerHTML =
      `<div style="font:800 clamp(34px,8vw,64px) system-ui;letter-spacing:1px;` +
      `background:linear-gradient(90deg,#c7d2fe,#a5b4fc,#f0abfc);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">✦ Inkling</div>` +
      `<div style="margin-top:14px;font:600 16px system-ui;color:#aab6e8">Where would you like to start?</div>` +
      `<div id="cosmos-intro-tap" style="margin-top:30px;font:800 14px system-ui;letter-spacing:.4px;color:#7c3aed;text-shadow:0 1px 4px rgba(0,0,0,.9),0 0 12px rgba(139,92,246,.55);animation:cosmos-pulse 1.8s ease-in-out infinite">Tap anywhere to begin</div>`;
    el.appendChild(greet);

    const portals = document.createElement("div");
    portals.id = "cosmos-intro-portals";
    const PORTALS = [
      ["📅", "Calendar", "Your year in 3D", () => this.app?._handleBottomNavTab?.("wordweaver", { toggle: false })],
      ["🕐", "Schedule", "Plan your day", () => this.app?._handleBottomNavTab?.("writer", { toggle: false })],
      ["🔔", "Alerts", "Your reminders", () => this.app?._handleBottomNavTab?.("alerts", { toggle: false })],
      ["⏰", "Alarm Clock", "Alarm · timer · stopwatch", () => this.app?.openAlarmClock?.()],
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
    this._startShootingStars();
  }

  _startShootingStars() {
    if (this._starTimer) return;
    const spawn = () => {
      if (!this._sky || !this.isOpen()) return;
      const star = document.createElement("div");
      star.className = "shooting-star";
      // Upper-left bias so it has room to streak toward the bottom-right.
      star.style.top = `${Math.random() * 40}%`;
      star.style.left = `${2 + Math.random() * 46}%`;
      this._sky.appendChild(star);
      setTimeout(() => star.remove(), 1400);
    };
    // a star every 1.8–4s
    this._starTimer = setInterval(() => { if (Math.random() < 0.8) spawn(); }, 2000 + Math.random() * 1200);
    setTimeout(spawn, 600);
  }

  _stopShootingStars() {
    if (this._starTimer) { clearInterval(this._starTimer); this._starTimer = null; }
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
    this._stopShootingStars();
  }

  isOpen() {
    return !!this._el && this._el.style.display !== "none";
  }
}
