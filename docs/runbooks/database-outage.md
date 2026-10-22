# Runbook: Database Outage

**Version:** 2.0.0
**Severity:** SEV-1
**Primary owner:** Backend on-call
**Escalation:** Secondary on-call → Team lead → Infra/DBA → CTO

## 1. Detection

Alerts that indicate a database problem:

- `ApplicationHealthCheckFailed` — `/health` returns 503 (the Terminus
  `database` ping fails; see `src/health/health.controller.ts`).
- `PodNotReady` — readiness probe (`/health`) failing on backend pods.
- `InsufficientBackendReplicas` — pods evicted after repeated probe failures.
- User reports: 500s on every endpoint, "QueryFailedError"/"ECONNREFUSED" in logs.

Confirm the [operator context](./README.md#operator-context-and-evidence),
including active DB_HOST/DB_NAME and the operator-provided DATABASE_URL, before
using these examples. Do not print credentials or raw query/PII data in tickets.

First triage commands:

```bash
# 1. Application view of the database
curl --fail-with-body -sS "$HEALTH_URL" | jq

# 2. Can we reach Postgres at all?
psql "$DATABASE_URL" -c 'SELECT 1;'

# 3. Pod / event view (if DB runs in-cluster)
kubectl get pods -l app=uzima-backend
kubectl get events --sort-by=.lastTimestamp | tail -20
```

## 2. Triage — classify the failure

| Symptom                                                 | Likely cause                       | Go to |
| ------------------------------------------------------- | ---------------------------------- | ----- |
| `/health` 503 on `database`, psql hangs                 | DB process down / crash            | 3.1   |
| psql works, app logs show `too many connections`        | Connection-pool exhaustion         | 3.2   |
| psql works, app logs show lock timeouts / stuck queries | Long-running query or lock         | 3.3   |
| `disk full` / `WAL` errors in DB logs                   | Storage exhaustion                 | 3.4   |
| psql refuses auth (`28P01`) after a change              | Rotated credentials not propagated | 3.5   |

## 3. Mitigation

### 3.1 Database process down / crash

1. Check provider status page (managed DB) or `kubectl get pods -n db` for the
   Postgres workload.
2. If managed: failover to standby via the provider console (record the time —
   DNS/endpoint may change and apps cache connections).
3. If self-hosted: restart Postgres
   ⚠️ (pair-verify: `kubectl rollout restart statefulset/<db>` or the provider
   equivalent). Verify `SELECT 1` before moving on.
4. Restart backend pods to drop stale connections:
   `kubectl rollout restart deployment/uzima-backend`.
5. Re-check `/health` until `database` reports healthy.

### 3.2 Connection-pool exhaustion

1. Inspect connections:
   ```sql
   SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
   SELECT max_conn, used, res_for_super FROM (
     SELECT count(*) used FROM pg_stat_activity) a,
     (SELECT setting::int max_conn FROM pg_settings WHERE name='max_connections') b,
     (SELECT setting::int res_for_super FROM pg_settings WHERE name='superuser_reserved_connections') c;
   ```
2. Ask the DBA to identify the specific application-owned connection(s), their
   database, user and workload. Capture evidence first; use a bounded cancellation
   before considering termination. Any termination requires the workload owner's
   approval and a reviewed PID list. Do not mass-terminate sessions across the
   PostgreSQL server or interrupt a migration blindly.
3. If the app-side pool size was recently changed, roll back the deploy:
   `kubectl rollout undo deployment/uzima-backend`.

### 3.3 Locks / long-running queries

1. Find blockers:
   ```sql
   SELECT pid, now() - query_start AS runtime, state, query
   FROM pg_stat_activity WHERE state <> 'idle' ORDER BY runtime DESC LIMIT 10;
   ```
2. Cancel (not kill) first: `SELECT pg_cancel_backend(<pid>);`
3. Escalate to `pg_terminate_backend(<pid>)` only after the owner of the query
   confirms (check audit context — migrations and bulk operations run here).

### 3.4 Storage exhaustion

1. Confirm: `kubectl exec <db-pod> -- df -h /var/lib/postgresql/data`.
2. Free space per Infra runbook (archive WAL, drop temp tables). If a managed
   provider, expand the volume.
3. Do **not** delete WAL segments by hand — coordinate with Infra/DBA.

### 3.5 Rotated credentials not propagated

1. Confirm which secret changed: `kubectl describe secret uzima-secrets`.
2. Reconcile `DB_PASSWORD` (or its `DATABASE_PASSWORD` fallback) with the active
   DatabaseModule and update the configured secret through the approved process.
   Restart
   the deployment.
3. Verify no other consumers (seed scripts, CI) break with the old credential.

## 4. Duties During the Incident

| Role                                             | Duty                                                          |
| ------------------------------------------------ | ------------------------------------------------------------- |
| Incident commander (team lead or senior on-call) | Owns timeline, makes failover/rollback calls, runs comms      |
| On-call engineer                                 | Executes steps, captures evidence (log excerpts, timestamps)  |
| Secondary                                        | Shadows, verifies destructive commands, drafts status updates |
| Support lead                                     | Acknowledges tickets, redirects users to the status page      |

## 5. Communication

- Open `#inc-<date>-db` and pin the incident summary (symptom, start time,
  IC, current step).
- Post updates every 30 min (SEV-1): _what we know, what we're doing, next
  update time_.
- Support posts the status page update **before** users ask. If PII or data
  loss may be involved, loop in the CTO immediately — compliance
  notification windows may apply (see `docs/runbooks/README.md`).

## 6. Recovery Verification

1. `curl --fail-with-body -sS "$HEALTH_URL" | jq` → all indicators `up`.
2. `Alertmanager` silent for 30 minutes (`PodNotReady`,
   `ApplicationHealthCheckFailed`).
3. Verify the affected production read path with an authorized operator. A
   synthetic write belongs on an approved staging fixture, not a real profile.
4. Check queue backlog drains: the verified `QUEUE_HEALTH_URL`, and confirm the
   dead-letter queue is not growing (see
   [queue-failures.md](./queue-failures.md)).

## 7. Post-mortem

Within 3 business days, using the template below (file under
`docs/postmortems/YYYY-MM-DD-db-outage.md`):

```
- Impact: (duration, users affected, requests failed)
- Timeline: (detection → triage → mitigation → resolution, with timestamps)
- Root cause:
- What went well / what didn't:
- Action items: (owner + due date, tracked as issues)
- Runbook updates: (did this runbook mislead us? bump Version)
```

## Changelog

| Version | Date       | Change                                                                                          |
| ------- | ---------- | ----------------------------------------------------------------------------------------------- |
| 2.0.0   | 2026-10-19 | #1613: confirm targets and active credentials, bound connection mitigation and recovery checks. |
| 1.0.0   | 2026-09-24 | Initial version.                                                                                |
