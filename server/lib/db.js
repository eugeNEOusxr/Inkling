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
    max: 5,
    // Close our own idle connections before Neon's auto-suspend can drop them
    // out from under us, which shrinks the window for the error below.
    idleTimeoutMillis: 10_000
  });
  // CRITICAL: a pg Pool emits 'error' when an IDLE client dies — e.g. when Neon's
  // free tier auto-suspends and drops the connection. With NO listener, Node
  // treats that as an unhandled 'error' event and CRASHES the whole process;
  // Render then restarts it, resetting any in-flight request so the client sees
  // "Failed to fetch". Handling it here keeps the server alive — the next query
  // just opens a fresh connection (which also wakes Neon).
  _pool.on("error", (err) => {
    console.error("[db] idle pool client error (handled, non-fatal):", err?.message || err);
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
