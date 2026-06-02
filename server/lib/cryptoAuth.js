import crypto from "node:crypto";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

export function getJwtSecret() {
  return process.env.JWT_SECRET || "eugeneousxr-dev-change-in-production";
}

export function signToken(email, secret = getJwtSecret()) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${email.toLowerCase()}:${exp}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyToken(token, secret = getJwtSecret()) {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length < 3) return null;
    const sig = parts.pop();
    const exp = parts.pop();
    const email = parts.join(":");
    const payload = `${email}:${exp}`;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (sig !== expected || Date.now() > Number(exp)) return null;
    return email.toLowerCase();
  } catch {
    return null;
  }
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, hash) => {
      if (err) reject(err);
      else resolve(`${salt.toString("hex")}:${hash.toString("hex")}`);
    });
  });
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, hash) => {
      if (err) reject(err);
      else resolve(hash.toString("hex") === hashHex);
    });
  });
}

export function generateResetToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function resetExpiresAt() {
  return Date.now() + RESET_TTL_MS;
}

export { TOKEN_TTL_MS, RESET_TTL_MS };
