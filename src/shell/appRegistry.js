/**
 * Inkling shell — host registry for optional satellite apps.
 *
 * The 3D calendar (walls, writer, reader, Inkling assistant) is the main experience.
 * Satellite entries open in floating app panels from the launcher dock.
 */
export const SHELL_APPS = [
  {
    id: "notebook-calendar",
    title: "Notebook Calendar",
    description: "Mini month picker and shortcuts into the 3D notebook calendar.",
    icon: "/icons/notebookcalender.svg",
    loader: () => import("../apps/notebook-calendar/index.js")
  },
  {
    id: "wordweaver",
    title: "WordWeaver",
    description: "Visual thought-weaving — notes, calendar, and AI insights in 3D layout modes.",
    icon: "/icons/wordweaver.svg",
    loader: () => import("../apps/wordweaver/index.js")
  }
];
