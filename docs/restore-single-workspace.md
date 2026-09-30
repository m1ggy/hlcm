# Restoring one workspace

Every workspace lives in the same database, so restoring a backup the normal way (`pg_restore` over the live database) rolls back **every** workspace. When one tenant loses data (deleted a client, overwrote a case, a bad import), restore only their rows instead: load the backup into a scratch database next to the live one, then copy the missing rows back.

All commands run on the server, in the deploy directory, against the `postgres` compose service. You connect as the database owner (`POSTGRES_USER`), which bypasses row-level security, so double-check every `organizationId` you type.

## 1. Pick a backup

- `backups/pre-migrate-*.dump` — taken automatically before every deploy's migrations (last 7 kept). **These only exist as of the last deploys**, not as of yesterday; anything created and lost between two deploys isn't in them.
- A droplet snapshot, if you take them, restored to a temporary droplet, with the dump made there (`pg_dump -Fc`).

Pick the newest backup from before the data was lost.

## 2. Load it into a scratch database

```sh
docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists hclm_restore && createdb -U "$POSTGRES_USER" hclm_restore'
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d hclm_restore --no-owner' < backups/pre-migrate-<timestamp>.dump
```

The live database is untouched. Find the workspace's id (same in both):

```sh
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d hclm_restore -c "select id, slug, name from organizations"'
```

## 3. Find what's missing

Open a psql session on the scratch copy:

```sh
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d hclm_restore'
```

Look up the rows the tenant lost, always filtered by their `organizationId`. For example, a deleted client and its cases:

```sql
SELECT id, name FROM clients WHERE "organizationId" = '<ORG_ID>' AND name ILIKE '%oakview%';
SELECT id, name FROM applications WHERE "organizationId" = '<ORG_ID>' AND "clientId" = '<CLIENT_ID>';
```

The audit log (`audit_logs`, filtered the same way) shows who deleted or changed what, and when.

## 4. Copy the rows out of the scratch copy

Still in the scratch session, write each table's rows to a CSV. Both psql sessions run inside the same container, so they share its `/tmp`. Export **parents before children**, for example `clients` → `client_contacts` → `applications` → `tasks`:

```sql
\copy (SELECT * FROM clients WHERE "organizationId" = '<ORG_ID>' AND id IN ('<CLIENT_ID>')) TO '/tmp/restore_clients.csv' CSV HEADER
\copy (SELECT * FROM applications WHERE "organizationId" = '<ORG_ID>' AND "clientId" = '<CLIENT_ID>') TO '/tmp/restore_applications.csv' CSV HEADER
```

To see which tables point at a table (what else to bring back with it):

```sql
SELECT conrelid::regclass AS child_table FROM pg_constraint WHERE contype = 'f' AND confrelid = 'clients'::regclass;
```

## 5. Insert them into the live database

Take a fresh backup first, the same way the deploy does:

```sh
( umask 077; docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump" )
```

Then, in a psql session on the **live** database (`-d "$POSTGRES_DB"`), load each CSV in the same parent-first order, inside one transaction. `ON CONFLICT (id) DO NOTHING` leaves rows that still exist alone:

```sql
BEGIN;
CREATE TEMP TABLE r_clients (LIKE clients);
\copy r_clients FROM '/tmp/restore_clients.csv' CSV HEADER
INSERT INTO clients SELECT * FROM r_clients WHERE "organizationId" = '<ORG_ID>' ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE r_applications (LIKE applications);
\copy r_applications FROM '/tmp/restore_applications.csv' CSV HEADER
INSERT INTO applications SELECT * FROM r_applications WHERE "organizationId" = '<ORG_ID>' ON CONFLICT (id) DO NOTHING;

-- Check the counts before committing:
SELECT count(*) FROM clients WHERE "organizationId" = '<ORG_ID>';
COMMIT;   -- or ROLLBACK;
```

The database refuses a row that points at another workspace's data (the same-org triggers) or at a parent that isn't there (foreign keys). If an insert fails, `ROLLBACK`, add the missing parent table, and start the transaction again.

To **overwrite** a row that still exists but was changed (rather than bring back a deleted one), use `ON CONFLICT (id) DO UPDATE SET` with the columns to put back, for one table at a time.

## 6. Bring back files

Uploaded files live in the GCS bucket under `org/<ORG_ID>/`. A restored row points at its file by `storageKey`, which still has to exist in the bucket. If the file was deleted too and the bucket has object versioning on, list the old versions and copy the right one back:

```sh
gcloud storage ls --all-versions gs://<bucket>/org/<ORG_ID>/<file>
gcloud storage cp gs://<bucket>/org/<ORG_ID>/<file>#<generation> gs://<bucket>/org/<ORG_ID>/<file>
```

## 7. Clean up

```sh
docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" hclm_restore; rm -f /tmp/restore_*.csv'
```

The restored rows appear in the app straight away. Nothing in the restore is written to the workspace's audit log, so note what you restored and why in your support ticket, and tell the workspace owner.

## Handing back a whole workspace

To give a tenant a copy of everything instead (a leaving customer, or before deleting a workspace), use the export script. It writes every row as JSON, plus the files with `--files`:

```sh
npx tsx scripts/export-organization.ts <slug> --files
```
