# Runbook: Backup & Restore Verification

**Version:** 1.1.0
**Severity:** SEV-3
**Primary owner:** Backend on-call / DBA
**Escalation:** Secondary on-call -> Team lead -> Infra/DBA -> CTO

## 1. Purpose

This runbook provides a documented, repeatable procedure to verify that database
backups can actually be restored in a non-production environment. It proves that
a backup is usable, not merely that the backup job reported success.

Every run must record the backup timestamp, the verification result, and any
restore errors. The automated check in Section 6 does this by default.

## 2. Scope

- Applies to production database backups (full and incremental as applicable).
- Restore verification is performed in an isolated non-production environment
  (staging or a dedicated restore sandbox).
- PostgreSQL is the assumed database engine; adapt commands for the managed
  provider where needed.
- Production restores themselves are out of scope and require the database
  outage runbook plus change approval.

## 3. Prerequisites

- Access to the backup storage location (S3, Azure Blob, provider snapshots, etc.)
- Access to a non-production Postgres instance with at least 2x the backup size
  in free disk space
- `pg_dump`, `pg_restore`, and `psql` (or the provider equivalents) available on
  the machine running the check
- A least-privilege non-production database role that can create and drop
  databases on the target server
- The repository dependencies installed (`npm install`), because the automated
  check uses the existing `pg` package
- Credentials for the non-production database, stored securely and never reused
  from production

## 4. Frequency

- **Scheduled:** Weekly (recommended) for production-critical databases. Align
  with RPO/RTO targets.
- **After changes:** After schema migrations, major version upgrades, or changes
  to backup configuration/jobs.
- **After incidents:** After any database outage or backup job failure
  investigation.

## 5. When to Run

- Weekly scheduled verification window
- Suspected backup corruption (failed backup job, partial transfer, storage issue)
- Pre-release validation when restoring from a specific backup is part of the
  rollout plan
- Compliance or audit evidence that backups are recoverable

## 6. Automated Restore Check (Recommended)

`scripts/verify-backup-restore.js` restores a backup into a throwaway database,
runs integrity checks, records the result, and removes the throwaway database.
It is safe to run repeatedly and is the preferred way to satisfy the restore
verification requirement.

### 6.1 What the check does

1. Refuses to run when the environment looks like production (see Section 6.5).
2. Creates a uniquely named scratch database on the non-production server.
3. Restores the backup with `pg_restore` (custom/directory dumps) or `psql`
   (plain SQL dumps).
4. Verifies connectivity, table count, constraints, indexes, migration count,
   and row counts for the configured critical tables.
5. Writes a JSON record containing the backup timestamp, result, and restore
   errors, and optionally appends a markdown entry to a verification log.
6. Drops the scratch database unless `RESTORE_VERIFY_KEEP_DATABASE=1`.

### 6.2 Configure

Set these variables in the shell or in the scheduled job. Do not commit secrets.

| Variable | Required | Description |
| --- | --- | --- |
| `RESTORE_VERIFY_BACKUP_FILE` | Yes | Path to the `.dump`, `.backup`, `.tar`, or `.sql` backup, or a `pg_dump -Fd` directory. |
| `RESTORE_VERIFY_DATABASE_URL` | Yes | Connection URL for the **non-production** Postgres server, e.g. `postgres://user:pass@staging-db:5432/postgres?sslmode=require`. |
| `RESTORE_VERIFY_ENVIRONMENT` | Yes | Non-production label such as `staging`, `sandbox`, or `local`. Labels that mean production are rejected. |
| `RESTORE_VERIFY_BACKUP_TIMESTAMP` | No | When the backup was taken (ISO 8601). Defaults to the backup file's modification time. |
| `RESTORE_VERIFY_CRITICAL_TABLES` | No | Comma-separated tables that must exist and be countable. Defaults to `users,health_tasks,organizations`. |
| `RESTORE_VERIFY_MAINTENANCE_DB` | No | Maintenance database used to create the scratch database. Defaults to `postgres`. |
| `RESTORE_VERIFY_OUTPUT_FILE` | No | JSON record path. Defaults to `backup-restore-verifications/restore-verification-<UTC>.json`. |
| `RESTORE_VERIFY_LOG_FILE` | No | Optional markdown file to append a human-readable verification entry to. |
| `RESTORE_VERIFY_KEEP_DATABASE` | No | Set to `1`/`true` to keep the scratch database for debugging. |
| `RESTORE_VERIFY_TIMEOUT_MS` | No | Restore timeout. Defaults to 30 minutes. |
| `RESTORE_VERIFY_OPERATOR` | No | Operator name stored in the record. Defaults to the OS user. |
| `RESTORE_VERIFY_PRODUCTION_DATABASE_URL` | No | Optional production URL used to reject a target that resolves to the same host and port. |

Example (bash):

```bash
export RESTORE_VERIFY_ENVIRONMENT=staging
export RESTORE_VERIFY_DATABASE_URL='postgres://restore_verify:secret@staging-db:5432/postgres'
export RESTORE_VERIFY_BACKUP_FILE=/backups/uzima-db-2026-10-19.dump
export RESTORE_VERIFY_BACKUP_TIMESTAMP=2026-10-19T02:00:00Z
export RESTORE_VERIFY_LOG_FILE=docs/backups/restore-verification-log.md

npm run verify:backup-restore
```

Example (PowerShell):

```powershell
$env:RESTORE_VERIFY_ENVIRONMENT = 'staging'
$env:RESTORE_VERIFY_DATABASE_URL = 'postgres://restore_verify:secret@staging-db:5432/postgres'
$env:RESTORE_VERIFY_BACKUP_FILE = 'C:\backups\uzima-db-2026-10-19.dump'
$env:RESTORE_VERIFY_BACKUP_TIMESTAMP = '2026-10-19T02:00:00Z'

npm run verify:backup-restore
```

### 6.3 Run

```bash
npm run verify:backup-restore
```

Or invoke the script directly:

```bash
node scripts/verify-backup-restore.js
```

The command prints the result and the path to the JSON record. It exits non-zero
unless the result is `PASS`, so it can gate a CI job or scheduled pipeline.

### 6.4 Record format

The JSON record is the source of truth. Required fields include:

```json
{
  "backupTimestamp": "2026-10-19T02:00:00.000Z",
  "result": "PASS",
  "restoreErrors": [],
  "backup": { "file": "...", "sizeBytes": 0, "sha256": "...", "format": "custom" },
  "verification": { "environment": "staging", "operator": "...", "startedAt": "...", "completedAt": "..." },
  "checks": { "tableCount": 0, "constraintCount": 0, "indexCount": 0, "criticalTables": {} },
  "cleanup": { "dropped": true, "error": null }
}
```

- `result` is `PASS`, `FAIL`, or `PARTIAL` (verification passed but cleanup
  failed).
- `restoreErrors` contains the restore command's errors plus any verification
  errors and is empty only when the restore and checks succeeded.
- `backupTimestamp` is taken from `RESTORE_VERIFY_BACKUP_TIMESTAMP` or the backup
  file's modification time.

If `RESTORE_VERIFY_LOG_FILE` is set, a matching markdown entry is appended using
the template in Section 8. Store records in a secure location and retain them per
the compliance requirement (at least 12 months by default).

### 6.5 Safety guards

The automated check will refuse to start when:

- `NODE_ENV=production`
- `RESTORE_VERIFY_ENVIRONMENT` is missing or names a production-like environment
- `RESTORE_VERIFY_DATABASE_URL` resolves to the same host and port as
  `RESTORE_VERIFY_PRODUCTION_DATABASE_URL`
- A plain SQL dump contains `\connect` or `CREATE DATABASE`, because it could
  write outside the scratch database

The restore target is always a newly created database named
`uzima_restore_verify_<timestamp>_<random>`. The script never restores into the
database named in the connection URL.

## 7. Manual Restore Verification (Fallback)

Use this path when the automated check cannot run (for example, a managed
provider performs the restore through its console).

### 7.1 Identify the backup to verify

1. Select the backup set (typically the most recent successful full backup).
2. Record the backup metadata: timestamp, location, size, checksum, and backup
   job status.
3. Document the chosen backup in the verification record (Section 8).

Example (AWS RDS snapshot):

```bash
aws rds describe-db-snapshots --db-instance-identifier uzima-db --snapshot-type automated --max-items 5
```

Example (file-based `pg_dump`):

```bash
aws s3 ls s3://uzima-db-backups/ --recursive | sort | tail -10
```

### 7.2 Prepare the non-production restore target

**Important:** Never restore to production. Only use an isolated non-production
environment.

1. Confirm the target environment is isolated and not used by active users.
2. Choose a unique target database name (for example
   `uzima_restore_verify_20261019`).
3. Ensure sufficient free space on disk and in the Postgres tablespace.
4. Create the database:

```bash
psql "$NON_PROD_DATABASE_URL_ADMIN" -c "CREATE DATABASE uzima_restore_verify_20261019;"
```

### 7.3 Restore the backup

Custom/compressed format:

```bash
pg_restore --verbose --no-owner --no-acl --exit-on-error \
  --host="$NON_PROD_DB_HOST" --port="$NON_PROD_DB_PORT" \
  --username="$NON_PROD_DB_USER" --dbname=uzima_restore_verify_20261019 \
  /path/to/backup/uzima-db-2026-10-19.dump
```

Plain SQL:

```bash
psql -v ON_ERROR_STOP=1 "$NON_PROD_DATABASE_URL/uzima_restore_verify_20261019" \
  -f /path/to/backup/uzima-db-2026-10-19.sql
```

Managed snapshots (RDS):

1. Restore the snapshot to a new RDS instance in the non-production VPC.
2. Update connection details to point at the restored instance.
3. Record the new endpoint in the verification log.

### 7.4 Verify data integrity

1. **Connectivity:** `SELECT 1;`
2. **Schema:** count base tables in the `public` schema.
3. **Critical tables:** count rows in tables such as `users`, `health_tasks`,
   and `organizations`.
4. **Freshness:** compare `max(created_at)` / `max(updated_at)` against the
   backup timestamp.
5. **Constraints and indexes:** confirm expected constraints and indexes exist.
6. **Application smoke test (recommended):** run the app against the restored
   database with read-only operations and verify critical endpoints.

## 8. Verification Record Template

Each manual verification entry must include:

```markdown
### Restore Verification - [YYYY-MM-DD]

- **Backup timestamp:** YYYY-MM-DD HH:MM:SS UTC
- **Backup identifier/location:** e.g., s3://.../uzima-db-20261019.dump or RDS snapshot: snap-xxx
- **Verified by:** [operator name/team]
- **Non-prod target:** [environment name + DB name]
- **Restore started:** YYYY-MM-DD HH:MM:SS UTC
- **Restore completed:** YYYY-MM-DD HH:MM:SS UTC
- **Duration:** [e.g., 12m 34s]
- **Result:** [PASS | FAIL | PARTIAL]
- **Errors:** [detailed error messages or "none"]
- **Verification checks:**
  - Table count: [n] tables
  - User count: [n]
  - Latest created_at: [timestamp]
  - All constraints present: [yes/no]
- **Notes:** [any anomalies or follow-up actions]
- **Ticket/issue:** [if FAIL, link to incident ticket]
```

## 9. Failure Handling

If verification fails at any step:

1. **Do not use this backup for recovery** until the root cause is understood.
2. **Capture evidence:** save the JSON record, full restore logs, backup job
   logs, error messages, and timestamps.
3. **Escalate:** notify the on-call DBA/Infra team immediately (SEV-2 or higher
   depending on impact).
4. **Investigate root cause:** check backup job status, verify checksums and file
   size, test an older known-good backup, and check storage for corruption.
5. **Track remediation:** open an incident ticket with owners and due dates.
6. **Re-verify** after remediation before considering the backup valid.

## 10. Cleanup

The automated check drops its scratch database automatically. For manual runs:

```sql
DROP DATABASE IF EXISTS uzima_restore_verify_20261019;
```

Terminate any verification RDS instance and remove temporary downloaded files.

## 11. Configuration Notes

- **Storage location:** document where backups live and how to access them.
- **Non-prod credentials:** use least-privilege credentials; never reuse
  production credentials.
- **Retention of verification records:** keep them for at least 12 months or per
  compliance requirements.
- **Scheduling:** run the check weekly from CI or the operations scheduler and
  retain the JSON artifacts. The command exits non-zero on failure, so failed
  runs can alert through the existing pipeline notification path.
- **Generated artifacts:** the default `backup-restore-verifications/` directory
  is git-ignored. Use `RESTORE_VERIFY_OUTPUT_FILE` and
  `RESTORE_VERIFY_LOG_FILE` to publish records to your secure evidence store.

## 12. References

- Automated check: `scripts/verify-backup-restore.js`
- PostgreSQL backup/restore docs: https://www.postgresql.org/docs/current/backup.html
- AWS RDS backup/restore: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_CommonTasks.BackupRestore.html
- Project runbooks: [docs/runbooks/](./README.md)
- Health check: `src/health/health.controller.ts`

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-10-19 | Initial manual procedure with required record fields. |
| 1.1.0 | 2026-10-19 | Added the repeatable `verify:backup-restore` check, non-production guards, JSON/markdown records, and automated integrity checks. |
