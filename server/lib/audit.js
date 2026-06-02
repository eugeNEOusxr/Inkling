import crypto from "node:crypto";

/**
 * @param {import('./userStore.js').readUser extends Function ? Awaited<ReturnType<import('./userStore.js').readUser>> : object} user
 * @param {string} action
 * @param {{ ip?: string, meta?: object }} ctx
 */
export async function appendAudit(user, action, ctx = {}) {
  if (!user) return;
  user.auditLog = user.auditLog || [];
  user.auditLog.push({
    id: crypto.randomUUID(),
    action,
    ip: ctx.ip ?? null,
    meta: ctx.meta ?? null,
    createdAt: Date.now()
  });
  if (user.auditLog.length > 200) {
    user.auditLog = user.auditLog.slice(-200);
  }
}
