/**
 * Web Push API routes. Wired into handleApi.js — see the one-line hook there.
 * Returns true if it handled the request, false to fall through to other routes.
 */
import { verifyToken } from "../lib/cryptoAuth.js";
import { rateLimit, clientIp } from "../lib/rateLimit.js";
import {
  addSubscription,
  removeSubscription,
  setSchedules,
  readPush,
  writePush
} from "../lib/push/pushStore.js";
import { runDuePushes, getVapidConfig } from "../lib/push/scheduler.js";
import { sendPush } from "../lib/push/webPushSend.js";

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data)
  });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getBearer(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  return m ? m[1] : null;
}

/**
 * @returns {Promise<boolean>} true if this request was a /api/push/* route.
 */
export async function handlePushRoute(req, res, url) {
  if (!url.pathname.startsWith("/api/push/")) return false;
  const ip = clientIp(req);

  // Public: the client can fetch the VAPID public key if it wasn't baked in.
  if (req.method === "GET" && url.pathname === "/api/push/vapid-public") {
    const vapid = getVapidConfig();
    json(res, 200, { publicKey: vapid?.publicKey || "" });
    return true;
  }

  // External uptime pinger entry point — wakes the free-tier server and
  // dispatches due pushes. Guarded by a shared secret. Accepts GET or POST so a
  // simple uptime monitor (UptimeRobot etc.) can trigger it with ?secret=.
  if ((req.method === "POST" || req.method === "GET") && url.pathname === "/api/push/run") {
    const secret = process.env.PUSH_RUN_SECRET || "";
    const provided = req.headers["x-push-secret"] || url.searchParams.get("secret") || "";
    if (!secret || provided !== secret) {
      json(res, 403, { error: "Forbidden" });
      return true;
    }
    const result = await runDuePushes();
    json(res, 200, { ok: true, ...result });
    return true;
  }

  // Everything below requires a signed-in user.
  const email = verifyToken(getBearer(req));
  if (!email) {
    json(res, 401, { error: "Not signed in." });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/push/subscribe") {
    const limited = rateLimit(`${ip}:push-sub`, { limit: 30, windowMs: 60_000 });
    if (!limited.ok) return json(res, 429, { error: "Too many requests." }), true;
    const body = await readBody(req);
    const sub = body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      json(res, 400, { error: "Valid subscription required." });
      return true;
    }
    await addSubscription(email, sub, body.userAgent);
    json(res, 201, { ok: true });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/push/unsubscribe") {
    const body = await readBody(req);
    if (body?.endpoint) await removeSubscription(email, body.endpoint);
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === "PUT" && url.pathname === "/api/push/schedules") {
    const body = await readBody(req);
    if (!Array.isArray(body?.schedules)) {
      json(res, 400, { error: "schedules array required." });
      return true;
    }
    const rec = await setSchedules(email, body.schedules);
    json(res, 200, { ok: true, count: rec.schedules.length });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/push/test") {
    const limited = rateLimit(`${ip}:push-test`, { limit: 10, windowMs: 60_000 });
    if (!limited.ok) return json(res, 429, { error: "Too many test pushes." }), true;
    const vapid = getVapidConfig();
    if (!vapid) {
      json(res, 503, { error: "Push not configured on the server." });
      return true;
    }
    const rec = await readPush(email);
    if (!rec.subscriptions.length) {
      json(res, 400, { error: "No push subscription. Enable alarms first." });
      return true;
    }
    let sent = 0;
    const dead = new Set();
    for (const sub of rec.subscriptions) {
      try {
        const r = await sendPush(
          sub,
          {
            title: "Inkling test alarm",
            body: "Web push is working — alarms will reach you even when the app is closed.",
            kind: "alarm",
            requireInteraction: false,
            url: "/index.html"
          },
          { vapid }
        );
        if (r.ok) sent++;
        else if (r.gone) dead.add(sub.endpoint);
      } catch {
        /* ignore individual failures */
      }
    }
    if (dead.size) {
      rec.subscriptions = rec.subscriptions.filter((s) => !dead.has(s.endpoint));
      await writePush(rec);
    }
    json(res, sent ? 200 : 502, { ok: sent > 0, sent });
    return true;
  }

  json(res, 404, { error: "Not found" });
  return true;
}
