/**
 * Inkling Mind — Stage 2: local heuristic concept extraction (no LLM, no key).
 *
 * Turns a line of conversation into concept candidates using a curated domain
 * lexicon + a light proper-noun fallback. Deterministic and free — this is the
 * "validate the cognitive model, not the UI" path. A real LLM/embedding extractor
 * can replace this later behind the same {label,type} contract.
 */

const STOPWORDS = new Set(
  ("a an and the to of in on for with is are was were be been being i you we they it this that " +
   "my your our their about into over from at as so but or if then than just really want need " +
   "have has had do does did can could should would will im ive its dont it's i'm i've").split(" ")
);

/**
 * Canonical concepts. `match` phrases are lowercased substrings (word-boundary
 * matched). Keep labels stable — the same label always maps to the same node.
 */
const LEXICON = [
  // — Inkling product cluster —
  { label: "Inkling", type: "project", match: ["inkling"] },
  { label: "Calendar", type: "concept", match: ["calendar"] },
  { label: "Notes", type: "concept", match: ["note", "notes", "note-taking"] },
  { label: "Alerts", type: "concept", match: ["alert", "alerts", "alarm", "alarms", "reminder", "reminders"] },
  { label: "Web Push", type: "concept", match: ["web push", "push notification", "push notifications"] },
  { label: "Voice to Text", type: "concept", match: ["voice to text", "voice-to-text", "speech to text", "dictation"] },
  { label: "Schedule", type: "concept", match: ["schedule", "scheduling"] },

  // — WordWeaver / cognitive cluster —
  { label: "WordWeaver", type: "project", match: ["wordweaver", "word weaver"] },
  { label: "Knowledge Graph", type: "concept", match: ["knowledge graph", "cognitive graph", "graph system", "mind graph", "mind map"] },
  { label: "Abstraction Engine", type: "concept", match: ["abstraction engine", "abstraction", "abstractions"] },
  { label: "Memory", type: "concept", match: ["memory", "remember", "memories"] },
  { label: "Concepts", type: "concept", match: ["concept node", "concept nodes", "concepts"] },
  { label: "Embeddings", type: "concept", match: ["embedding", "embeddings", "vector search", "semantic search"] },
  { label: "Insights", type: "concept", match: ["insight", "insights", "pattern", "patterns"] },

  // — WorldWeaver game cluster —
  { label: "WorldWeaver", type: "project", match: ["worldweaver", "world weaver"] },
  { label: "Unity", type: "concept", match: ["unity"] },
  { label: "Destructible World", type: "concept", match: ["destructible", "shatter", "crater", "energy beam", "energy beams"] },
  { label: "Meshy", type: "concept", match: ["meshy", "meshy.ai"] },
  { label: "3D Art", type: "concept", match: ["3d art", "3d model", "3d models", "art assets"] },

  // — Engineering / deploy cluster —
  { label: "GitHub Pages", type: "concept", match: ["github pages", "github.io", "pages deploy"] },
  { label: "Render", type: "concept", match: ["render", "backend server", "render.com"] },
  { label: "Deployment", type: "concept", match: ["deploy", "deployment", "ship it", "shipping"] },
  { label: "PWA", type: "concept", match: ["pwa", "progressive web app", "installable"] },
  { label: "Service Worker", type: "concept", match: ["service worker", "offline"] },
  { label: "IndexedDB", type: "concept", match: ["indexeddb", "local storage", "local-first", "on device", "on-device"] },

  // — Learning cluster —
  { label: "Three.js", type: "concept", match: ["three.js", "threejs", "webgl"] },
  { label: "JavaScript", type: "concept", match: ["javascript", "js module", "es module"] },

  // — Personal / life cluster —
  { label: "Sleep", type: "event", match: ["sleep", "slept", "tired", "rest", "bedtime"] },
  { label: "Focus", type: "concept", match: ["focus", "focused", "deep work", "concentrate"] },
  { label: "Free Time", type: "event", match: ["free time", "weekend", "downtime", "break"] },
  { label: "Productivity", type: "concept", match: ["productive", "productivity", "get things done", "momentum"] },
  { label: "Coffee", type: "event", match: ["coffee", "caffeine", "espresso"] },
  { label: "Burnout", type: "reflection", match: ["burnout", "burned out", "overwhelmed", "exhausted"] },

  // — Studies / academics (started classes) —
  { label: "Precalculus", type: "subject", match: ["precalculus", "pre-calculus", "pre calc", "precalc"] },
  { label: "Physics", type: "subject", match: ["physics"] },
  { label: "Chemistry", type: "subject", match: ["chemistry", "chem class", "chem"] },
  { label: "Biology", type: "subject", match: ["biology", "bio class"] },
  { label: "Mathematics", type: "subject", match: ["mathematics", "maths", "math"] },
  { label: "Science", type: "subject", match: ["science", "sciences"] },
  { label: "Functions", type: "concept", match: ["function", "functions", "domain and range"] },
  { label: "Trigonometry", type: "concept", match: ["trigonometry", "trig", "sine", "cosine", "tangent"] },
  { label: "Logarithms", type: "concept", match: ["logarithm", "logarithms", "log function"] },
  { label: "Vectors", type: "concept", match: ["vector", "vectors"] },
  { label: "Force", type: "concept", match: ["force", "forces", "newton's law", "newtons law", "newton's laws"] },
  { label: "Energy", type: "concept", match: ["energy", "kinetic", "potential energy"] },
  { label: "Motion", type: "concept", match: ["motion", "velocity", "acceleration"] },
  { label: "Gravity", type: "concept", match: ["gravity", "gravitational"] },
  { label: "Atoms", type: "concept", match: ["atom", "atoms", "atomic", "electron", "proton", "neutron"] },
  { label: "Molecules", type: "concept", match: ["molecule", "molecules", "compound", "compounds"] },
  { label: "Chemical Reactions", type: "concept", match: ["chemical reaction", "reactions", "reaction"] },
  { label: "Periodic Table", type: "concept", match: ["periodic table", "element", "elements"] },
  { label: "Cells", type: "concept", match: ["cell", "cells", "cellular"] },
  { label: "DNA", type: "concept", match: ["dna", "genetic", "genetics", "gene", "genes"] },
  { label: "Evolution", type: "concept", match: ["evolution", "natural selection"] },
  { label: "Photosynthesis", type: "concept", match: ["photosynthesis"] }
];

function hasPhrase(haystack, phrase) {
  const i = haystack.indexOf(phrase);
  if (i === -1) return false;
  const before = haystack[i - 1];
  const after = haystack[i + phrase.length];
  const boundary = (c) => c === undefined || !/[a-z0-9]/.test(c);
  return boundary(before) && boundary(after);
}

/**
 * Extract concept candidates from text.
 * @param {string} text
 * @returns {{label:string, type:string}[]}
 */
export function extractConcepts(text) {
  const lc = ` ${(text || "").toLowerCase().replace(/[^a-z0-9.\- ]/g, " ").replace(/\s+/g, " ")} `;
  const found = new Map();
  for (const entry of LEXICON) {
    if (entry.match.some((p) => hasPhrase(lc, ` ${p} `) || hasPhrase(lc, p))) {
      found.set(entry.label, { label: entry.label, type: entry.type });
    }
  }
  // NOTE: lexicon-only on purpose. A naive Capitalized-word fallback pulls in
  // sentence-start noise ("Spent", "Didn't", "Maybe") that muddies the graph.
  // A real NER/LLM extractor (Stage 2b, Haiku) replaces this for open-ended text.
  return [...found.values()];
}

export { LEXICON };
