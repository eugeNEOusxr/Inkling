/**
 * Rule-based remark generation (server mirror for mock LLM + client fallback).
 * @param {{ date: string, items: object[], todayIso?: string }} ctx
 */
export function ruleBasedRemarksFromContext(ctx) {
  const date = ctx.date || ctx.todayIso;
  const items = ctx.items || [];
  const now = Date.now();
  /** @type {object[]} */
  const remarks = [];

  for (const item of items) {
    if (!item.dueAt) continue;
    const days = (item.dueAt - now) / (24 * 60 * 60 * 1000);
    const label = String(item.text || "").slice(0, 48);
    const segment = item.segment || "afternoon";

    if (days <= 0 && days > -1) {
      remarks.push({
        text: `Today: "${label}" is due — block time to finish.`,
        segment,
        importance: 1,
        category: "deadline"
      });
    } else if (days > 0 && days <= 1) {
      remarks.push({
        text: `Tomorrow: prep for "${label}" (gather materials, travel time).`,
        segment,
        importance: 0.92,
        category: "deadline"
      });
    } else if (days > 1 && days <= 4) {
      remarks.push({
        text: `In ${Math.ceil(days)} days — "${label}" is on the horizon.`,
        segment,
        importance: 0.7 + (4 - days) * 0.06,
        category: "deadline"
      });
    }
  }

  const appts = items.filter((i) => i.kind === "appointment");
  if (appts.length >= 2) {
    remarks.push({
      text: `You have ${appts.length} appointments — leave buffers between them.`,
      segment: "afternoon",
      importance: 0.65,
      category: "tip"
    });
  }

  const notes = items.filter((i) => i.kind === "note");
  if (notes.length >= 3) {
    remarks.push({
      text: `Reflection: what theme connects your ${notes.length} notes today?`,
      segment: "night",
      importance: 0.5,
      category: "reflection"
    });
  }

  if (!remarks.length && items.length) {
    remarks.push({
      text: `Your woven day has ${items.length} items — tap a sign to open in Writer.`,
      segment: "afternoon",
      importance: 0.4,
      category: "tip"
    });
  }

  return remarks.slice(0, 8);
}
