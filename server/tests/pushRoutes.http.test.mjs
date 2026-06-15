/**
 * HTTP-level test for the push routes (auth gate, secret gate, subscribe → store
 * → dispatch). Mounts handlePushRoute directly so it doesn't depend on the rest
 * of handleApi.js. Run: node --test server/tests/pushRoutes.http.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "inkling-pushhttp-"));
process.env.DATA_DIR = tmp;
process.env.JWT_SECRET = "test-jwt-secret";
process.env.PUSH_RUN_SECRET = "run-secret";
process.env.VAPID_SUBJECT = "mailto:test@example.com";
{
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  process.env.VAPID_PUBLIC_KEY = spki.subarray(spki.length - 65).toString("base64url");
  process.env.VAPID_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url");
}

const { handlePushRoute } = await import("../routes/pushRoutes.js");
const { signToken } = await import("../lib/cryptoAuth.js");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const handled = await handlePushRoute(req, res, url);
  if (!handled) {
    res.writeHead(404);
    res.end("nope");
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

function req(method, p, { token, secret, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (secret) headers["X-Push-Secret"] = secret;
  return fetch(`${base}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

function receiverKeys() {
  const { publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  return { p256dh: spki.subarray(spki.length - 65).toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") };
}

test("vapid-public is public", async () => {
  const r = await req("GET", "/api/push/vapid-public");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).publicKey, process.env.VAPID_PUBLIC_KEY);
});

test("run requires the secret", async () => {
  assert.equal((await req("POST", "/api/push/run", { secret: "wrong" })).status, 403);
  assert.equal((await req("POST", "/api/push/run", { secret: "run-secret" })).status, 200);
});

test("subscribe requires auth", async () => {
  assert.equal((await req("POST", "/api/push/subscribe")).status, 401);
});

test("subscribe → schedule → run delivers a push", async () => {
  const mock = [];
  const pushSrv = http.createServer((rq, rs) => {
    rq.on("data", () => {});
    rq.on("end", () => {
      mock.push(rq.headers["content-encoding"]);
      rs.writeHead(201);
      rs.end();
    });
  });
  await new Promise((r) => pushSrv.listen(0, r));
  const endpoint = `http://127.0.0.1:${pushSrv.address().port}/p`;
  const token = signToken("user@test.dev");

  const sub = await req("POST", "/api/push/subscribe", {
    token,
    body: { subscription: { endpoint, keys: receiverKeys() }, userAgent: "t" }
  });
  assert.equal(sub.status, 201);

  const sched = await req("PUT", "/api/push/schedules", {
    token,
    body: { schedules: [{ id: "a:final", fireAt: Date.now() - 500, title: "Hi", body: "now", kind: "alarm" }] }
  });
  assert.equal(sched.status, 200);
  assert.equal((await sched.json()).count, 1);

  const run = await req("POST", "/api/push/run", { secret: "run-secret" });
  const result = await run.json();
  await new Promise((r) => pushSrv.close(r));

  assert.equal(result.sent, 1);
  assert.deepEqual(mock, ["aes128gcm"]);
});

test.after(async () => {
  await new Promise((r) => server.close(r));
  await fs.rm(tmp, { recursive: true, force: true });
});
