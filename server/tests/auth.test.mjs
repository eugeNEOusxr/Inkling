import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  generateResetToken,
  hashResetToken
} from "../lib/cryptoAuth.js";
import { isValidUsername, emailNickname } from "../lib/userStore.js";

test("password hash roundtrip", async () => {
  const hash = await hashPassword("test-password-123");
  assert.ok(await verifyPassword("test-password-123", hash));
  assert.equal(await verifyPassword("wrong", hash), false);
});

test("token sign and verify", () => {
  const token = signToken("user@example.com", "test-secret");
  assert.equal(verifyToken(token, "test-secret"), "user@example.com");
  assert.equal(verifyToken(token, "wrong-secret"), null);
});

test("reset token hash stable", () => {
  const t = generateResetToken();
  assert.equal(hashResetToken(t), hashResetToken(t));
});

test("username validation", () => {
  assert.ok(isValidUsername("inkling_user"));
  assert.ok(isValidUsername(null));
  assert.equal(isValidUsername("ab"), false);
});

test("email nickname", () => {
  assert.equal(emailNickname("jane.doe@example.com"), "Jane Doe");
});
