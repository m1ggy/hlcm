#!/usr/bin/env bash
# One-time (re-runnable) step that turns on row-level security for real:
# creates the restricted `hclm_app` role and prints the two connection
# strings to put in .env.production. Until the app connects as this role,
# the RLS policies exist but don't bind anything (the owner is exempt).
#
# Run on the droplet from the deploy directory (the deploy workflow syncs
# this script and app-db-role.sql there):
#   cd /opt/hclm-app
#   bash setup-app-db-role.sh
#
# Then in .env.production:
#   SYSTEM_DATABASE_URL=<the current DATABASE_URL>   (owner: migrations, cross-org code)
#   DATABASE_URL=<the printed app URL>
# and restart: docker compose up -d app
# Roll back by setting DATABASE_URL back to the owner URL and restarting.
set -euo pipefail
cd "$(dirname "$0")"

ROLE="${APP_DB_ROLE:-hclm_app}"
pg() { docker compose exec -T postgres "$@"; }

OWNER="$(pg printenv POSTGRES_USER | tr -d '\r')"
DB="$(pg printenv POSTGRES_DB | tr -d '\r')"
PASSWORD="${APP_DB_PASSWORD:-$(openssl rand -hex 24)}"

pg psql -U "$OWNER" -d "$DB" -v ON_ERROR_STOP=1 \
  -v role="$ROLE" -v password="$PASSWORD" -v owner="$OWNER" -v dbname="$DB" \
  -f - < app-db-role.sql > /dev/null

LIVE_URL="$(grep '^DATABASE_URL=' .env.production | head -n1 | cut -d= -f2- | tr -d '"'"'"'\r')"
# Same host/db/params as the current URL, with the app role's credentials.
APP_URL="$(printf '%s' "$LIVE_URL" | sed -E "s#^(postgres(ql)?://)[^@]*@#\\1${ROLE}:${PASSWORD}@#")"

echo "Role ${ROLE} is ready. Set these in .env.production, then: docker compose up -d app"
echo "  SYSTEM_DATABASE_URL=${LIVE_URL}"
echo "  DATABASE_URL=${APP_URL}"
