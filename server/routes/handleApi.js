import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  generateResetToken,
  hashResetToken,
  resetExpiresAt
} from "../lib/cryptoAuth.js";
import {
  readUser,
  writeUser,
  findByUsername,
  isValidUsername,
  emailNickname,
  ensureDataDir,
  storeMode
} from "../lib/userStore.js";
import { sendMail } from "../lib/email/EmailService.js";
import { rateLimit, clientIp } from "../lib/rateLimit.js";
import { appendAudit } from "../lib/audit.js";
import { APP_URL } from "../lib/config.js";
import {
  generateWordWeaverRemarks,
  hashDayContext,
  getCachedRemarks,
  setCachedRemarks
} from "../lib/wordweaver/generateRemarks.js";
import { generateInklingChat } from "../lib/inkling/generateInklingChat.js";
import { extractConceptsLLM } from "../lib/inkling/extractConcepts.js";
import { generateStudyMapLLM } from "../lib/inkling/studyMap.js";
import { generateFlashcardsLLM } from "../lib/inkling/flashcards.js";
import { generateQuizSetLLM } from "../lib/inkling/quizSet.js";
import { explainLLM, gradeLLM } from "../lib/inkling/tutor.js";
import { allowAiUse } from "../lib/inkling/usageCap.js";
import { handlePushRoute } from "./pushRoutes.js";
import crypto from "node:crypto";

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data)
  });
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getBearer(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

function requireInklingHeader(req) {
  const h = req.headers["x-inkling-client"] || req.headers["x-requested-with"];
  return h === "Inkling" || h === "XMLHttpRequest" || process.env.NODE_ENV !== "production";
}

function validateEmail(email) {
  return typeof email === "string" && email.includes("@") && email.length < 254;
}

function publicUser(user) {
  return {
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    settings: user.settings,
    createdAt: user.createdAt
  };
}

export async function handleApi(req, res, url) {
  const ip = clientIp(req);
  const rlKey = `${ip}:${url.pathname}`;

  // Web Push alarm routes (subscribe / schedules / test / run). Self-contained.
  if (await handlePushRoute(req, res, url)) return;

  // Diagnostic: reports whether durable Postgres (Neon) is active vs the file
  // fallback. No secrets — just "db" or "file" + whether DATABASE_URL is set.
  if (req.method === "GET" && url.pathname === "/api/health") {
    let store = "file";
    try {
      store = await storeMode();
    } catch {
      /* ignore — report file */
    }
    return json(res, 200, {
      ok: true,
      store,
      dbConfigured: Boolean(process.env.DATABASE_URL)
    });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const limited = rateLimit(rlKey, { limit: 10, windowMs: 60_000 });
    if (!limited.ok) return json(res, 429, { error: "Too many attempts. Try again later." });

    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");
    const username = body.username ? String(body.username).trim() : null;
    const appearancePalette = ["neutral", "masculine", "feminine"].includes(body.appearancePalette)
      ? body.appearancePalette
      : "neutral";

    if (!validateEmail(email) || password.length < 6) {
      return json(res, 400, { error: "Valid email and password (6+ chars) required." });
    }
    if (username && !isValidUsername(username)) {
      return json(res, 400, { error: "Username must be 3–24 letters, numbers, or underscores." });
    }
    if (await readUser(email)) {
      return json(res, 409, { error: "Account already exists. Sign in instead." });
    }
    if (username && (await findByUsername(username))) {
      return json(res, 409, { error: "Username already taken." });
    }

    const passwordHash = await hashPassword(password);
    const user = {
      email,
      username,
      displayName: username || emailNickname(email),
      passwordHash,
      bundle: { version: 2, savedAt: 0 },
      settings: {
        notifications: { enabled: true, sound: true, priority: "normal", quietHours: null },
        theme: { mode: "dark", appearancePalette },
        ai: { proactive: true }
      },
      notificationSchedules: [],
      notificationHistory: [],
      feedback: [],
      resetTokens: [],
      auditLog: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await appendAudit(user, "register", { ip });
    await writeUser(user);
    const token = signToken(email);
    return json(res, 201, { token, user: publicUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const limited = rateLimit(rlKey, { limit: 20, windowMs: 60_000 });
    if (!limited.ok) return json(res, 429, { error: "Too many attempts." });

    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    // Accept an email OR a username as the login identifier.
    const identifier = String(body.email || body.identifier || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");
    const user = identifier.includes("@")
      ? await readUser(identifier)
      : await findByUsername(identifier);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return json(res, 401, { error: "Invalid login or password." });
    }
    await appendAudit(user, "login", { ip });
    await writeUser(user);
    return json(res, 200, { token: signToken(user.email), user: publicUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/forgot-password") {
    const limited = rateLimit(rlKey, { limit: 5, windowMs: 60_000 });
    if (!limited.ok) return json(res, 429, { error: "Too many requests." });

    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const user = await readUser(email);
    if (user) {
      const token = generateResetToken();
      const tokenHash = hashResetToken(token);
      user.resetTokens = (user.resetTokens || []).filter((t) => !t.usedAt && t.expiresAt > Date.now());
      user.resetTokens.push({
        tokenHash,
        expiresAt: resetExpiresAt(),
        usedAt: null,
        createdAt: Date.now()
      });
      await appendAudit(user, "forgot_password", { ip });
      await writeUser(user);
      const resetUrl = `${APP_URL}/reset-password.html?token=${encodeURIComponent(token)}`;
      await sendMail({
        to: email,
        subject: "Reset your Inkling password",
        text: `Use this link to reset your password (expires in 30 minutes):\n\n${resetUrl}`,
        html: `<p>Use this link to reset your password (expires in 30 minutes):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`
      });
    }
    return json(res, 200, { ok: true, message: "If that email exists, a reset link was sent." });
  }

  if (req.method === "GET" && url.pathname === "/api/auth/reset-token") {
    const token = url.searchParams.get("token") || "";
    const tokenHash = hashResetToken(token);
    const user = await findUserByResetToken(tokenHash);
    return json(res, 200, { valid: Boolean(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/reset-password") {
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    const token = String(body.token || "");
    const password = String(body.password || "");
    if (password.length < 6) return json(res, 400, { error: "Password must be at least 6 characters." });
    const tokenHash = hashResetToken(token);
    const user = await findUserByResetToken(tokenHash);
    if (!user) return json(res, 400, { error: "Invalid or expired reset link." });
    const entry = user.resetTokens.find((t) => t.tokenHash === tokenHash);
    entry.usedAt = Date.now();
    user.passwordHash = await hashPassword(password);
    user.resetTokens.forEach((t) => {
      if (!t.usedAt) t.usedAt = t.tokenHash === tokenHash ? Date.now() : t.expiresAt;
    });
    await appendAudit(user, "reset_password", { ip });
    await writeUser(user);
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const email = verifyToken(getBearer(req));
    if (!email) return json(res, 401, { error: "Not signed in." });
    const user = await readUser(email);
    if (!user) return json(res, 404, { error: "User not found." });
    return json(res, 200, { user: publicUser(user) });
  }

  // Inkling chat — public so guests get the real LLM too (no login required).
  // Uses the LLM when OPENAI_API_KEY / LLM_API_KEY is set, else a mock provider.
  if (req.method === "POST" && url.pathname === "/api/inkling/chat") {
    const limited = rateLimit(rlKey, { limit: 40, windowMs: 60_000 });
    if (!limited.ok) return json(res, 429, { error: "Too many requests. Slow down a moment." });
    // Paid AI is for signed-in users only — guests get the free local router.
    const aiEmail = verifyToken(getBearer(req));
    if (!aiEmail) return json(res, 200, { reply: null, action: "none", proposal: null, query: null, source: "guest" });
    if (!allowAiUse(aiEmail, "chat")) {
      return json(res, 200, { reply: "You've reached today's AI chat limit — I'll keep using the quick built-in mode. It resets tomorrow.", action: "none", proposal: null, query: null, source: "capped" });
    }
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    try {
      const result = await generateInklingChat({
        message: String(body.message || ""),
        history: Array.isArray(body.history) ? body.history : [],
        referenceDate: body.referenceDate,
        scheduleSummary: body.scheduleSummary,
        userName: body.userName,
        mindSummary: typeof body.mindSummary === "string" ? body.mindSummary.slice(0, 2000) : ""
      });
      return json(res, 200, result);
    } catch (err) {
      console.warn("[inkling/chat] route error:", err?.message || err);
      return json(res, 200, { reply: "Inkling's AI is unavailable right now.", action: "none", source: "error" });
    }
  }

  // Mind graph: LLM concept extraction (public, like chat). Returns empty when
  // the server has no ANTHROPIC_API_KEY — the client falls back to local lexicon.
  if (req.method === "POST" && url.pathname === "/api/inkling/extract") {
    const limited = rateLimit(rlKey, { limit: 30, windowMs: 60_000 });
    if (!limited.ok) return json(res, 429, { error: "Too many requests." });
    // Signed-in only + daily cap; guests/over-cap fall back to the local lexicon.
    const aiEmail = verifyToken(getBearer(req));
    if (!aiEmail) return json(res, 200, { concepts: [], relations: [], source: "guest" });
    if (!allowAiUse(aiEmail, "extract")) return json(res, 200, { concepts: [], relations: [], source: "capped" });
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    try {
      const result = await extractConceptsLLM(String(body.text || ""));
      return json(res, 200, result || { concepts: [], relations: [], source: "none" });
    } catch (err) {
      console.warn("[inkling/extract] route error:", err?.message || err);
      return json(res, 200, { concepts: [], relations: [], source: "error" });
    }
  }

  // Study Map: Haiku turns a topic into a learning hierarchy. Signed-in + capped.
  if (req.method === "POST" && url.pathname === "/api/inkling/studymap") {
    const limited = rateLimit(rlKey, { limit: 12, windowMs: 60_000 });
    if (!limited.ok) return json(res, 429, { error: "Too many requests." });
    const aiEmail = verifyToken(getBearer(req));
    if (!aiEmail) return json(res, 200, { source: "guest" });
    if (!allowAiUse(aiEmail, "studymap")) return json(res, 200, { source: "capped" });
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    try {
      const result = await generateStudyMapLLM(String(body.topic || ""));
      return json(res, 200, result || { source: "none" });
    } catch (err) {
      console.warn("[inkling/studymap] route error:", err?.message || err);
      return json(res, 200, { source: "error" });
    }
  }

  // Flashcards: Haiku turns a topic/section into a Q&A deck. Signed-in + capped.
  if (req.method === "POST" && url.pathname === "/api/inkling/flashcards") {
    const limited = rateLimit(rlKey, { limit: 15, windowMs: 60_000 });
    if (!limited.ok) return json(res, 429, { error: "Too many requests." });
    const aiEmail = verifyToken(getBearer(req));
    if (!aiEmail) return json(res, 200, { source: "guest" });
    if (!allowAiUse(aiEmail, "flashcards")) return json(res, 200, { source: "capped" });
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    try {
      const result = await generateFlashcardsLLM({
        topic: String(body.topic || ""),
        section: body.section ? String(body.section) : "",
        terms: Array.isArray(body.terms) ? body.terms : []
      });
      return json(res, 200, result || { source: "none" });
    } catch (err) {
      console.warn("[inkling/flashcards] route error:", err?.message || err);
      return json(res, 200, { source: "error" });
    }
  }

  // Quiz set: Haiku turns a topic/section into a GRADED quiz deck (quiz.html
  // schema). Signed-in + capped, same as flashcards.
  if (req.method === "POST" && url.pathname === "/api/inkling/quiz-set") {
    const limited = rateLimit(rlKey, { limit: 15, windowMs: 60_000 });
    if (!limited.ok) return json(res, 429, { error: "Too many requests." });
    const aiEmail = verifyToken(getBearer(req));
    if (!aiEmail) return json(res, 200, { source: "guest" });
    if (!allowAiUse(aiEmail, "flashcards")) return json(res, 200, { source: "capped" });
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    try {
      const result = await generateQuizSetLLM({
        topic: String(body.topic || ""),
        section: body.section ? String(body.section) : "",
        terms: Array.isArray(body.terms) ? body.terms : [],
        difficulty: ["easy", "medium", "hard"].includes(body.difficulty) ? body.difficulty : ""
      });
      return json(res, 200, result || { source: "none" });
    } catch (err) {
      console.warn("[inkling/quiz-set] route error:", err?.message || err);
      return json(res, 200, { source: "error" });
    }
  }

  // Tutor: worked step-by-step explanation for a quiz question (+ follow-ups).
  if (req.method === "POST" && url.pathname === "/api/inkling/explain") {
    const limited = rateLimit(rlKey, { limit: 30, windowMs: 60_000 });
    if (!limited.ok) return json(res, 429, { error: "Too many requests." });
    const aiEmail = verifyToken(getBearer(req));
    if (!aiEmail) return json(res, 200, { source: "guest" });
    if (!allowAiUse(aiEmail, "chat")) return json(res, 200, { source: "capped" });
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    try {
      const result = await explainLLM({
        question: String(body.question || ""),
        answer: body.answer != null ? String(body.answer) : "",
        history: Array.isArray(body.history) ? body.history : null,
        mode: ["nudge", "step"].includes(body.mode) ? body.mode : ""
      });
      return json(res, 200, result || { source: "none" });
    } catch (err) {
      console.warn("[inkling/explain] route error:", err?.message || err);
      return json(res, 200, { source: "error" });
    }
  }

  // LLM-assisted grading for short free-text answers (synonyms / phrasing).
  if (req.method === "POST" && url.pathname === "/api/inkling/grade") {
    const limited = rateLimit(rlKey, { limit: 40, windowMs: 60_000 });
    if (!limited.ok) return json(res, 429, { error: "Too many requests." });
    const aiEmail = verifyToken(getBearer(req));
    if (!aiEmail) return json(res, 200, { source: "guest" });
    if (!allowAiUse(aiEmail, "chat")) return json(res, 200, { source: "capped" });
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    try {
      const result = await gradeLLM({
        question: String(body.question || ""),
        expected: body.expected != null ? String(body.expected) : "",
        given: String(body.given || "")
      });
      return json(res, 200, result || { source: "none" });
    } catch (err) {
      console.warn("[inkling/grade] route error:", err?.message || err);
      return json(res, 200, { source: "error" });
    }
  }

  const email = verifyToken(getBearer(req));
  if (!email) return json(res, 401, { error: "Not signed in." });

  let user = await readUser(email);
  if (!user) return json(res, 404, { error: "User not found." });

  if (req.method === "PUT" && url.pathname === "/api/auth/profile") {
    if (!requireInklingHeader(req)) return json(res, 403, { error: "Invalid request." });
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    if (body.username !== undefined) {
      const username = body.username ? String(body.username).trim() : null;
      if (username && !isValidUsername(username)) {
        return json(res, 400, { error: "Invalid username." });
      }
      if (username) {
        const taken = await findByUsername(username);
        if (taken && taken.email !== email) {
          return json(res, 409, { error: "Username already taken." });
        }
      }
      user.username = username;
      if (!body.displayName) user.displayName = username || emailNickname(email);
    }
    if (body.displayName !== undefined) {
      user.displayName = String(body.displayName).trim() || emailNickname(email);
    }
    await appendAudit(user, "profile_update", { ip });
    await writeUser(user);
    return json(res, 200, { user: publicUser(user) });
  }

  if (req.method === "PUT" && url.pathname === "/api/auth/settings") {
    if (!requireInklingHeader(req)) return json(res, 403, { error: "Invalid request." });
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "Invalid JSON" });
    if (body.notifications) user.settings.notifications = { ...user.settings.notifications, ...body.notifications };
    if (body.theme) user.settings.theme = { ...user.settings.theme, ...body.theme };
    if (body.ai) user.settings.ai = { ...user.settings.ai, ...body.ai };
    if (body.wordweaver) {
      user.settings.wordweaver = {
        ...(user.settings.wordweaver || {}),
        ...body.wordweaver
      };
    }
    await appendAudit(user, "settings_update", { ip });
    await writeUser(user);
    return json(res, 200, { settings: user.settings });
  }

  if (req.method === "GET" && url.pathname === "/api/sync") {
    return json(res, 200, { bundle: user.bundle ?? { version: 2, savedAt: 0 } });
  }

  if (req.method === "PUT" && url.pathname === "/api/sync") {
    const body = await readBody(req);
    if (!body?.bundle) return json(res, 400, { error: "Missing bundle" });
    user.bundle = { ...body.bundle, savedAt: Date.now(), version: 2 };
    await writeUser(user);
    return json(res, 200, { ok: true, savedAt: user.bundle.savedAt });
  }

  if (req.method === "GET" && url.pathname === "/api/notifications/schedules") {
    return json(res, 200, { schedules: user.notificationSchedules ?? [] });
  }

  if (req.method === "PUT" && url.pathname === "/api/notifications/schedules") {
    const body = await readBody(req);
    if (!Array.isArray(body?.schedules)) return json(res, 400, { error: "schedules array required" });
    user.notificationSchedules = body.schedules;
    await writeUser(user);
    return json(res, 200, { schedules: user.notificationSchedules });
  }

  if (req.method === "GET" && url.pathname === "/api/notifications/history") {
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
    const history = (user.notificationHistory ?? []).slice(-limit);
    return json(res, 200, { history });
  }

  if (req.method === "POST" && url.pathname === "/api/notifications/history") {
    const body = await readBody(req);
    if (!body?.entry) return json(res, 400, { error: "entry required" });
    user.notificationHistory = user.notificationHistory || [];
    user.notificationHistory.push({
      id: body.entry.id || crypto.randomUUID(),
      ...body.entry,
      createdAt: body.entry.createdAt || Date.now()
    });
    if (user.notificationHistory.length > 500) {
      user.notificationHistory = user.notificationHistory.slice(-500);
    }
    await writeUser(user);
    return json(res, 201, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/api/wordweaver/remarks") {
    const limited = rateLimit(`${rlKey}:ww-remarks`, { limit: 12, windowMs: 60_000 });
    if (!limited.ok) return json(res, 429, { error: "Too many remark requests. Try again shortly." });
    if (!requireInklingHeader(req)) return json(res, 403, { error: "Invalid request." });

    const body = await readBody(req);
    if (!body?.dayContext?.date) return json(res, 400, { error: "dayContext with date required" });

    const dayContext = body.dayContext;
    const date = String(dayContext.date).slice(0, 10);
    const contextHash = hashDayContext(dayContext);
    const force = Boolean(body.refresh);

    if (!force) {
      const cached = getCachedRemarks(user, date, contextHash);
      if (cached) {
        return json(res, 200, {
          remarks: cached.remarks,
          source: cached.source,
          cached: true
        });
      }
    }

    const { remarks, source } = await generateWordWeaverRemarks(dayContext);
    setCachedRemarks(user, date, contextHash, { remarks, source });
    await writeUser(user);

    return json(res, 200, { remarks, source, cached: false });
  }

  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const body = await readBody(req);
    if (!body?.rating) return json(res, 400, { error: "rating required" });
    const allowed = ["helpful", "thumbs_up", "thumbs_down", "incorrect", "incomplete", "confusing", "other"];
    const rating = String(body.rating);
    if (!allowed.includes(rating) && rating !== "up" && rating !== "down") {
      return json(res, 400, { error: "Invalid rating." });
    }
    user.feedback = user.feedback || [];
    const record = {
      id: crypto.randomUUID(),
      conversationId: body.conversationId ?? null,
      messageId: body.messageId ?? null,
      rating: rating === "up" ? "thumbs_up" : rating === "down" ? "thumbs_down" : rating,
      category: body.category ?? null,
      comment: body.comment ? String(body.comment).slice(0, 2000) : null,
      createdAt: Date.now()
    };
    user.feedback.push(record);
    if (user.feedback.length > 300) user.feedback = user.feedback.slice(-300);
    await writeUser(user);
    return json(res, 201, { feedback: record });
  }

  if (req.method === "GET" && url.pathname === "/api/feedback/summary") {
    const fb = user.feedback ?? [];
    const summary = {
      total: fb.length,
      thumbsUp: fb.filter((f) => f.rating === "thumbs_up" || f.rating === "helpful").length,
      thumbsDown: fb.filter((f) => f.rating === "thumbs_down").length,
      incorrect: fb.filter((f) => f.category === "incorrect" || f.rating === "incorrect").length,
      incomplete: fb.filter((f) => f.category === "incomplete" || f.rating === "incomplete").length,
      confusing: fb.filter((f) => f.category === "confusing" || f.rating === "confusing").length
    };
    return json(res, 200, { summary, recent: fb.slice(-20).reverse() });
  }

  return json(res, 404, { error: "Not found" });
}

async function listAllUsers() {
  const { ensureDataDir } = await import("../lib/userStore.js");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { DATA_DIR } = await import("../lib/config.js");
  await ensureDataDir();
  const files = await fs.readdir(DATA_DIR);
  const users = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(await fs.readFile(path.join(DATA_DIR, file), "utf8"));
      users.push(await readUser(raw.email));
    } catch {
      /* skip */
    }
  }
  return users.filter(Boolean);
}

async function findUserByResetToken(tokenHash) {
  const users = await listAllUsers();
  for (const user of users) {
    const match = user.resetTokens?.find(
      (t) => t.tokenHash === tokenHash && !t.usedAt && t.expiresAt > Date.now()
    );
    if (match) return user;
  }
  return null;
}
