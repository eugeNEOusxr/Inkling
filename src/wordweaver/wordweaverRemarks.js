import { createTimelineNode } from "../inkling-core/timelineNode.js";

/**
 * @param {number} dueAt ms timestamp
 * @param {number} [now]
 */
function daysUntil(dueAt, now = Date.now()) {
  return (dueAt - now) / (24 * 60 * 60 * 1000);
}

/**
 * Contextual AI-style remarks surfaced by calendar proximity.
 * @param {import('../inkling-core/timelineNode.js').TimelineNode[]} dayNodes
 * @param {string} dateStr
 * @param {number} [now]
 * @returns {import('../inkling-core/timelineNode.js').TimelineNode[]}
 */
export function buildRemarkNodes(dayNodes, dateStr, now = Date.now()) {
  /** @type {import('../inkling-core/timelineNode.js').TimelineNode[]} */
  const remarks = [];

  for (const node of dayNodes) {
    if (!node.dueAt || node.completed) continue;
    const days = daysUntil(node.dueAt, now);
    const label = (node.text || "").slice(0, 48);

    if (days <= 0 && days > -1) {
      remarks.push(
        createTimelineNode({
          id: `remark-due-${node.id}`,
          date: dateStr,
          segment: node.segment,
          time: node.time,
          text: `Today: "${label}" is due.`,
          kind: "insight",
          tags: ["deadline"],
          importance: 1,
          dueAt: node.dueAt
        })
      );
    } else if (days > 0 && days <= 1) {
      remarks.push(
        createTimelineNode({
          id: `remark-soon-${node.id}`,
          date: dateStr,
          segment: node.segment,
          time: node.time,
          text: `Tomorrow: prepare for "${label}".`,
          kind: "insight",
          tags: ["deadline"],
          importance: 0.95,
          dueAt: node.dueAt
        })
      );
    } else if (days > 1 && days <= 3) {
      remarks.push(
        createTimelineNode({
          id: `remark-approach-${node.id}`,
          date: dateStr,
          segment: node.segment,
          text: `In ${Math.ceil(days)} days — "${label}" is approaching.`,
          kind: "insight",
          tags: ["deadline"],
          importance: 0.75 + (3 - days) * 0.08,
          dueAt: node.dueAt
        })
      );
    }
  }

  const appointments = dayNodes.filter((n) => n.kind === "appointment");
  if (appointments.length >= 2) {
    remarks.push(
      createTimelineNode({
        id: `remark-cluster-${dateStr}`,
        date: dateStr,
        segment: "afternoon",
        text: `${appointments.length} appointments woven today — consider travel buffers.`,
        kind: "insight",
        tags: ["work"],
        importance: 0.6
      })
    );
  }

  const notes = dayNodes.filter((n) => n.kind === "note" && !n.calendarLink?.itemType);
  if (notes.length >= 3) {
    remarks.push(
      createTimelineNode({
        id: `remark-reflect-${dateStr}`,
        date: dateStr,
        segment: "night",
        text: `Reflection: what connected your ${notes.length} notes today?`,
        kind: "insight",
        tags: ["social"],
        importance: 0.5
      })
    );
  }

  return remarks.slice(0, 6);
}

/**
 * @param {import('../inkling-core/timelineNode.js').TimelineNode[]} remarks
 */
export function remarkUrgencyScore(remarks, now = Date.now()) {
  return remarks.map((r) => {
    let score = r.importance ?? 0.5;
    if (r.dueAt) {
      const d = daysUntil(r.dueAt, now);
      if (d <= 0) score += 0.4;
      else if (d <= 2) score += 0.25;
    }
    return { remark: r, score };
  });
}
