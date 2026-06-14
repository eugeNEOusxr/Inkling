/**
 * Durable Postgres storage (Neon). Activates ONLY when DATABASE_URL is set;
 * otherwise the app keeps using the file store. `pg` is imported dynamically and
 * every failure degrades gracefully back to files — so a missing dependency or a
 * bad connection can never crash the server or break login.
 */
let _pool = null;
let _ready = null;
let _disabled = false;

export function dbEnabled() {
  return Boolean(process.env.DATABASE_URL) && !_disabled;
}

async function getPool() {
  if (_pool) return _pool;
  const pg = (await import("pg")).default;
  _pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Neon (and most hosted PG) require TLS; don't fail on the cert chain.
    ssl: { rejectUnauthorized: false },
    max: 5
  });
  return _pool;
}

/** Create the users table on first use. Returns false (→ file fallback) on any error. */
export async function ensureDb() {
  if (!dbEnabled()) return false;
  if (_ready) return _ready;
  _ready = (async () => {
    try {
      const pool = await getPool();
      await pool.query(
        `CREATE TABLE IF NOT EXISTS users (
           email TEXT PRIMARY KEY,
           username TEXT,
           data JSONB NOT NULL,
           updated_at BIGINT
         )`
      );
      await pool.query("CREATE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username))");
      console.log("[db] Postgres user store ready.");
      return true;
    } catch (err) {
      console.error("[db] init failed — falling back to file store:", err?.message || err);
      _disabled = true;
      return false;
    }
  })();
  return _ready;
}

export async function query(text, params) {
  const pool = await getPool();
  return pool.query(text, params);
}
