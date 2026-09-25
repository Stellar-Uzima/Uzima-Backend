# Runbook: Queue Failures

**Version:** 1.0.0
**Severity:** SEV-2 (SEV-1 if reward payouts or notifications are fully stalled)
**Primary owner:** Backend on-call
**Escalation:** Secondary on-call → Platform lead → Team lead

## 1. Detection

The backend runs Bull (Redis-backed) queues. Names and job types are defined in
`src/queue/queue.constants.ts`:

| Queue | Purpose |
| --- | --- |
| `reward-queue` / `reward-dead-letter-queue` | Reward distribution, calculation, claims |
| `notification-queue` | Email / push / SMS / task reminders |
| `task-verification-queue` | Task completion verification, quality checks, approvals |
| `proof-verification-queue` | Proof-of-task verification |
| `user-activity-queue` | Activity tracking events |
| `data-processing-queue` | GDPR data exports, bulk task assignments |

Alerts that indicate queue trouble:

- `HighQueueBacklog` — waiting jobs > 100 for 5 minutes.
- `ApplicationHealthCheckFailed` — `/health/queue` reports the queue indicator
  down (Redis unreachable).
- Dead-letter queue growth (reward jobs land there after exhausting retries —
  see `src/rewards/queues/dead-letter.processor.ts` and
  `GET /api/v1/admin/rewards/failed-jobs`).
- Support reports: missing notifications, tasks not verified, exports never
  arriving.

Triage commands:

```bash
# Queue health + job counts
curl -s https://api.uzima.example/health/queue | jq

# Per-queue stats (waiting/active/completed/failed/delayed/paused)
# via the QueueService stats or a redis-cli snapshot:
redis-cli -h $REDIS_HOST -p $REDIS_PORT --scan --pattern 'bull:*' | head
redis-cli -h $REDIS_HOST -p $REDIS_PORT llen bull:reward-queue:wait
redis-cli -h $REDIS_HOST -p $REDIS_PORT llen bull:reward-dead-letter-queue:wait

# Recent app logs for processor errors
kubectl logs deploy/uzima-backend --since=30m | grep -iE "job.*(failed|error)" | tail -50
```

## 2. Triage — classify the failure

| Symptom | Likely cause | Go to |
| --- | --- | --- |
| `/health/queue` 503, `redis` indicator down | Redis unavailable | 3.1 |
| Backlog grows, processors idle, no errors | Workers not consuming (paused/deploy issue) | 3.2 |
| Backlog grows, processor errors in logs | Job payload/dependency failure | 3.3 |
| `reward-dead-letter-queue` growing | Reward jobs exhausted retries | 3.4 |
| Single job type failing (e.g. all exports) | Code regression in a processor | 3.5 |

## 3. Mitigation

### 3.1 Redis unavailable

1. Check Redis pods / provider status; restart or failover.
2. Enqueued-but-unprocessed jobs survive in Redis persistence; verify after
   restart with the `llen` checks above.
3. Confirm `/health/queue` returns to 200. Jobs lost to an unpersisted Redis
   must be re-enqueued (see 3.4 for rewards, re-run bulk operations from the
   admin API for others).

### 3.2 Workers not consuming

1. Were the queues **paused**? Resume with the QueueService helpers
   (`resumeQueue`) — a previous incident may have left them paused.
2. Recent deploy? Roll back if processors were changed:
   `kubectl rollout undo deployment/uzima-backend`.
3. Check pod logs for processor registration errors at boot
   (`@Processor` wiring fails loudly on startup).

### 3.3 Job-level failures

1. Identify the failing job name + payload from logs.
2. Check the dependency it talks to (DB, storage for exports, Stellar for
   rewards). Fix the dependency first — jobs retry with exponential backoff.
3. If payloads are malformed (e.g. missing IDs after a schema change), stop the
   bleeding by draining: ⚠️ pair-verify
   `QueueService.clearQueue('<queue>')` is destructive — prefer removing the
   specific bad jobs or pausing the queue while a hotfix is prepared.

### 3.4 Reward dead-letter queue

1. List failed jobs: `GET /api/v1/admin/rewards/failed-jobs` (admin token).
2. Inspect `failedReason` per job; fix the underlying cause (wallet issues,
   duplicate payouts, DB constraint).
3. Replay individually: `POST /api/v1/admin/rewards/failed-jobs/:id/retry`.
   ⚠️ Verify jobs are idempotent before mass-replaying — duplicate reward
   payouts are a financial incident (see
   [reward-regressions.md](./reward-regressions.md)).

### 3.5 Processor regression

1. Compare the failing processor with the last known-good tag
   (`git diff <last-release>..HEAD -- src/**/*processor*.ts`).
2. Roll back the deploy if the regression is recent.
3. Otherwise ship a hotfix; queue jobs accumulate and will drain automatically
   after deploy if `removeOnComplete`/`removeOnFail` retention still holds them
   for retry.

## 4. Duties During the Incident

| Role | Duty |
| --- | --- |
| On-call engineer | Runs triage, executes resume/replay/rollback steps |
| Platform lead | Owns Redis/infra side, approves destructive cleanup |
| Team lead | Decides rollback vs hotfix, communicates SLA impact |
| Support lead | Tells users what's delayed (exports, notifications) and expected recovery time |

## 5. Communication

- Incident channel `#inc-<date>-queue`; updates every 2 hours (SEV-2).
- Quantify the backlog in every update (jobs waiting, age of oldest job).
- If notifications are delayed, support should say so proactively — users
  interpret silence as task failure.

## 6. Recovery Verification

1. `/health/queue` 200 and backlog trending to zero
   (`application_queue_jobs_waiting` alert cleared).
2. Dead-letter queue not growing; replayed reward jobs completing.
3. Spot-check: enqueue a test notification / export in staging-like flow and
   confirm delivery.
4. Alerts silent for 30 minutes.

## 7. Post-mortem

Use the index template ([README.md](./README.md)). Queue incidents must always
document: which queue, why jobs failed, whether anything was lost permanently,
and whether alert thresholds caught it early enough.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-09-24 | Initial version. |
