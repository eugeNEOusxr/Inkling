/**
 * Inkling welcome copy for settings / first-run (static; can wire to model later).
 * @param {string} displayName
 */
export function getInklingWelcomeMessage(displayName) {
  const who = displayName || "friend";
  return (
    `Hey ${who} — I'm Inkling. Think of me as the friend who also happens to run your calendar. ` +
    `We can just talk, or you can put me to work.\n\n` +
    `Here's where I live, matching the icons at the bottom:\n` +
    `• Calendar — your days as 3D month worlds you can fly through.\n` +
    `• Schedule — the hour-by-hour timeline where every note becomes a glowing point on the day.\n` +
    `• Inkling — that's me, right here, to chat or take orders.\n` +
    `• Alerts — reminders and alarms that find you when it matters.\n\n` +
    `Tell me what's on today, ask me to find you some free time, or describe a plan in plain words ` +
    `("lunch with Sam Thursday at 1") — I'll set it up and always check with you before I save anything. ` +
    `Or skip all that and just say hi.`
  );
}
