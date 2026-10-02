#!/usr/bin/env bash
# One-command end-to-end check: throwaway Postgres (UTC, like Supabase), fake
# Gemini + push service, production build served in UTC (like Vercel), then
# scripts/e2e/e2e.mjs. Needs Postgres binaries (initdb/pg_ctl) and openssl.
#   npm run test:e2e
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PGBIN="${PGBIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /opt/homebrew/opt/postgresql@*/bin/initdb 2>/dev/null | tail -1)")}"
TMP="$(mktemp -d)"
PORT=55433
PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  "$PGBIN/pg_ctl" -D "$TMP/pg" stop -m fast >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

"$PGBIN/initdb" -D "$TMP/pg" -U postgres --auth=trust >/dev/null
echo "timezone = 'UTC'" >> "$TMP/pg/postgresql.conf"
"$PGBIN/pg_ctl" -D "$TMP/pg" -o "-p $PORT -k ''" -l "$TMP/pg.log" start >/dev/null
DB="postgres://postgres@localhost:$PORT/postgres"

openssl req -x509 -newkey rsa:2048 -nodes -keyout "$TMP/key.pem" -out "$TMP/cert.pem" -days 1 -subj /CN=localhost 2>/dev/null
node scripts/e2e/fakes.cjs "$TMP" & PIDS+=($!)

npx next build >/dev/null
export TZ=UTC DATABASE_URL="$DB" NODE_TLS_REJECT_UNAUTHORIZED=0
GOOGLE_GEMINI_BASE_URL=http://localhost:4600 GEMINI_API_KEY=fake GEMINI_MODEL=gemini-2.5-flash \
  npx next start -p 3012 >"$TMP/app.log" 2>&1 & PIDS+=($!)
GEMINI_API_KEY= npx next start -p 3013 >"$TMP/nokey.log" 2>&1 & PIDS+=($!)
for u in 3012 3013; do curl -s --retry 90 --retry-connrefused --retry-delay 1 -o /dev/null "http://localhost:$u/api/profile"; done

E2E_URL=http://localhost:3012 E2E_NOKEY_URL=http://localhost:3013 E2E_DB="$DB" node scripts/e2e/e2e.mjs
