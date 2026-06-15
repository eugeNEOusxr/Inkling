/**
 * Web Push alarm scheduler. Sweeps every user's push record, sends a push for
 * each schedule whose fireAt has arrived, and prunes dead subscriptions.
 *
 * FREE-TIER NOTE: Render spins the server down when idle, so an internal timer
 * alone won't fire alarms while the app is closed. Pair this with an external
 * uptime pinger (cron-job.org / UptimeRobot, ~1 min) hitting POST /api/push/run
 * with the PUSH_RUN_SECRET so the server wakes and dispatches due pushes.
 */
import { listAllPush, writePush, readPush } from "./pushStore.js";
import { sendPush } from "./webPushSend.js";

// Don't fire alarms more than this late (e.g. server was down for hours).
const GRACE_MS = 60 * 60 * 1000;
// Forget sent-markers / drop schedules this long after they fired.
const RETAIN_MS = 24 * 60 * 60 * 1000;

let timer = null;
let running = false;

export function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/**
 * Send all due pushes across all users.
 * @param {number} [now]
 * @returns {Promise<{sent:number, failed:number, pruned:number, users:number}>}
 */
export async function runDuePushes(now = Date.now()) {
  const vapid = getVapidConfig();
  if (!vapid) {
    console.warn("[push] VAPID keys not configured — skipping dispatch.");
    return { sent: 0, failed: 0, pruned: 0, users: 0 };
  }

  const records = await listAllPush();
  let sent = 0;
  let failed = 0;
  let pruned = 0;

  for (const rec of records) {
    if (!rec.subscriptions?.length || !rec.schedules?.length) continue;

    const due = rec.schedules.filter(
      (s) => s.fireAt <= now && s.fireAt >= now - GRACE_MS && !rec.sent[s.id]
    );
    if (!due.length) {
      maybePrune(rec, now) && (await writePush(rec));
      continue;
    }

    // Re-read fresh to reduce the race with concurrent subscribe/schedule writes.
    const fresh = await readPush(rec.email);
    const deadEndpoints = new Set();

    for (const item of due) {
      if (fresh.sent[item.id]) continue;
      let anyOk = false;
      for (const sub of fresh.subscriptions) {
        if (deadEndpoints.has(sub.endpoint)) continue;
        try {
          const res = await sendPush(
            sub,
            {
              title: item.title,
              body: item.body,
              tag: item.tag,
              url: item.url,
              kind: item.kind,
              requireInteraction: item.kind === "alarm"
            },
            { vapid }
          );
          if (res.ok) {
            anyOk = true;
            sent++;
          } else if (res.gone) {
            deadEndpoints.add(sub.endpoint);
            pruned++;
          } else {
            failed++;
            console.warn(`[push] send ${res.status} for ${item.id}: ${res.body || ""}`.trim());
          }
        } catch (err) {
          failed++;
          console.warn("[push] send error:", err?.message || err);
        }
      }
      if (anyOk) fresh.sent[item.id] = now;
    }

    if (deadEndpoints.size) {
      fresh.subscriptions = fresh.subscriptions.filter((s) => !deadEndpoints.has(s.endpoint));
    }
    maybePrune(fresh, now);
    await writePush(fresh);
  }

  return { sent, failed, pruned, users: records.length };
}

/** Drop old fired schedules + stale sent-markers. Returns true if it changed. */
function maybePrune(rec, now) {
  let changed = false;
  const beforeSchedules = rec.schedules.length;
  rec.schedules = rec.schedules.filter((s) => s.fireAt >= now - RETAIN_MS);
  if (rec.schedules.length !== beforeSchedules) changed = true;
  for (const [id, at] of Object.entries(rec.sent)) {
    if (at < now - RETAIN_MS) {
      delete rec.sent[id];
      changed = true;
    }
  }
  return changed;
}

/** Start the internal sweep timer (best-effort while the server is awake). */
export function startScheduler(intervalMs = 30000) {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runDuePushes();
      if (r.sent || r.failed) console.log(`[push] dispatch sent=${r.sent} failed=${r.failed} pruned=${r.pruned}`);
    } catch (err) {
      console.warn("[push] scheduler tick error:", err?.message || err);
    } finally {
      running = false;
    }
  };
  timer = setInterval(tick, intervalMs);
  if (timer.unref) timer.unref();
  tick();
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
