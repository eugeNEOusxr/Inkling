/**
 * Per-user store for Web Push subscriptions + scheduled alarm fire-times.
 * Kept in its own files (DATA_DIR/push/<hash>.json) so it is independent of the
 * user-record normalizer and survives user writes. On the free tier these files
 * live on the ephemeral disk, so the client re-uploads its subscription on every
 * app start (see webPush.initPushLifecycle).
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "../config.js";

const PUSH_DIR = path.join(DATA_DIR, "push");

function pushPath(email) {
  const id = crypto.createHash("sha256").update(String(email).toLowerCase()).digest("hex");
  return path.join(PUSH_DIR, `${id}.json`);
}

async function ensurePushDir() {
  await fs.mkdir(PUSH_DIR, { recursive: true });
}

function empty(email) {
  return { email: String(email).toLowerCase(), subscriptions: [], schedules: [], sent: {}, updatedAt: 0 };
}

export async function readPush(email) {
  try {
    const raw = await fs.readFile(pushPath(email), "utf8");
    const parsed = JSON.parse(raw);
    return { ...empty(email), ...parsed };
  } catch {
    return empty(email);
  }
}

export async function writePush(record) {
  await ensurePushDir();
  record.updatedAt = Date.now();
  await fs.writeFile(pushPath(record.email), JSON.stringify(record, null, 2), "utf8");
  return record;
}

/** Add (or refresh) a subscription, de-duped by endpoint. */
export async function addSubscription(email, subscription, userAgent) {
  const rec = await readPush(email);
  rec.subscriptions = rec.subscriptions.filter((s) => s.endpoint !== subscription.endpoint);
  rec.subscriptions.push({
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    expirationTime: subscription.expirationTime ?? null,
    userAgent: userAgent || null,
    createdAt: Date.now()
  });
  // Keep at most 10 devices per user.
  if (rec.subscriptions.length > 10) rec.subscriptions = rec.subscriptions.slice(-10);
  return writePush(rec);
}

export async function removeSubscription(email, endpoint) {
  const rec = await readPush(email);
  rec.subscriptions = rec.subscriptions.filter((s) => s.endpoint !== endpoint);
  return writePush(rec);
}

/** Replace the schedule list; drop sent-markers for ids no longer scheduled. */
export async function setSchedules(email, schedules) {
  const rec = await readPush(email);
  const clean = (Array.isArray(schedules) ? schedules : [])
    .filter((s) => s && s.id && Number.isFinite(s.fireAt))
    .slice(0, 500)
    .map((s) => ({
      id: String(s.id),
      fireAt: Number(s.fireAt),
      title: String(s.title || "Inkling alarm").slice(0, 200),
      body: String(s.body || "").slice(0, 500),
      tag: s.tag ? String(s.tag).slice(0, 120) : undefined,
      url: s.url ? String(s.url).slice(0, 300) : "/index.html",
      kind: s.kind ? String(s.kind).slice(0, 40) : "alarm"
    }));
  rec.schedules = clean;
  const ids = new Set(clean.map((s) => s.id));
  for (const id of Object.keys(rec.sent)) if (!ids.has(id)) delete rec.sent[id];
  return writePush(rec);
}

/** All push records (for the scheduler sweep). */
export async function listAllPush() {
  await ensurePushDir();
  let files = [];
  try {
    files = await fs.readdir(PUSH_DIR);
  } catch {
    return [];
  }
  const out = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(await fs.readFile(path.join(PUSH_DIR, file), "utf8")));
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

export { pushPath, PUSH_DIR };
