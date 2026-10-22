# Runbook: Redis Incidents

**Version:** 1.0.0
**Severity:** SEV-2; SEV-1 when core traffic or all reward processing is unavailable
**Primary owner:** Backend on-call
**Escalation:** Platform lead → Infra/Redis operator → Incident commander

## 1. Detection and diagnosis

Symptoms include connection errors, timeouts, growing Bull backlogs, and failed
Redis/queue health indicators. A low cache hit rate alone does not prove a Redis
outage. Confirm environment, incident start time and affected functions first.
Use the [index's operator context](./README.md#operator-context-and-evidence).

QueueModule consumes `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` and
`REDIS_TLS` through `src/config/redis.config.ts`. The `.env.example`
`QUEUE_REDIS_*` names do not override this connection. Check the deployed
configuration privately, including database number and TLS/CA settings.

Read-only checks against the confirmed target:

```sh
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "${REDIS_DB:-0}" PING
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "${REDIS_DB:-0}" INFO memory
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "${REDIS_DB:-0}" INFO persistence
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "${REDIS_DB:-0}" INFO replication
```

For password authentication, populate `REDISCLI_AUTH` from the operator's secret
manager rather than putting a password in command arguments. For TLS, add
`--tls` and the deployment's CA configuration; never disable verification to
make the check pass. Do not publish the raw INFO output or credentials.

| Finding                                 | Next action                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| Refused connection / DNS error          | Check service discovery, endpoint and provider status before restarting anything           |
| Authentication/TLS error after rotation | Reconcile the deployed secret/CA with the configured consumer; do not rotate again blindly |
| `maxmemory` reached or evictions rising | Identify queue versus cache key use and persistence requirements with the Redis owner      |
| Persistence or replication unhealthy    | Escalate to Infra; retain provider events and the last durable checkpoint                  |
| Redis reachable, workers idle           | Continue with [Queue Failures](./queue-failures.md)                                        |

## 2. Mitigation

1. Record an incident owner, affected queues, oldest job age and the last known
   healthy time. Separate a cache degradation from loss of queued work.
2. If configuration changed, restore the last verified configuration through the
   normal deployment process. Confirm credential and TLS compatibility first.
3. Failover/restart only with Infra approval and knowledge of persistence and
   replication state. The Compose Redis example enables AOF; that is not proof
   of production persistence, a backup, or zero data loss after a failover.
4. Restore capacity using the provider's approved process. Do not run `FLUSHDB`,
   `FLUSHALL`, broad `DEL`, or change eviction policy as a generic remedy: cache
   and durable job data may share the server/database.
5. Reconcile potentially lost jobs with their source of truth before any replay.
   Reward/payment work needs the product/financial owner and idempotency checks.

## 3. Escalation and communication

Page Infra immediately for suspected persistence loss, split-brain, repeated
failovers or credential compromise. Involve Security if secrets were exposed.
Escalate to the incident commander for SEV-1 or lack of a safe mitigation path.
Report impact, backlog/age trend, data-loss uncertainty, owner and next update
time; use the severity cadence in the index. Do not claim jobs survived until
their records have been reconciled.

## 4. Recovery verification

- The confirmed target responds to PING; persistence and replication have the
  expected state and no continuing error trend.
- Application Redis/queue indicators recover, and independently inspected
  affected queues resume processing. Health 200 alone is insufficient: the queue
  stats helper can substitute zero counts when an individual queue read fails.
- Backlog age and failed/exhausted jobs trend down without duplicate financial
  effects. Verify a synthetic non-financial job only in staging.
- Keep the incident open through the index's 30-minute observation window and
  obtain Infra confirmation for any data-loss reconciliation.

Record the timeline, persistence assumptions, lost/recovered work and follow-up
owners in the incident post-mortem. Redact tokens, payloads and personal data.

## Changelog

| Version | Date       | Change                                      |
| ------- | ---------- | ------------------------------------------- |
| 1.0.0   | 2026-10-19 | Initial Redis response procedure for #1613. |
