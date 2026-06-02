import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./config.js";

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

export async function readUser(email) {
  try {
    const raw = await fs.readFile(userPath(email), "utf8");
    return normalizeUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeUser(record) {
  await ensureDataDir();
  record.updatedAt = Date.now();
  await fs.writeFile(userPath(record.email), JSON.stringify(record, null, 2), "utf8");
}

export async function findByUsername(username) {
  if (!username) return null;
  const needle = username.toLowerCase();
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

export function isValidUsername(username) {
  if (!username) return true;
  return /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

export { emailNickname, userPath };
