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

// ── store mode: decide DB-or-file ONCE and stick to it, so reads + writes never
//    split across stores (that split made register succeed but login 401). If a
//    DB op ever errors, we flip the WHOLE store to files (consistent + functional,
//    just not durable) and log why — instead of silently writing to a place the
//    next read won't look.
let _modePromise = null;
async function storeMode() {
  if (!_modePromise) {
    _modePromise = (async () => ((dbEnabled() && (await ensureDb())) ? "db" : "file"))();
  }
  return _modePromise;
}
function fallToFile(op, err) {
  console.error(`[db] ${op} failed — switching whole store to files:`, err?.message || err);
  _modePromise = Promise.resolve("file");
}

export async function readUser(email) {
  if ((await storeMode()) === "db") {
    try {
      const r = await query("SELECT data FROM users WHERE email = $1", [String(email).toLowerCase()]);
      return r.rows[0] ? normalizeUser(r.rows[0].data) : null;
    } catch (err) {
      fallToFile("readUser", err);
    }
  }
  return readUserFile(email);
}

export async function writeUser(record) {
  record.updatedAt = Date.now();
  if ((await storeMode()) === "db") {
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
      fallToFile("writeUser", err);
    }
  }
  await writeUserFile(record);
}

export async function findByUsername(username) {
  if (!username) return null;
  const needle = String(username).toLowerCase();
  if ((await storeMode()) === "db") {
    try {
      const r = await query("SELECT data FROM users WHERE LOWER(username) = $1 LIMIT 1", [needle]);
      return r.rows[0] ? normalizeUser(r.rows[0].data) : null;
    } catch (err) {
      fallToFile("findByUsername", err);
    }
  }
  return findByUsernameFile(needle);
}

export function isValidUsername(username) {
  if (!username) return true;
  return /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

export { emailNickname, userPath, normalizeUser };
