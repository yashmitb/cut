import postgres from "postgres";

// Single-user app — everything is keyed to one fixed id.
export const USER_ID = "me";

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL;

declare global {
  // reuse the connection across hot reloads in dev
  // eslint-disable-next-line no-var
  var __sql: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __schemaReady: Promise<void> | undefined;
}

function makeClient() {
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (see README) — any Postgres works (Neon, Supabase, Vercel Postgres)."
    );
  }
  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  return postgres(url, {
    ssl: isLocal ? false : "require",
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
  });
}

// Lazily create the real client on first use so that simply *importing* this
// module (which Next does at build time to read route config) never requires
// DATABASE_URL — only an actual query does.
function client(): ReturnType<typeof postgres> {
  if (!global.__sql) global.__sql = makeClient();
  return global.__sql;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sql: ReturnType<typeof postgres> = new Proxy(function () {} as any, {
  apply(_t, _thisArg, args) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (client() as any)(...args);
  },
  get(_t, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = (client() as any)[prop];
    return typeof v === "function" ? v.bind(client()) : v;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

/** Creates tables on first use. Idempotent. */
export function ensureSchema(): Promise<void> {
  if (!global.__schemaReady) {
    global.__schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS profile (
          id              TEXT PRIMARY KEY,
          name            TEXT,
          age             INT  NOT NULL,
          sex             TEXT NOT NULL,
          height_cm       REAL NOT NULL,
          weight_kg       REAL NOT NULL,
          goal_weight_kg  REAL NOT NULL,
          activity        TEXT NOT NULL,
          rate            TEXT NOT NULL,
          units           TEXT NOT NULL DEFAULT 'imperial',
          target_calories INT  NOT NULL,
          target_protein  INT  NOT NULL,
          target_carbs    INT  NOT NULL,
          target_fat      INT  NOT NULL,
          target_fiber    INT  NOT NULL,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS food_logs (
          id          BIGSERIAL PRIMARY KEY,
          user_id     TEXT NOT NULL,
          log_date    DATE NOT NULL,
          name        TEXT NOT NULL,
          quantity    TEXT NOT NULL DEFAULT '',
          calories    REAL NOT NULL DEFAULT 0,
          protein     REAL NOT NULL DEFAULT 0,
          carbs       REAL NOT NULL DEFAULT 0,
          fat         REAL NOT NULL DEFAULT 0,
          fiber       REAL NOT NULL DEFAULT 0,
          sugar       REAL NOT NULL DEFAULT 0,
          sodium      REAL NOT NULL DEFAULT 0,
          confidence  REAL,
          meal        TEXT NOT NULL DEFAULT 'snack',
          source      TEXT NOT NULL DEFAULT 'manual',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await sql`ALTER TABLE food_logs ADD COLUMN IF NOT EXISTS meal TEXT NOT NULL DEFAULT 'snack'`;
      await sql`CREATE INDEX IF NOT EXISTS food_logs_date_idx ON food_logs (user_id, log_date)`;
      await sql`
        CREATE TABLE IF NOT EXISTS weight_logs (
          id         BIGSERIAL PRIMARY KEY,
          user_id    TEXT NOT NULL,
          log_date   DATE NOT NULL,
          weight_kg  REAL NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (user_id, log_date)
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS corrections (
          id         BIGSERIAL PRIMARY KEY,
          user_id    TEXT NOT NULL,
          food       TEXT NOT NULL,
          note       TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS water_logs (
          user_id  TEXT NOT NULL,
          log_date DATE NOT NULL,
          ml       INT  NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, log_date)
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS app_settings (
          id             TEXT PRIMARY KEY,
          gemini_api_key TEXT,
          gemini_model   TEXT,
          updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )`;
    })().catch((e) => {
      // allow retry on next request if the very first init failed
      global.__schemaReady = undefined;
      throw e;
    });
  }
  return global.__schemaReady;
}
