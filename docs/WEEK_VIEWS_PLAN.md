# Calendar view switcher + Week views — build plan

Agreed design (June 2026). Build in stages, deploy each.

## View switching (2D + 3D)
- Replace the inline view buttons with a compact **dropdown** to free header space.
- Dropdown items, in order: **Today · Day · Week · Month · Year**.
  - `Today` → jump to today's Day view.
  - `Day` → Day view.
  - `Week` → Week view (see below). **Week is reachable ONLY from this dropdown.**
  - `Month` → Month view.
  - `Year` → Year view (3D = the year overview; 2D Year = TBD, see open items).
- The dropdown shows the current view as its label; selecting an item activates it.
- **Day-cell taps always drill straight to Day view** (2D month + 3D month) — unchanged.

## Backdrop / pictures
- Backdrop derives from the **month** (year view), so Day + Week + Month all share
  it and never disagree (e.g. June → tropical June). Per-month user-uploadable
  image = optional future override (one upload skins that month everywhere).

## Week view — shows the WHOLE MONTH organized by week
Both layouts: Week 1 starts on the day the month begins; 4 week-rows, or 5 when
the month needs it; each day shows its notes; week runs Mon→Sun.

- **2D Week** = vertical. Week sections stacked top-to-bottom (Week 1 with its
  Mon→Sun days + notes beneath, then Week 2 …). Scroll down through the month.
- **3D Week** = horizontal. 4–5 week **rows**; each row = "Month · Week N" label +
  animated box, then Mon→Sun laid out **horizontally** with each day's notes
  stacked **vertically beneath** it. Pan across days, down through weeks.

## Stages
1. **Dropdown switcher** (2D + 3D) wired to existing views (Today/Day/Month/Year).
   Frees header room. Week omitted from the menu until its view exists.
2. **2D Week view** (vertical month-as-weeks) + add Week to the 2D dropdown.
3. **3D Week view** (horizontal week-rows) + add Week to the 3D dropdown.

## Open items
- 2D Year view doesn't exist yet. Options: route 2D "Year" to the 3D year
  overview, or build a 2D 12-month grid. Defaulting to routing to 3D year unless
  told otherwise.
