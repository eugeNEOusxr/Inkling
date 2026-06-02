/**
 * Inkling timeline nodes — shared schema for calendar, WordWeaver, and Inkling queries.
 */

/** @typedef {'morning'|'afternoon'|'night'} DaySegment */

/** @typedef {'note'|'appointment'|'meal'|'travel'|'work'|'medical'|'sick'|'vacation'|'social'|'other'|'insight'} TimelineNodeKind */

/**
 * @typedef {Object} TimelineNode
 * @property {string} id stable id
 * @property {string} date YYYY-MM-DD
 * @property {DaySegment} segment
 * @property {string} [time] HH:MM
 * @property {string} text
 * @property {TimelineNodeKind} kind
 * @property {string[]} tags e.g. breakfast, hospital, vacation
 * @property {number} createdAt ms
 * @property {{ dayId: string, itemType: string, itemId: string }} [calendarLink]
 * @property {number} [dueAt] ms — deadline for urgency / AI remarks
 * @property {number} [importance] 0–1 visual weight
 * @property {boolean} [completed]
 */

export const DAY_SEGMENTS = /** @type {const} */ (["morning", "afternoon", "night"]);

export const NODE_TAGS = /** @type {const} */ ([
  "vacation",
  "work",
  "hospital",
  "doctors",
  "sick",
  "breakfast",
  "lunch",
  "dinner",
  "travel",
  "social"
]);

const TAG_KEYWORDS = [
  ["vacation", /\b(vacation|holiday|pto|time off)\b/i],
  ["work", /\b(work|office|meeting|standup|shift)\b/i],
  ["hospital", /\b(hospital|er|emergency room|clinic)\b/i],
  ["doctors", /\b(doctor|dentist|therapy|checkup|appointment with dr)\b/i],
  ["sick", /\b(sick|ill|flu|cold|fever)\b/i],
  ["breakfast", /\b(breakfast|brunch)\b/i],
  ["lunch", /\b(lunch)\b/i],
  ["dinner", /\b(dinner|supper)\b/i],
  ["travel", /\b(flight|airport|drive|train|trip)\b/i],
  ["social", /\b(party|dinner with|friends|family visit)\b/i]
];

/**
 * @param {string} time HH:MM
 * @returns {DaySegment}
 */
export function segmentFromTime(time) {
  const [hRaw, mRaw] = String(time).split(":");
  const h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  const minutes = h * 60 + m;
  if (minutes >= 5 * 60 && minutes < 12 * 60) return "morning";
  if (minutes >= 12 * 60 && minutes < 17 * 60) return "afternoon";
  return "night";
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function inferTagsFromText(text) {
  const tags = [];
  for (const [tag, re] of TAG_KEYWORDS) {
    if (re.test(text)) tags.push(tag);
  }
  return tags;
}

/**
 * @param {string} text
 * @returns {TimelineNodeKind}
 */
export function inferKindFromText(text, tags) {
  if (tags.includes("vacation")) return "vacation";
  if (tags.includes("sick")) return "sick";
  if (tags.some((t) => t === "hospital" || t === "doctors")) return "medical";
  if (tags.includes("work")) return "work";
  if (tags.some((t) => t === "breakfast" || t === "lunch" || t === "dinner")) return "meal";
  if (tags.includes("travel")) return "travel";
  if (tags.includes("social")) return "social";
  if (/\b(appointment|appt)\b/i.test(text)) return "appointment";
  return "note";
}

/**
 * @param {Partial<TimelineNode> & Pick<TimelineNode, 'date'|'segment'|'text'>} fields
 * @returns {TimelineNode}
 */
export function createTimelineNode(fields) {
  const text = String(fields.text ?? "").trim();
  const tags = fields.tags ?? inferTagsFromText(text);
  const kind = fields.kind ?? inferKindFromText(text, tags);
  const time = fields.time;
  const segment = fields.segment ?? (time ? segmentFromTime(time) : "afternoon");

  return {
    id: fields.id ?? `node-${fields.date}-${segment}-${time ?? "na"}-${Math.random().toString(36).slice(2, 9)}`,
    date: fields.date,
    segment,
    time,
    text,
    kind,
    tags,
    createdAt: fields.createdAt ?? Date.now(),
    calendarLink: fields.calendarLink,
    dueAt: fields.dueAt,
    importance: fields.importance,
    completed: fields.completed
  };
}

/**
 * @typedef {Object} SegmentModule
 * @property {string} date YYYY-MM-DD
 * @property {DaySegment} segment
 * @property {string} label human label e.g. "Afternoon"
 * @property {TimelineNode[]} nodes
 */

/**
 * @param {string} date
 * @param {DaySegment} segment
 * @param {TimelineNode[]} nodes
 * @returns {SegmentModule}
 */
export function buildSegmentModule(date, segment, nodes) {
  const labels = { morning: "Morning", afternoon: "Afternoon", night: "Night" };
  return {
    date,
    segment,
    label: labels[segment],
    nodes: nodes.filter((n) => n.date === date && n.segment === segment)
  };
}

/**
 * @param {string} date
 * @param {DaySegment} segment
 * @param {Record<string, string>} slotNotes HH:MM -> text
 * @returns {TimelineNode[]}
 */
export function nodesFromSlotNotes(date, segment, slotNotes) {
  return Object.entries(slotNotes)
    .filter(([time, text]) => text?.trim() && segmentFromTime(time) === segment)
    .map(([time, text]) =>
      createTimelineNode({
        date,
        segment,
        time,
        text,
        kind: "note"
      })
    );
}

/**
 * Demo weave for empty segments (WordWeaver stub).
 * @param {string} date
 * @param {DaySegment} segment
 * @returns {TimelineNode[]}
 */
export function demoSegmentNodes(date, segment) {
  const samples = {
    morning: [
      { time: "07:30", text: "Breakfast · oats & coffee", tags: ["breakfast"] },
      { time: "09:00", text: "Work · focus block", tags: ["work"] }
    ],
    afternoon: [
      { time: "12:30", text: "Lunch · desk", tags: ["lunch"] },
      { time: "14:00", text: "Doctor checkup", tags: ["doctors", "medical"] },
      { time: "15:30", text: "Weave plans in 3D", tags: ["work"] }
    ],
    night: [
      { time: "18:30", text: "Dinner", tags: ["dinner"] },
      { time: "21:00", text: "Wind down · read", tags: ["social"] }
    ]
  };

  return (samples[segment] ?? []).map((row) =>
    createTimelineNode({
      date,
      segment,
      time: row.time,
      text: row.text,
      tags: row.tags
    })
  );
}
