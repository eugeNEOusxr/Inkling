/**
 * Integration test for the Web Push dispatch pipeline:
 *   subscription store → scheduler.runDuePushes → encrypted POST to endpoint.
 * Uses a local mock push endpoint (it can't decrypt — we just assert the POST
 * shape) and a real receiver P-256 keypair so encryptPayload runs for real.
 *
 *   node --test server/tests/pushDispatch.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

// Point the store at a throwaway dir BEFORE importing modules that read config.
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "inkling-push-"));
process.env.DATA_DIR = tmp;
process.env.VAPID_SUBJECT = "mailto:test@example.com";

// Generate a real VAPID keypair for the test.
{
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  process.env.VAPID_PUBLIC_KEY = spki.subarray(spki.length - 65).toString("base64url");
  process.env.VAPID_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url");
}

const { addSubscription, setSchedules, readPush } = await import("../lib/push/pushStore.js");
const { runDuePushes } = await import("../lib/push/scheduler.js");

function makeReceiverKeys() {
  const { publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const spki = publicKey.export({ type: "spki", format: "der" });
  return {
    p256dh: spki.subarray(spki.length - 65).toString("base64url"),
    auth: crypto.randomBytes(16).toString("base64url")
  };
}

test("runDuePushes sends a correctly-shaped push for a due schedule", async () => {
  const received = [];
  const mock = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({
        method: req.method,
        headers: req.headers,
        bodyLen: Buffer.concat(chunks).length
      });
      res.writeHead(201);
      res.end();
    });
  });
  await new Promise((r) => mock.listen(0, r));
  const endpoint = `http://127.0.0.1:${mock.address().port}/push/abc`;

  const email = "alarm@test.dev";
  await addSubscription(email, { endpoint, keys: makeReceiverKeys() }, "test-agent");
  await setSchedules(email, [
    { id: "evt-1:final", fireAt: Date.now() - 1000, title: "Wake up", body: "7:00 AM", kind: "alarm" },
    { id: "evt-2:final", fireAt: Date.now() + 60 * 60 * 1000, title: "Later", body: "future", kind: "alarm" }
  ]);

  const result = await runDuePushes();
  await new Promise((r) => mock.close(r));

  assert.equal(result.sent, 1, "exactly one due push sent");
  assert.equal(received.length, 1, "mock endpoint got one POST");
  const req = received[0];
  assert.equal(req.method, "POST");
  assert.equal(req.headers["content-encoding"], "aes128gcm");
  assert.match(req.headers["authorization"] || "", /^vapid t=.+, k=.+/);
  assert.ok(req.bodyLen > 86, "encrypted body present (header + ciphertext)");

  // The fired schedule is marked sent; the future one is not.
  const rec = await readPush(email);
  assert.ok(rec.sent["evt-1:final"], "due item marked sent");
  assert.ok(!rec.sent["evt-2:final"], "future item not sent");

  // Idempotent: a second run sends nothing more.
  const again = await runDuePushes();
  assert.equal(again.sent, 0, "no duplicate send on second sweep");
});

test("a 410 Gone response prunes the dead subscription", async () => {
  const mock = http.createServer((req, res) => {
    res.writeHead(410);
    res.end();
  });
  await new Promise((r) => mock.listen(0, r));
  const endpoint = `http://127.0.0.1:${mock.address().port}/gone`;

  const email = "gone@test.dev";
  await addSubscription(email, { endpoint, keys: makeReceiverKeys() }, "test-agent");
  await setSchedules(email, [{ id: "g:final", fireAt: Date.now() - 1000, title: "x", body: "y", kind: "alarm" }]);

  const result = await runDuePushes();
  await new Promise((r) => mock.close(r));

  assert.equal(result.pruned, 1, "dead subscription counted as pruned");
  const rec = await readPush(email);
  assert.equal(rec.subscriptions.length, 0, "dead subscription removed");
});

test.after(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});
