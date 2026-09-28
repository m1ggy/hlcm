#!/usr/bin/env bash
# Rehearse pending Prisma migrations against a throwaway copy of the live
# database, on the droplet itself — no second server, and PHI never leaves
# the box. Copies the live DB into a scratch database in the same Postgres
# container, runs the given migrator image against the copy, compares
# per-table row counts before/after, then drops the copy.
#
# Run on the droplet, from the deploy directory (the deploy workflow syncs
# this script there next to docker-compose.yml):
#   cd /opt/hclm-app
#   bash rehearse-migration.sh ghcr.io/<owner>/<repo>:migrate-dev-latest
#
# Pass the migrator image that CONTAINS the new migrations (e.g. the dev
# environment's, after merging to dev) — the one in .env is whatever is
# already deployed here, so it has nothing pending.
#
# KEEP_REHEARSAL_DB=1 skips the final drop so the migrated copy can be
# inspected by hand (drop it yourself afterwards — it's a full copy of prod).
# SKIP_PULL=1 uses a locally built image instead of pulling (testing only).
set -euo pipefail

IMAGE="${1:?usage: $0 <migrator-image-with-new-migrations>}"
REHEARSAL_DB="hclm_rehearsal"

cd "$(dirname "$0")"

compose() { docker compose "$@"; }
pg() { compose exec -T postgres "$@"; }

PGUSER_="$(pg printenv POSTGRES_USER | tr -d '\r')"
PGDB_="$(pg printenv POSTGRES_DB | tr -d '\r')"

DATABASE_URL_LIVE="$(grep '^DATABASE_URL=' .env.production | head -n1 | cut -d= -f2- | tr -d '"'"'"'\r')"
if [ -z "$DATABASE_URL_LIVE" ]; then
  echo "DATABASE_URL not found in .env.production" >&2
  exit 1
fi
# Same connection, different database name (last path segment, query kept).
DATABASE_URL_REHEARSAL="$(printf '%s' "$DATABASE_URL_LIVE" | sed -E "s#/([^/?]*)(\?.*)?\$#/${REHEARSAL_DB}\2#")"

WORK="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK"
  if [ "${KEEP_REHEARSAL_DB:-0}" != "1" ]; then
    pg dropdb -U "$PGUSER_" --if-exists "$REHEARSAL_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# One row per base table: "<table> <row count>".
COUNT_SQL="
select table_name || ' ' ||
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> '_prisma_migrations'
order by table_name;"

counts() { pg psql -U "$PGUSER_" -d "$REHEARSAL_DB" -At -v ON_ERROR_STOP=1 -c "$COUNT_SQL" | tr -d '\r'; }

echo "==> Copying live database '$PGDB_' into '$REHEARSAL_DB'"
pg dropdb -U "$PGUSER_" --if-exists "$REHEARSAL_DB"
pg createdb -U "$PGUSER_" "$REHEARSAL_DB"
pg sh -c "pg_dump -U '$PGUSER_' --no-owner '$PGDB_' | psql -q -U '$PGUSER_' -d '$REHEARSAL_DB' -v ON_ERROR_STOP=1" >/dev/null

counts > "$WORK/before.txt"
echo "    $(wc -l < "$WORK/before.txt") tables copied"

APPLIED_SQL="select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null order by 1;"
applied() { pg psql -U "$PGUSER_" -d "$REHEARSAL_DB" -At -v ON_ERROR_STOP=1 -c "$APPLIED_SQL" | tr -d '\r' | sort; }
applied > "$WORK/applied-before.txt"

if [ "${SKIP_PULL:-0}" = "1" ]; then
  echo "==> Using local image $IMAGE (SKIP_PULL=1)"
else
  echo "==> Pulling $IMAGE"
  MIGRATOR_IMAGE="$IMAGE" compose --profile tools pull migrate
fi

echo "==> Running migrations against the copy"
MIGRATOR_IMAGE="$IMAGE" compose --profile tools run --rm -T \
  -e DATABASE_URL="$DATABASE_URL_REHEARSAL" migrate < /dev/null

# Don't trust the migrator's exit code alone: a broken Prisma CLI in the
# image once exited 0 having applied nothing. Every migration shipped in the
# image must now be recorded as applied in the copy.
echo "==> Verifying every migration in the image was applied"
docker run --rm --entrypoint sh "$IMAGE" -c 'ls prisma/migrations' | tr -d '\r' | grep -v '^migration_lock.toml$' | sort > "$WORK/expected.txt"
applied > "$WORK/applied-after.txt"
if [ ! -s "$WORK/expected.txt" ]; then
  echo "==> FAILED: couldn't list prisma/migrations in $IMAGE" >&2
  exit 1
fi
missing="$(comm -23 "$WORK/expected.txt" "$WORK/applied-after.txt")"
if [ -n "$missing" ]; then
  echo "==> FAILED: these migrations are in the image but not applied:" >&2
  printf '    %s\n' $missing >&2
  exit 1
fi
newly="$(comm -13 "$WORK/applied-before.txt" "$WORK/applied-after.txt")"
echo "    $(wc -l < "$WORK/expected.txt") migrations present; applied by this run: $(printf '%s\n' $newly | grep -c . || true)"
printf '      %s\n' $newly

counts > "$WORK/after.txt"

echo "==> Row counts (before -> after)"
status=0
while read -r table after; do
  before="$(awk -v t="$table" '$1 == t { print $2 }' "$WORK/before.txt")"
  if [ -z "$before" ]; then
    echo "    NEW   $table: $after"
  elif [ "$after" -lt "$before" ]; then
    echo "    LOST  $table: $before -> $after"
    status=1
  elif [ "$after" -ne "$before" ]; then
    echo "    GREW  $table: $before -> $after"
  fi
done < "$WORK/after.txt"
while read -r table before; do
  if ! awk -v t="$table" '$1 == t { found = 1 } END { exit !found }' "$WORK/after.txt"; then
    echo "    DROPPED $table (had $before rows)"
    status=1
  fi
done < "$WORK/before.txt"

if [ "$status" -ne 0 ]; then
  echo "==> FAILED: rows or tables were lost — do not deploy." >&2
  exit 1
fi
echo "==> OK: migrations applied cleanly, no rows lost."
