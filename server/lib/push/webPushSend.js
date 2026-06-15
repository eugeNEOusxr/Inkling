/**
 * Zero-dep Web Push sender — RFC 8291 (aes128gcm payload encryption) +
 * RFC 8292 (VAPID auth). Uses node:crypto only, so it runs on the free-tier
 * backend without installing the `web-push` package.
 *
 * Verify the encryption against the RFC 8291 §5 test vector:
 *   node server/lib/push/webPushSend.js --selftest
 */
import crypto from "node:crypto";

const P256_SPKI_PREFIX = Buffer.from(
  "3059301306072a8648ce3d020106082a8648ce3d030107034200",
  "hex"
);

/** Raw 65-byte uncompressed P-256 point → KeyObject (public). */
function rawToPublicKey(raw) {
  const der = Buffer.concat([P256_SPKI_PREFIX, raw]);
  return crypto.createPublicKey({ key: der, format: "der", type: "spki" });
}

/** KeyObject (public) → raw 65-byte uncompressed point. */
function publicKeyToRaw(keyObject) {
  const der = keyObject.export({ type: "spki", format: "der" });
  return der.subarray(der.length - 65);
}

/** HKDF-Extract + single-block Expand (output length L <= 32). */
function hkdf(salt, ikm, info, length) {
  const prk = crypto.createHmac("sha256", salt).update(ikm).digest();
  const t = crypto
    .createHmac("sha256", prk)
    .update(Buffer.concat([info, Buffer.from([1])]))
    .digest();
  return t.subarray(0, length);
}

function infoBytes(str) {
  return Buffer.concat([Buffer.from(str, "utf8"), Buffer.from([0])]);
}

/**
 * Encrypt a payload for a push subscription (aes128gcm).
 * @param {Buffer} plaintext
 * @param {Buffer} uaPublicRaw   receiver public key (p256dh), 65 raw bytes
 * @param {Buffer} authSecret    receiver auth secret, 16 bytes
 * @param {object} [opts]        test hooks: { asPrivateKey, salt }
 * @returns {Buffer} aes128gcm message body
 */
export function encryptPayload(plaintext, uaPublicRaw, authSecret, opts = {}) {
  const salt = opts.salt || crypto.randomBytes(16);

  // Application-server ephemeral ECDH keypair.
  const asKeys =
    opts.asPrivateKey != null
      ? { privateKey: opts.asPrivateKey, publicKey: crypto.createPublicKey(opts.asPrivateKey) }
      : crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const asPublicRaw = publicKeyToRaw(asKeys.publicKey);

  const uaPublicKey = rawToPublicKey(uaPublicRaw);
  const sharedSecret = crypto.diffieHellman({
    privateKey: asKeys.privateKey,
    publicKey: uaPublicKey
  });

  // RFC 8291 §3.4: combine the ECDH secret with the auth secret.
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    uaPublicRaw,
    asPublicRaw
  ]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);

  // RFC 8188 derivation with the message salt.
  const cek = hkdf(salt, ikm, infoBytes("Content-Encoding: aes128gcm"), 16);
  const nonce = hkdf(salt, ikm, infoBytes("Content-Encoding: nonce"), 12);

  // Single record: plaintext || 0x02 (last-record delimiter), no extra padding.
  const padded = Buffer.concat([plaintext, Buffer.from([2])]);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);

  // aes128gcm content-coding header: salt(16) | rs(4) | idlen(1) | keyid(asPublic).
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const header = Buffer.concat([salt, rs, Buffer.from([asPublicRaw.length]), asPublicRaw]);

  return Buffer.concat([header, ciphertext]);
}

/** DER ECDSA signature → raw r||s (P1363), 64 bytes. (Fallback; we use p1363.) */
function importVapidPrivateKey(b64urlPkcs8) {
  return crypto.createPrivateKey({
    key: Buffer.from(b64urlPkcs8, "base64url"),
    format: "der",
    type: "pkcs8"
  });
}

/**
 * Build the VAPID Authorization header value for a given push endpoint.
 * @param {string} endpoint
 * @param {{ publicKey:string, privateKey:string, subject:string }} vapid
 */
export function buildVapidHeader(endpoint, vapid) {
  const audience = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: vapid.subject
  };
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: importVapidPrivateKey(vapid.privateKey),
    dsaEncoding: "ieee-p1363"
  });
  const jwt = `${signingInput}.${signature.toString("base64url")}`;
  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

/**
 * Send one push message.
 * @param {{endpoint:string, keys:{p256dh:string, auth:string}}} subscription
 * @param {object|string} payload  JSON-serializable notification data
 * @param {{ vapid:object, ttl?:number, urgency?:string }} opts
 * @returns {Promise<{ok:boolean, status:number, gone:boolean, body?:string}>}
 */
export async function sendPush(subscription, payload, opts) {
  const { vapid, ttl = 2419200, urgency = "high" } = opts;
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);

  const uaPublicRaw = Buffer.from(subscription.keys.p256dh, "base64url");
  const authSecret = Buffer.from(subscription.keys.auth, "base64url");
  const encrypted = encryptPayload(Buffer.from(body, "utf8"), uaPublicRaw, authSecret);

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: urgency,
      Authorization: buildVapidHeader(subscription.endpoint, vapid)
    },
    body: encrypted
  });

  const gone = res.status === 404 || res.status === 410;
  let respBody;
  if (!res.ok) respBody = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, gone, body: respBody };
}

/* ---- RFC 8291 §5 self-test ---- */
function selfTest() {
  const authSecret = Buffer.from("BTBZMqHH6r4Tts7J_aSIgg", "base64url");
  const uaPublicRaw = Buffer.from(
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    "base64url"
  );
  // Application-server private key from the RFC example (raw 32-byte scalar) →
  // build a KeyObject via JWK so we can drive the deterministic vector.
  const d = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
  const asPubExample = Buffer.from(
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
    "base64url"
  );
  const asPrivateKey = crypto.createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d,
      x: asPubExample.subarray(1, 33).toString("base64url"),
      y: asPubExample.subarray(33, 65).toString("base64url")
    },
    format: "jwk"
  });
  const salt = Buffer.from("DGv6ra1nlYgDCS1FRnbzlw", "base64url");
  const plaintext = Buffer.from("When I grow up, I want to be a watermelon", "utf8");

  const out = encryptPayload(plaintext, uaPublicRaw, authSecret, { asPrivateKey, salt });
  const expected =
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";
  const got = out.toString("base64url");
  if (got === expected) {
    console.log("RFC 8291 self-test: PASS");
    process.exit(0);
  } else {
    console.error("RFC 8291 self-test: FAIL");
    console.error("expected:", expected);
    console.error("got     :", got);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) selfTest();
