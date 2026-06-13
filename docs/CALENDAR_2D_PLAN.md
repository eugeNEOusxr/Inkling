# 2D Calendar — the real editing tool (Google-Calendar-class)

The 2D calendar becomes the **primary working/editing surface** — vertical
time-of-day grid, white base, color-coded, time blocks, full event details. The
3D calendar stays as the **visual layer** ("looks") on top; 2D is where you
actually plan and edit. This **replaces the Writer/Schedule** tab.

## Foundation (already exists — build on it)
`src/wordweaver/timelineModel.js` events already have what a calendar needs:
- `startTime` / `endTime` (ISO datetimes → **time blocks**, 15/30-min capable)
- `category` (→ color, via existing CategoryColors)
- `title` + `body` (→ event name + description)
- `alerts[]` (→ reminders)
CRUD is there: `createEvent`, `updateEvent`, `deleteEvent`, `getEventsForDate`.
**New fields to add:** `location` (text, optional GPS lat/lng) and `conferenceUrl`.

## The Day view (the MVP — what you described in most detail)
- **White base**, app-standard light theme; everything **color-coded by category**.
- **Vertical time axis**, midnight → 23:59 top-to-bottom.
- **Slot granularity (zoom):** 60 / 30 / 15 min rows — a zoom control swaps row
  height so you can drop notes at exact times.
- **Event blocks**: positioned by start→end, filled with the category color,
  showing title + time; tap to open/edit.
- **Now-line**: a thin line at the current time.
- **Tap an empty slot → create**: opens the event editor pre-filled to that time.

## Event editor (sheet/modal)
Title · Description · **Location** (text + optional "use GPS") · **Conference
link** · Start/End (snap to 15/30) · Category (color) · Reminder/alert. Save →
`createEvent`/`updateEvent`; Delete → `deleteEvent`.

## Later views
- **Week view**: 7 day-columns × vertical time grid.
- **Month grid**: classic month, click a day → Day view; quick-add.

## Build order (small → big, each visible)
1. **Day view, read-only**: vertical grid (white, color-coded) rendering the
   day's events as blocks. (see it)
2. **Create / edit / delete** via tap-slot → event editor (title, desc, time,
   category).
3. **Zoom** 60/30/15-min granularity + now-line.
4. **Location + conference link** fields (text; GPS optional).
5. **Replace the Writer/Schedule tab** with this 2D editor.
6. **Week view.**
7. **Month grid** editing + quick-add.
8. **Drag to move / resize** event blocks (polish).

## Open decisions
1. **First slice** — Day view editor first (recommended), or Month grid first?
2. **Default block size** — 30-min or 15-min (zoom switches anyway)?
3. **Replace Schedule entirely** vs keep it available during the transition.
4. **Location** — text address now; GPS pin (geolocation) as a follow-up.

## Not in 2D (stays 3D)
3D calendar = the "looks" layer: styled 3D text appearing inside the 3D view
(the 10-style dropdown, weekday sphere labels, etc.). Functional editing lives
in 2D.
