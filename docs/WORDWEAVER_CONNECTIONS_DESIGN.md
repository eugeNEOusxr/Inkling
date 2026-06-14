# WordWeaver — the Connections Layer (design)

WordWeaver is the **third pillar**, distinct from the other two:
- **Calendar** = *plan* (when things are)
- **Schedule / Alerts** = *do / remind* (act on them)
- **WordWeaver** = *understand* (the connections between everything you logged)

Its whole job: take the notes you jot every day and surface the **links you'd miss**
— who you keep seeing, what you keep skipping, when you're at your best, which
goals you're actually feeding. Inkling narrates those links.

> Hard truth baked into the design: connections only appear with **volume of notes**.
> A near-empty calendar = an empty graph. So we (a) generate demo data to prove the
> shape, and (b) keep nudging the user to log.

---

## 1. What becomes a NODE (the circles)

| Node | What it is | Example |
|---|---|---|
| **Day** | one date; hover → vertical breakdown of that day's notes in colored brackets | "Thu Jun 12" |
| **Category** | a life area (the hubs) | Health, Work, Friends, Family, Finance, Study, Creative, Errands, Travel, Self-care |
| **Person** | a named person; stores every note that mentions them | "Tom" → all lunches/calls/hangouts |
| **Goal** | a goal; collects the notes that advance it | "Run 3×/week" |
| **Place** *(later)* | a recurring location | Gym, Office, Mom's |
| **Activity** *(later)* | a recurring verb/keyword | running, reading, budgeting |

The user's instinct (a circle with date+day, notes on a vertical path shown on
hover) = the **Day node**. People-as-circles = the **Person node**. Both are core.

---

## 2. What becomes an EDGE (the colored bracket lines)

Connections are just typed edges between nodes:

- **Note → Category** — every note classified (the base layer).
- **Note → Person** — note mentions someone ("lunch with Tom").
- **Note → Goal** — note advances a goal ("ran 5k" → "Run 3×/week").
- **Note → Time-of-day** — morning / afternoon / evening bucket.
- **Person → Category** — Tom skews *Friends*; David skews *Work*.
- **Person ↔ Person** — people who show up together = your circles/groups.
- **Category ↔ Time-of-day** — "you work out in the mornings."
- **Day ↔ Day** — recurrence: the same thing repeated across days (habit spine).
- **Category ↔ Category** — co-occurrence/correlation: "late-work days → skipped gym."
- **Goal ↔ adherence** — goal vs the notes that did / didn't feed it.

Color = the category of the thing being connected; the **bracket style** (red
spine + ticks) is the visual grammar for "these belong together."

---

## 3. What CONTEXT the connections produce (the comparative models)

This answers "but in what context?" — edges are raw; these are the *insights*:

| Model | Question it answers | Needs |
|---|---|---|
| **Frequency** | how often per week/month? | repeated category notes |
| **Recency** | when did I last see X / do Y? | dated person/activity notes |
| **Streaks** | how many days in a row? | daily habit logs |
| **Balance** | work vs personal vs social ratio | notes across categories |
| **Neglect** | who/what am I dropping? | gaps in person/goal notes |
| **Correlation** | does X go with Y? | two categories logged over time |
| **Goal progress** | am I feeding my goals? | notes linked to goals |
| **Trend** | is a category growing/shrinking? | weeks of history |

Per pillar, "what connection are we making":
- **Health** → workout frequency, sleep-window consistency, meal regularity, and
  correlation (bad sleep ↔ skipped workout).
- **Friends** → person nodes + recency ("haven't seen Tom in 3 weeks → follow up").
- **Work** → meeting load, busiest hours, deadlines, who you meet with.
- **Goals** → which daily notes actually advanced which goal.

---

## 4. Structure: 2D first, then 3D (the user's plan)

**2D (configure here first):**
A canvas with **anchored hubs** (NOT a free force-directed graph — we keep spatial
constancy so "where's Work?" never changes). Category hubs sit at fixed points
(e.g. around a ring); notes attach to their hub by a colored bracket. A **view
switch**: *by Category | by Person | by Goal | by Day*. Hover a Day circle → its
notes unfurl on a vertical path (colored brackets), only while hovered. A
**zoom/cluster** control rolls day → week → month, aggregating the brackets.

**3D (the payoff layer):**
The same graph lifted into depth on a timeline path; hub circles float, bracket
lines run in 3D, day circles sit along the path; hover reveals the vertical
breakdown; zooming out clusters weeks→months (same LOD idea as the 3D calendar).
The current `WordWeaverConnections.js` (category boxes + red brackets + filters +
Inkling HUD) is **slice 1 of this** — a single day. Next slices add the cross-day
graph, person nodes, and goal trails.

---

## 5. Seed notes — the "make up a shitload of notes" list

To exercise EVERY connection, a demo dataset needs: recurring **people**, recurring
**habits** (frequency/streaks), **goals** to feed, and **co-occurring** categories.
The generator (`src/calendar/demo/connectionsDemo.js`) produces ~6 weeks of:

- **Health (frequency + streak + correlation):** gym Mon/Wed/Fri 7:00; run Sat;
  "sleep 11pm" / "wake 6:30" daily logs; occasional "slept badly" before a skipped gym.
- **Work (load + people + deadlines):** standup 9:00 weekdays (with **David**);
  "client call with **Priya**"; "Q3 deadline" spikes.
- **Friends/Social (person nodes + recency):** "lunch with **Tom**" weekly; "dinner
  with **Sarah**" biweekly; "call **Mom**" Sundays; one friend who appears early then
  stops (neglect signal).
- **Finance:** "pay rent" 1st; "review budget" weekly.
- **Errands / Self-care / Creative:** groceries, haircut, "sketch", "read 30 min".
- **Goals (to link):** "Run 3×/week", "See friends weekly", "Read 12 books", "Save $5k".

That mix yields: person clusters (Tom/Sarah/Mom/David/Priya), habit streaks,
frequency counts, recency gaps, goal trails, and a sleep↔workout correlation.

---

## 6. Build phases

1. ✅ **3D day connections** (slice 1–2): category boxes, red brackets, filters,
   Day/Week scope, Inkling HUD. (shipped)
2. **Demo generator + loader** so the graph has data. (this turn)
3. **2D connections graph**: anchored category/person hubs + bracket edges +
   hover-to-unfurl Day nodes + by-Category/Person/Goal switch. (next)
4. **Person nodes** everywhere (a person → all their notes; recency + follow-up).
5. **Goal trails** (goal node → the notes feeding it; adherence %).
6. **Cross-day graph in 3D** + week/month clustering (the full node experience).
7. **Inkling narration** woven through (already started: patternBrain HUD).
