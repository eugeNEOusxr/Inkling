/**
 * Inkling welcome copy for settings / first-run (static; can wire to model later).
 * @param {string} displayName
 */
export function getInklingWelcomeMessage(displayName) {
  const who = displayName || "friend";
  return (
    `Welcome, ${who}. I'm Inkling — your calendar whisperer in this space.\n\n` +
    `Inkling helps you see your days in three layers: the 3D month calendars behind you, ` +
    `the Notebook Writer timeline for hour-by-hour notes, and WordWeaver for your 3D thought-weaving space. ` +
    `Ask me what's on your schedule, find free time, or describe an appointment in plain language — I'll propose changes and wait for your confirmation before anything is saved.`
  );
}
