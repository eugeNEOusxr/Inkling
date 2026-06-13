# Inkling AI — A-to-Z Master TODO

Goal: make Inkling a genuinely good **casual conversation partner** that *also* runs the
calendar end-to-end. Today it's an intent-router with a thin LLM layer; guests get the
local router (weak NLU → "doesn't understand my words"). This is the plan to fix it
"from A to Z."

## Current state (as of 2026-06-12)
- Client: `src/calendar/ai/fetchInklingChat.js` → server `/api/inkling/chat` when signed in,
  else `runLocalInklingChat` (local). `AIBrain.js` + `inklingCommandLexicon`/`inklingPhraseLexicon` do keyword intent matching.
- Server: `server/lib/llm/createProvider.js` (OpenAI-compatible, `gpt-4o-mini` default, "mock" when no key);
  `server/lib/inkling/generateInklingChat.js` calls it, falls back to local on failure.
- Actions today: `openWriter`, `openCalendar`, `openWordWeaver`, `storeNote`, `createAlert`,
  `sideConversation`, `askClarification`, `none`.

---

## 1. Understanding (NLU) — the #1 complaint
- [ ] Stop relying on keyword lexicons as the primary parser. Route ALL turns through an LLM
      with a structured-output (JSON tool-call) contract; keep the local router only as an
      offline fallback.
- [ ] Define a single **intent/tool schema** (create/move/delete event, add note, set reminder/alarm,
      query schedule, find free time, navigate UI, smalltalk) the LLM fills — one source of truth
      shared by server + local fallback.
- [ ] Robust date/time parsing for natural phrasing: "next Thurs", "in 2 weeks", "tonight",
      "the 3rd", "lunchtime", relative + absolute, ranges. Add a dedicated chrono parser.
- [ ] Tolerant matching: typos, partial names, casual phrasing, multi-intent sentences.

## 2. Conversation / personality
- [ ] First-class **casual chat** (no command required) — Inkling should hold a normal conversation,
      remember the thread, and be warm/brief. (Welcome copy already updated.)
- [ ] Consistent persona + system prompt (friendly, concise, proactive, never pushy).
- [ ] Multi-turn memory within a session; reference earlier messages ("that meeting").
- [ ] Graceful "I'm not sure what you mean — did you mean X or Y?" instead of dead ends.

## 3. LLM backend
- [ ] Make the LLM the default path for EVERYONE (incl. guests) via a server proxy, or ship a
      capable local model — guests currently get the weakest experience.
- [ ] Model choice: wire an **Anthropic Claude** provider option (latest model) alongside the
      OpenAI-compatible one; pick the best available. Prompt-cache the system prompt.
- [ ] Streaming responses for snappy feel.
- [ ] Clear config/docs for the API key + provider selection; sane "mock" behavior for dev.

## 4. Calendar capabilities (the "amazing things")
- [ ] Create / edit / move / delete appointments from plain language, with confirmation.
- [ ] Add notes to a day/time (writes into the Schedule timeline slots).
- [ ] Set reminders & alarms (→ Alerts).
- [ ] Query: "what's on Tuesday?", "am I free Friday afternoon?", "when's my next X?".
- [ ] Find free time / suggest slots; detect conflicts.
- [ ] Summarize a day/week; proactive nudges ("you have 3 things tomorrow").
- [ ] Navigate the UI by voice/text: open Calendar to a date, open Schedule at a time, open Alerts.

## 5. Context awareness
- [ ] Always pass the real schedule summary + reference date + user name to the model
      (partially wired via `scheduleSummary`/`referenceDate`).
- [ ] Read back what's actually stored (notes, appointments, alerts) so answers are grounded.
- [ ] Respect the current view/date the user is looking at.

## 6. Safety & confirmation
- [ ] Never write without explicit confirmation (preserve the existing confirm flow).
- [ ] Show a clear preview of the proposed change before saving.
- [ ] Undo for AI-made changes.

## 7. Copy / naming / UI integration
- [ ] Rename **WordWeaver → Calendar** everywhere in AI copy and lexicons (the `openWordWeaver`
      action, phrase lexicons, any user-facing strings). WordWeaver is reserved for a future game world.
- [ ] Align all AI vocabulary to the 4 icons: **Calendar, Schedule, Inkling, Alerts**.
- [ ] Intro/welcome text updated (done) — keep it in sync if icons change.
- [ ] Inkling panel UX: streaming bubbles, quick-action chips, "saved ✓" feedback.

## 8. Testing
- [ ] Intent/parse test suite over a corpus of real phrasings (regression guard for NLU).
- [ ] Conversation eval: smalltalk, command, mixed, ambiguous, multi-turn.
- [ ] Server tests for the LLM contract + fallback behavior.

---

### Suggested PR sequence
1. Schema + LLM-first routing (server) with local fallback. (Items 1, 3)
2. Conversation/personality + memory. (Item 2)
3. Calendar capability coverage + context grounding. (Items 4, 5)
4. Confirmation/undo polish + copy rename. (Items 6, 7)
5. Test suites. (Item 8)
