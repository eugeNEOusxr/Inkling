import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..", "..");
// User-account store. Defaults to the repo's data/users, but can be redirected
// to a mounted PERSISTENT DISK (e.g. a Render disk) via DATA_DIR or DATA_ROOT so
// accounts survive redeploys/restarts.
export const DATA_DIR =
  process.env.DATA_DIR ||
  (process.env.DATA_ROOT
    ? path.join(process.env.DATA_ROOT, "users")
    : path.join(ROOT, "data", "users"));
export const PORT = Number(process.env.PORT) || 3080;
export const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
