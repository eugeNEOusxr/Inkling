# Inkling — the one clean flow (square one)

The whole app as a single journey, in order. We build it one step at a time, not all at once.

## The user journey
0. **Login** — works on the local server (Pages has no backend). Login bug = the no-backend
   bounce, now shows a clear message. ✅ mostly done.
1. **First run → Inkling tutorial.** The first thing a new user sees is Inkling, guiding them
   through a short tutorial of the app. ⬜ to build.
2. **Calendar tab → 3D year.** The 12-month 3D system displays. ✅ exists.
3. **Tap a month (e.g. June) → month view.**
   - The month's **background image sits behind it**. ⬜ (year grid has backgrounds; the
     single-month drill-down view still needs it.)
   - The day **spheres grow larger when tapped**, then transition to the day view. ⬜ tune.
4. **Day view — notes fit the screen** so the user never has to back up.
   - Push days **further out on the z-axis** so everything frames on screen. ⬜
   - **Bigger note text (≈2×)** with **more spacing** between notes. ⬜
5. **Notes render as 3D text** — standard **beveled-edge 3D text** that pops out (not flat 2D).
   This is the "WordWeaver" 3D-text idea. ⬜ the big one.
6. **The Paint icon = the text-styling hub.** Placed top-right, next to where you insert text
   into 3D space for the current time. Tapping it opens, in this order:
   - a **color wheel** → set the note text color (per month, or all months);
   - below it, an **assortment of 3D text-style variations** (beveled, etc.);
   - **font, size, and animation** pickers.
   - **Real-time preview**: the 3D text updates live as you choose, so you see it before committing.
7. **Per-day manual text entry in 3D** for the current time, styled via the Paint hub.

## What "WordWeaver" becomes
The cool 3D **text layout + styling space** — beveled 3D note text you style live with the Paint
hub. (Separate from the notes-constellation helix idea, or it can absorb it later.)

## Build order (small → big, each visible before the next)
1. Confirm login end-to-end on the local server (+ tutorial stub entry point).
2. **Month-view background image** behind the single-month drill-down. (small, visible)
3. **Day view framing**: push z back + fit notes on screen, no backing up.
4. **Bigger note text + more spacing** (2×).
5. **3D beveled note text** (the WordWeaver text style) — real-time render.
6. **Paint hub**: color wheel → text color (per month/all).
7. Paint hub: 3D text-style variations + font/size/animation pickers, live preview.
8. **Inkling onboarding tutorial.**

Rule: one step, see it, then the next. No big-bang rewrites.
