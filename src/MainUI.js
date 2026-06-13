/**
 * WordWeaver overlay chrome — Week / Month view links + first-load boot.
 */
import { openPanel } from "./calendar/ui/AppLauncher.js";
import { bootWordWeaverFirst } from "./App.js";
import "./calendar/views/WeekView.js";
import "./calendar/views/MonthView.js";

/**
 * Week View / Month View buttons on the WordWeaver bar.
 */
export function mountWordWeaverMainUI() {
  const bar = document.querySelector(".wordweaver-embed__bar");
  if (!bar || bar.querySelector(".ww-view-links")) return;

  const nav = document.createElement("div");
  nav.className = "ww-view-links";
  nav.setAttribute("role", "group");
  nav.setAttribute("aria-label", "Calendar views");

  const weekBtn = document.createElement("button");
  weekBtn.type = "button";
  weekBtn.className = "ww-view-links__btn";
  weekBtn.textContent = "Week View";
  weekBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openPanel("weekView");
  });

  const monthBtn = document.createElement("button");
  monthBtn.type = "button";
  monthBtn.className = "ww-view-links__btn";
  monthBtn.textContent = "Month View";
  monthBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openPanel("monthView");
  });

  nav.append(weekBtn, monthBtn);

  const layoutLabel = bar.querySelector(".wordweaver-embed__layout-label");
  if (layoutLabel?.parentElement === bar) {
    bar.insertBefore(nav, layoutLabel);
  } else {
    bar.appendChild(nav);
  }

  // ⋯ overflow toggle — phone-only (shown via CSS). Reveals the controls that are
  // hidden on mobile (Week/Month view, style picker, Customize) so the trimmed bar
  // keeps just Today + Morning/Afternoon/Night while the 3D fills the screen.
  if (!bar.querySelector(".ww-options-toggle")) {
    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "ww-options-toggle";
    moreBtn.setAttribute("aria-label", "More controls");
    moreBtn.setAttribute("aria-expanded", "false");
    moreBtn.textContent = "⋯";
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = bar.classList.toggle("ww-options-open");
      moreBtn.setAttribute("aria-expanded", String(open));
    });
    bar.appendChild(moreBtn);
  }

  if (!document.getElementById("ww-view-links-style")) {
    const style = document.createElement("style");
    style.id = "ww-view-links-style";
    style.textContent = `
      .ww-view-links { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .ww-view-links__btn {
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 8px;
        border: 1px solid rgba(78, 230, 230, 0.35);
        background: rgba(8, 14, 28, 0.85);
        color: #e2e8f0;
        cursor: pointer;
      }
      .ww-view-links__btn:hover { background: rgba(30, 50, 80, 0.9); }
    `;
    document.head.appendChild(style);
  }

  bootWordWeaverFirst();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountWordWeaverMainUI(), { once: true });
  } else {
    mountWordWeaverMainUI();
  }
}
