import { apiFetch } from "./cloudSync.js";
import { getSession, setSession } from "./session.js";

const PROFILE_KEY = "inkling:userProfile";

export function getLocalProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocalProfile(user) {
  if (!user) return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(user));
  const session = getSession();
  if (session) setSession({ ...session, user });
}

export async function fetchMe() {
  const { user } = await apiFetch("/api/auth/me");
  saveLocalProfile(user);
  return user;
}

export async function updateProfile({ username, displayName }) {
  const { user } = await apiFetch("/api/auth/profile", {
    method: "PUT",
    body: JSON.stringify({ username, displayName })
  });
  saveLocalProfile(user);
  return user;
}

export async function updateSettings(partial) {
  const { settings } = await apiFetch("/api/auth/settings", {
    method: "PUT",
    body: JSON.stringify(partial)
  });
  const session = getSession();
  if (session?.user) {
    session.user.settings = settings;
    setSession(session);
  }
  return settings;
}

export async function submitFeedback({ rating, category, comment, conversationId, messageId }) {
  return apiFetch("/api/feedback", {
    method: "POST",
    body: JSON.stringify({ rating, category, comment, conversationId, messageId })
  });
}

export async function fetchFeedbackSummary() {
  return apiFetch("/api/feedback/summary");
}

export function displayNameForUser(user) {
  if (!user) {
    const session = getSession();
    user = session?.user || getLocalProfile();
  }
  if (user?.displayName) return user.displayName;
  if (user?.username) return user.username;
  const email = user?.email || getSession()?.email || "";
  const local = email.split("@")[0] || "there";
  return local.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
