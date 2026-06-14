import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./config.js";
import { dbEnabled, ensureDb, query } from "./db.js";

function userPath(email) {
  const id = crypto.createHash("sha256").update(email.toLowerCase()).digest("hex");
  return path.join(DATA_DIR, `${id}.json`);
}

function emailNickname(email) {
  const local = email.split("@")[0] || "user";
  return local.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param {object} raw
 */
function normalizeUser(raw) {
  const email = String(raw.email || "").toLowerCase();
  const now = Date.now();
  return {
    email,
    username: raw.username ?? null,
    displayName: raw.displayName ?? raw.username ?? emailNickname(email),
    passwordHash: raw.passwordHash,
    bundle: raw.bundle ?? { version: 2, savedAt: 0 },
    settings: {
      notifications: raw.settings?.notifications ?? {},
      theme: raw.settings?.theme ?? { mode: "dark" },
      ai: raw.settings?.ai ?? { proactive: true },
      wordweaver: raw.settings?.wordweaver ?? {
        layoutMode: "street",
        customLayout: null,
        savedAt: 0
      }
    },
    notificationSchedules: raw.notificationSchedules ?? [],
    notificationHistory: raw.notificationHistory ?? [],
    feedback: raw.feedback ?? [],
    resetTokens: raw.resetTokens ?? [],
    auditLog: raw.auditLog ?? [],
    wordweaverRemarksCache: raw.wordweaverRemarksCache ?? {},
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now
  };
}

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// ── file-backed implementations (fallback / local dev) ─────────────────────
async function readUserFile(email) {
  try {
    const raw = await fs.readFile(userPath(email), "utf8");
    return normalizeUser(JSON.parse(raw));
  } catch {
    return null;
  }
}
async function writeUserFile(record) {
  await ensureDataDir();
  await fs.writeFile(userPath(record.email), JSON.stringify(record, null, 2), "utf8");
}
async function findByUsernameFile(needle) {
  await ensureDataDir();
  const files = await fs.readdir(DATA_DIR);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf8"));
      if (raw.username && String(raw.username).toLowerCase() === needle) {
        return normalizeUser(raw);
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

// ── public API: Postgres when DATABASE_URL is set, else files ──────────────
export async function readUser(email) {
  if (dbEnabled() && (await ensureDb())) {
    try {
      const r = await query("SELECT data FROM users WHERE email = $1", [email.toLowerCase()]);
      return r.rows[0] ? normalizeUser(r.rows[0].data) : null;
    } catch (err) {
      console.error("[db] readUser failed, using file:", err?.message || err);
    }
  }
  return readUserFile(email);
}

export async function writeUser(record) {
  record.updatedAt = Date.now();
  if (dbEnabled() && (await ensureDb())) {
    try {
      const n = normalizeUser(record);
      await query(
        `INSERT INTO users (email, username, data, updated_at)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (email)
         DO UPDATE SET username = EXCLUDED.username, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [n.email, n.username, JSON.stringify(n), n.updatedAt]
      );
      return;
    } catch (err) {
      console.error("[db] writeUser failed, using file:", err?.message || err);
    }
  }
  await writeUserFile(record);
}

export async function findByUsername(username) {
  if (!username) return null;
  const needle = String(username).toLowerCase();
  if (dbEnabled() && (await ensureDb())) {
    try {
      const r = await query("SELECT data FROM users WHERE LOWER(username) = $1 LIMIT 1", [needle]);
      return r.rows[0] ? normalizeUser(r.rows[0].data) : null;
    } catch (err) {
      console.error("[db] findByUsername failed, using file:", err?.message || err);
    }
  }
  return findByUsernameFile(needle);
}

export function isValidUsername(username) {
  if (!username) return true;
  return /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

export { emailNickname, userPath, normalizeUser };
