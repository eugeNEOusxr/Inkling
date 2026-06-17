/**
 * Inkling Mind — Stage 2: synthetic conversation corpus (test harness).
 *
 * ~30 scripted conversations seeded with the real project landscape, used to
 * stress-test graph behavior with ZERO AI cost. Covers: project discussions,
 * learning topics, repeated ideas, emerging ideas, and conflicting ideas — the
 * four cases the MVP must validate. Ordering matters: foundational projects
 * recur from the start; embeddings/abstraction appear later (emerging); three
 * decisions carry explicit `contradicts` stance conflicts.
 */

export const SYNTHETIC_CONVERSATIONS = [
  // ── Session 1: Inkling product ──
  { session: "s1-inkling", turns: [
    { speaker: "user", text: "I want Inkling to be a calendar and notes app that actually understands me." },
    { speaker: "inkling", text: "So Inkling combines the calendar with note-taking?" },
    { speaker: "user", text: "Right, the calendar and notes are the core, plus a schedule view." }
  ]},
  { session: "s1-inkling", turns: [
    { speaker: "user", text: "The notes in Inkling should connect to the calendar day they belong to." },
    { speaker: "user", text: "Every note is tied to a schedule entry." }
  ]},

  // ── Session 2: WordWeaver / cognitive vision ──
  { session: "s2-wordweaver", turns: [
    { speaker: "user", text: "WordWeaver is the real idea — a knowledge graph that learns from my conversations." },
    { speaker: "inkling", text: "So WordWeaver builds a cognitive graph and Inkling is the interface to it?" },
    { speaker: "user", text: "Exactly. WordWeaver is the engine, the abstraction engine that finds meaning." }
  ]},
  { session: "s2-wordweaver", turns: [
    { speaker: "user", text: "The knowledge graph should turn memory into concepts and then abstractions." },
    { speaker: "user", text: "WordWeaver isn't about memory storage, it's about insights and patterns." }
  ]},
  { session: "s2-wordweaver", turns: [
    { speaker: "user", text: "Inkling reads the WordWeaver knowledge graph and explains my patterns back to me." }
  ]},

  // ── Session 3: WorldWeaver game ──
  { session: "s3-worldweaver", turns: [
    { speaker: "user", text: "WorldWeaver is my Unity game with a destructible world and energy beams." },
    { speaker: "inkling", text: "Different project from WordWeaver, the Unity one?" },
    { speaker: "user", text: "Yes, WorldWeaver is the Unity game, the art comes from Meshy." }
  ]},
  { session: "s3-worldweaver", turns: [
    { speaker: "user", text: "I spent the day on 3D art and destructible terrain in Unity for WorldWeaver." }
  ]},

  // ── Session 4: deployment ──
  { session: "s4-deploy", turns: [
    { speaker: "user", text: "Inkling deploys to GitHub Pages and the backend runs on Render." },
    { speaker: "user", text: "It's a PWA with a service worker so it works offline." }
  ]},
  { session: "s4-deploy", turns: [
    { speaker: "user", text: "Deployment to GitHub Pages keeps breaking, the service worker caches old builds." },
    { speaker: "inkling", text: "Is the PWA update flow the problem?" },
    { speaker: "user", text: "Yeah the PWA wouldn't update, had to fix the deploy pipeline." }
  ]},

  // ── Session 5: alerts + web push ──
  { session: "s5-alerts", turns: [
    { speaker: "user", text: "Inkling alerts need to fire even when the app is closed, that means web push." },
    { speaker: "user", text: "Web push for alarms was the hardest part, service worker territory." }
  ]},
  { session: "s5-alerts", turns: [
    { speaker: "user", text: "The schedule events should become alerts automatically." }
  ]},

  // ── Session 6: voice ──
  { session: "s6-voice", turns: [
    { speaker: "user", text: "I added voice to text so I can talk to Inkling instead of typing." },
    { speaker: "user", text: "Voice to text feeds the same notes and the knowledge graph." }
  ]},

  // ── Session 7: learning ──
  { session: "s7-learning", turns: [
    { speaker: "user", text: "Spent today learning Three.js and WebGL for the 3D calendar view." },
    { speaker: "user", text: "The 3D calendar uses Three.js, it's all JavaScript ES modules." }
  ]},
  { session: "s7-learning", turns: [
    { speaker: "user", text: "Storing everything locally with IndexedDB, local-first and on device." },
    { speaker: "inkling", text: "So the knowledge graph lives in IndexedDB on the device?" },
    { speaker: "user", text: "Right, IndexedDB keeps the knowledge graph private and offline." }
  ]},

  // ── Session 8: abstraction engine (emerging later) ──
  { session: "s8-abstraction", turns: [
    { speaker: "user", text: "The abstraction engine should cluster concepts into higher abstractions." },
    { speaker: "user", text: "Abstractions are the point — discover meaning, not just memory." }
  ]},
  { session: "s8-abstraction", turns: [
    { speaker: "user", text: "For clustering concepts I'll eventually need embeddings, semantic search." },
    { speaker: "inkling", text: "Embeddings to link related concepts in the knowledge graph?" },
    { speaker: "user", text: "Yes, embeddings power concept linking and the abstraction engine." }
  ]},
  { session: "s8-abstraction", turns: [
    { speaker: "user", text: "Embeddings could also surface insights and patterns I didn't notice." }
  ]},

  // ── Session 9: personal patterns ──
  { session: "s9-life", turns: [
    { speaker: "user", text: "I get my best deep work focus late at night after coffee." },
    { speaker: "user", text: "Coffee plus focus equals productivity, but then I lose sleep." }
  ]},
  { session: "s9-life", turns: [
    { speaker: "user", text: "Didn't sleep enough again, coding Inkling until 3am." },
    { speaker: "inkling", text: "Sleep keeps getting traded for late-night focus?" },
    { speaker: "user", text: "Yeah, poor sleep but high productivity, I worry about burnout." }
  ]},
  { session: "s9-life", turns: [
    { speaker: "user", text: "On the weekend I want free time but I keep working on WordWeaver." },
    { speaker: "user", text: "Free time turns into more Inkling work, no real break." }
  ]},

  // ── Session 10: decisions / conflicts (explicit contradictions) ──
  { session: "s10-decisions", turns: [
    { speaker: "user", text: "Maybe WordWeaver should be its own standalone app, separate from Inkling." },
    { speaker: "user", text: "But WordWeaver as an Inkling tab is simpler to ship.",
      contradicts: ["WordWeaver standalone", "WordWeaver as Inkling tab"] }
  ]},
  { session: "s10-decisions", turns: [
    { speaker: "user", text: "I should just build the MVP fast and validate the idea.", },
    { speaker: "user", text: "Then again, building it right with real architecture matters more.",
      contradicts: ["Build fast MVP", "Build right architecture"] }
  ]},
  { session: "s10-decisions", turns: [
    { speaker: "user", text: "Local-first with IndexedDB keeps it cheap and private." },
    { speaker: "user", text: "But a backend cognitive engine on Render scales better across devices.",
      contradicts: ["Local-first", "Backend engine"] }
  ]},

  // ── Reinforcement: tie clusters together, push central nodes ──
  { session: "s11-recap", turns: [
    { speaker: "user", text: "Big picture: Inkling is the interface, WordWeaver is the knowledge graph engine." },
    { speaker: "user", text: "The calendar, notes, alerts and voice to text all feed the knowledge graph." }
  ]},
  { session: "s11-recap", turns: [
    { speaker: "user", text: "WordWeaver turns my notes and schedule into concepts, abstractions and insights." }
  ]},
  { session: "s11-recap", turns: [
    { speaker: "user", text: "Everything Inkling captures, the knowledge graph should find patterns in." }
  ]}
];

/** Flatten conversations into timestamped turns for ingestion (spaced over days). */
export function flattenTurns(conversations = SYNTHETIC_CONVERSATIONS) {
  const DAY = 86400000;
  const base = Date.now() - conversations.length * DAY;
  const out = [];
  conversations.forEach((conv, ci) => {
    conv.turns.forEach((t, ti) => {
      out.push({
        sessionId: conv.session,
        speaker: t.speaker,
        text: t.text,
        contradicts: t.contradicts,
        ts: base + ci * DAY + ti * 60000
      });
    });
  });
  return out;
}
