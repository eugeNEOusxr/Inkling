import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..", "..");
export const DATA_DIR = path.join(ROOT, "data", "users");
export const PORT = Number(process.env.PORT) || 3080;
export const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
