import { apiFetch } from "../auth/cloudSync.js";
import { getSession } from "../auth/session.js";
import { buildRemarkNodes } from "./wordweaverRemarks.js";
import { createTimelineNode } from "../inkling-core/timelineNode.js";

const LOCAL_CACHE_KEY = "inkling:wordweaverRemarksCache";

/**
 * @param {string} dateStr
 * @param {object} dayContext
 */
function localCacheGet(dateStr, dayContext) {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "{}");
    const entry = all[dateStr];
    if (!entry || entry.hash !== hashContext(dayContext)) return null;
    if (Date.now() - entry.at > 6 * 60 * 60 * 1000) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * @param {string} dateStr
 * @param {object} dayContext
 * @param {object} payload
 */
function localCacheSet(dateStr, dayContext, payload) {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "{}");
    all[dateStr] = { hash: hashContext(dayContext), at: Date.now(), ...payload };
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function hashContext(ctx) {
  const items = ctx.items || [];
  return `${ctx.date}:${items.length}:${items.map((i) => i.id).join(",")}`.slice(0, 120);
}

/**
 * @param {object[]} apiRemarks
 * @param {string} dateStr
 */
export function apiRemarksToNodes(apiRemarks, dateStr) {
  return apiRemarks.map((r, i) =>
    createTimelineNode({
      id: `remark-llm-${dateStr}-${i}-${r.category || "tip"}`,
      date: dateStr,
      segment: r.segment || "afternoon",
      time: r.time,
      text: r.text,
      kind: "insight",
      tags: [r.category || "tip"],
      importance: r.importance ?? 0.6
    })
  );
}

/**
 * Fetch LLM remarks (auth required). Falls back to rule-based nodes.
 * @param {string} dateStr
 * @param {object} dayContext
 * @param {import('../inkling-core/timelineNode.js').TimelineNode[]} fallbackDayNodes
 */
export async function resolveRemarkNodes(dateStr, dayContext, fallbackDayNodes) {
  const ruleNodes = buildRemarkNodes(fallbackDayNodes, dateStr);

  if (!getSession()?.token) {
    return { nodes: ruleNodes, source: "local" };
  }

  const cached = localCacheGet(dateStr, dayContext);
  if (cached?.remarks) {
    return {
      nodes: apiRemarksToNodes(cached.remarks, dateStr),
      source: cached.source || "cache"
    };
  }

  try {
    const body = await apiFetch("/api/wordweaver/remarks", {
      method: "POST",
      body: JSON.stringify({ date: dateStr, dayContext })
    });
    if (body?.remarks?.length) {
      localCacheSet(dateStr, dayContext, { remarks: body.remarks, source: body.source });
      return {
        nodes: apiRemarksToNodes(body.remarks, dateStr),
        source: body.source || "llm"
      };
    }
  } catch (err) {
    console.warn("[WordWeaver] remarks API:", err.message);
  }

  return { nodes: ruleNodes, source: "rules" };
}
