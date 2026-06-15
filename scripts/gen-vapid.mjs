/**
 * Generate a VAPID (Voluntary Application Server Identification) key pair for
 * Web Push. Zero-dep — uses node:crypto only.
 *
 *   node scripts/gen-vapid.mjs
 *
 * Prints:
 *   - VAPID_PUBLIC_KEY  (base64url raw P-256 point, 65 bytes / "BB..." — the
 *                        applicationServerKey the browser subscribes with)
 *   - VAPID_PRIVATE_KEY (base64url PKCS8 — kept server-side, never shipped)
 *   - VAPID_SUBJECT     (mailto: contact, required by push services)
 *
 * Set these as environment variables on the backend (Render dashboard).
 * The public key is also written to vapid-public.json for the web build to bake
 * into the client.
 */
import crypto from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "prime256v1"
});

// Raw uncompressed public point (65 bytes, 0x04 prefix) → base64url.
const rawPublic = publicKey.export({ type: "spki", format: "der" });
// The last 65 bytes of the SPKI DER are the uncompressed EC point.
const point = rawPublic.subarray(rawPublic.length - 65);
const pubB64url = point.toString("base64url");

// Private key as PKCS8 DER → base64url (re-importable for ES256 signing).
const privPkcs8 = privateKey.export({ type: "pkcs8", format: "der" });
const privB64url = privPkcs8.toString("base64url");

const subject = process.env.VAPID_SUBJECT || "mailto:eugeneousxr2026@outlook.com";

console.log("\n=== VAPID keys — set these on the backend (Render env vars) ===\n");
console.log(`VAPID_PUBLIC_KEY=${pubB64url}`);
console.log(`VAPID_PRIVATE_KEY=${privB64url}`);
console.log(`VAPID_SUBJECT=${subject}`);
console.log("\nKeep VAPID_PRIVATE_KEY secret. Public key is safe to ship.\n");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "vapid-public.json");
writeFileSync(outPath, JSON.stringify({ publicKey: pubB64url, subject }, null, 2) + "\n");
console.log(`Wrote public key for the web build → ${outPath}\n`);
