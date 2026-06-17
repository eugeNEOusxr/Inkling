/**
 * Inkling welcome copy for settings / first-run (static; can wire to model later).
 * @param {string} displayName
 */
export function getInklingWelcomeMessage(displayName) {
  const who = displayName || "friend";
  return (
    `Hey ${who} — I'm Inkling. Think of me as the friend who also happens to run your calendar ` +
    `and quietly keeps a map of what matters to you. We can just talk, or you can put me to work.\n\n` +
    `Here's where I live, matching the icons at the bottom:\n` +
    `• Calendar — your days as 3D month worlds you can fly through.\n` +
    `• Schedule — the hour-by-hour timeline where every note becomes a glowing point on the day.\n` +
    `• Alerts & Alarm — reminders that find you, plus a full alarm clock.\n` +
    `• 🧠 Mind — as we talk, I map the ideas you mention into nodes and draw connections between ` +
    `the ones that go together. Tap Mind anytime to see what I'm noticing — your thoughts as a living web.\n` +
    `• Goals — what you're working toward, tied back to your days.\n\n` +
    `So just tell me what's on your mind — your day, what you're studying, an idea you're chewing on — ` +
    `and I'll both help with it and weave it into your Mind. Describe a plan in plain words ` +
    `("lunch with Sam Thursday at 1") and I'll set it up, always checking before I save. Or just say hi.`
  );
}
