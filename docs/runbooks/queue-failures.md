# Runbook: Queue Failures

**Version:** 1.1.0
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
| Failed jobs accumulating, cause unknown | Attempts exhausted somewhere else | 3.6 |

### 2.1 Retry policy

All queues are registered with one policy, defined in
`src/queue/queue-policy.ts` and applied in `src/queue/queue.module.ts`:

| Setting | Value | Applied in |
| --- | --- | --- |
| Attempts per job | `DEFAULT_JOB_ATTEMPTS` (3) | `queue.module.ts` default job options |
| Backoff | exponential | `backoff: { type: 'exponential' }` |
| Base delay | `DEFAULT_BACKOFF_MS` (1000 ms) | same |
| Delay ceiling | `MAX_BACKOFF_MS` (60 s) | `computeBackoffDelay` |

The delay before retry *n* is `base * 2^(n-1)` clamped to the ceiling, so the
first retry waits 1 s, the second 2 s, the third 4 s, and so on. `QueueService.addJob`
takes `maxRetries` and `backoffMs` per call, so a single job type can opt into a
different budget without changing the global defaults.

### 2.2 Failure classification

Every failure message is classified into one category by `classifyFailure()` in
`src/queue/queue-policy.ts`:

| Category | Matches | First thing to check |
| --- | --- | --- |
| `timeout` | `timeout`, `timed out`, `ETIMEDOUT` | Downstream latency; only raise a client timeout after the dependency is healthy |
| `network` | `ECONNREFUSED`, `ECONNRESET`, `ENOTFOUND`, `fetch failed` | Redis / DB / provider reachability |
| `rate-limit` | `rate limit`, `too many requests`, `429` | Provider quota; lower concurrency or back off |
| `validation` | `validation`, `invalid`, `400` | Payload shape after a schema change |
| `contract` | `soroban`, `contract`, `stellar`, `insufficient`, `tx_` | Stellar/Soroban call or wallet balance |
| `unknown` | anything else | Read the stack trace |

For a queue-wide view without a `redis-cli` session:

```ts
const report = await queueService.getFailureReport('notification-queue');
// { total, exhausted, retrying, byCategory: { timeout, network, ... },
//   records: [{ id, name, failedReason, failureCategory, attemptsMade,
//               maxAttempts, exhausted, failedAt, stacktrace }] }
```

`exhausted` counts jobs that have spent their attempt budget and will not be
retried (`isRetryExhausted`); `retrying` counts jobs still inside the backoff
window. Grouping by `byCategory` is what turns "5,000 failed jobs" into "4,900
were `network` after the Redis failover".

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

1. Identify the failing job name + payload from logs, or ask for a grouped view
   with `QueueService.getFailureReport('<queue>')` (section 2.2).
2. Check the dependency it talks to (DB, storage for exports, Stellar for
   rewards). Fix the dependency first — jobs retry with exponential backoff per
   section 2.1, and a fix that lands inside the backoff window still succeeds.
3. If payloads are malformed (e.g. missing IDs after a schema change), stop the
   bleeding by draining: ⚠️ pair-verify
   `QueueService.clearQueue('<queue>')` is destructive — prefer removing the
   specific bad jobs or pausing the queue while a hotfix is prepared.

### 3.4 Reward dead-letter queue

1. Group the backlog by cause before touching it: the persisted category is on
   each row (`jobData.failureCategory`), and
   `DeadLetterProcessor.getFailureSummary()` returns
   `{ total, byCategory, topErrors }` over the most recent 500 rows.
2. List failed jobs: `GET /api/v1/admin/rewards/failed-jobs` (admin token).
3. Inspect `failedReason` per job; fix the underlying cause (wallet issues,
   duplicate payouts, DB constraint).
4. Replay individually: `POST /api/v1/admin/rewards/failed-jobs/:id/retry`.
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

### 3.6 Non-reward queues that exhausted their retries

Bull does not relocate a failed job on its own: it stays in that queue's
`failed` set. Two options, in order:

1. **Inspect** with `QueueService.getFailureReport('<queue>')`. Nothing moves,
   so this is always safe and is the first step for any queue.
2. **Move** the exhausted ones into the dead-letter queue with
   `QueueService.reapExhaustedJobs('<queue>')`. It re-checks the attempt budget
   per job (`isRetryExhausted`), so jobs still inside their backoff window are
   left alone, and returns `{ inspected, moved }`.

Reaped non-reward jobs land on `reward-dead-letter-queue` as inspectable
records — payload, reason, category and stack trace are preserved — but they are
**not** written to `failed_reward_jobs`, which only accepts reward-shaped rows.
⚠️ Reap *before* replaying, so the same job is not counted twice.

## 4. Duties During the Incident

| Role | Duty |
| --- | --- |
| On-call engineer | Runs triage, executes resume/replay/rollback steps |
| Platform lead | Owns Redis/infra side, approves destructive cleanup |
| Team lead | Decides rollback vs hotfix, communicates SLA impact |
| Support lead | Tells users what's delayed (exports, notifications) and expected recovery time |

## 5. Communication

- Incident channel `#inc-<date>-queue`; updates every 2 hours (SEV-2).
- Quantify the backlog in every update (jobs waiting, age of oldest job) and, if
  known, which failure category dominates it.
- If notifications are delayed, support should say so proactively — users
  interpret silence as task failure.

## 6. Recovery Verification

1. `/health/queue` 200 and backlog trending to zero
   (`application_queue_jobs_waiting` alert cleared).
2. `getFailureReport('<queue>').retrying` falling and `exhausted` no longer
   growing; no new category appearing in `byCategory`.
3. Dead-letter queue not growing; replayed reward jobs completing.
4. Spot-check: enqueue a test notification / export in staging-like flow and
   confirm delivery.
5. Alerts silent for 30 minutes.

## 7. Post-mortem

Use the index template ([README.md](./README.md)). Queue incidents must always
document: which queue, why jobs failed, whether anything was lost permanently,
and whether alert thresholds caught it early enough.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-09-24 | Initial version. |
| 1.1.0 | 2026-09-26 | Documented the shared retry policy (`queue-policy.ts`), the failure categories, `getFailureReport` / `reapExhaustedJobs`, and dead-letter grouping via `getFailureSummary`. |
