# Operational Runbooks

Step-by-step procedures for engineering and support teams responding to common
incidents and monitoring alerts in the Stellar Uzima backend.

## Runbook Index

| Runbook | Trigger / Alert | Severity | Owner (primary) | Escalation |
| --- | --- | --- | --- | --- |
| [Database Outage](./database-outage.md) | `ApplicationHealthCheckFailed`, `PodNotReady`, DB connection errors | SEV-1 | Backend on-call | Infra lead → CTO |
| [Authentication Issues](./auth-issues.md) | Login failure spike, JWT errors, account lockout surge | SEV-2 | Backend on-call | Security lead |
| [Redis Incidents](./redis-incidents.md) | Redis connectivity, memory, persistence or failover errors | SEV-2 / SEV-1 | Backend on-call | Platform lead → Infra |
| [Notification Provider Incidents](./notification-provider-incidents.md) | SMS/push failures, stale delivery logs or open channel circuit | SEV-2 | Backend on-call | Provider owner → Security if exposure |
| [Stellar Incidents](./stellar-incidents.md) | Horizon failures, uncertain transaction outcome or webhook failures | SEV-2 / SEV-1 | Backend on-call | Backend lead → Financial owner |
| [Queue Failures](./queue-failures.md) | `HighQueueBacklog`, dead-letter queue growth, stuck jobs | SEV-2 | Backend on-call | Platform lead |
| [Reward Regressions](./reward-regressions.md) | Reward balance complaints, failed reward jobs, wrong payouts | SEV-2 | Backend on-call | Product owner → Backend lead |
| [Backup & Restore Verification](./backup-restore-verification.md) | Weekly restore check / backup integrity verification | SEV-3 | Backend on-call / DBA | Infra/DBA |

## Severity Definitions

| Severity | Definition | Response SLA | Update cadence |
| --- | --- | --- | --- |
| SEV-1 | Core service unavailable or data loss in progress. Users cannot use the platform. | 15 minutes | Every 30 minutes |
| SEV-2 | Major feature degraded (auth, queues, rewards) but platform partially usable. | 1 hour | Every 2 hours |
| SEV-3 | Minor feature degraded, workaround exists. | Next business day | Daily |

## On-Call Duties

1. **Acknowledge** the alert in the paging tool (target: < 15 min for SEV-1/SEV-2).
2. **Identify** the runbook above and follow it top-to-bottom. Do not improvise
   before triage data has been captured.
3. **Communicate** — open an incident channel and post the first status update
   within 30 minutes for SEV-1 (see each runbook's communication template).
4. **Mitigate, then fix** — restore service first (rollback, failover, replay);
   root-cause analysis happens after the incident.
5. **Declare resolved** only when health checks are green for 30 consecutive
   minutes (verified health URL returning 200 and the deployed alerts quiet). Health
   checks alone do not verify provider delivery or financial reconciliation.
6. **Write a post-mortem** within 3 business days for SEV-1/SEV-2 (template in
   each runbook) and file follow-up actions as tracked issues.

## Escalation Ladder

```
Primary on-call engineer        (responds, follows runbook)
  └─> Secondary on-call         (no ack in 15 min, or needs a second pair of hands)
        └─> Team lead           (SEV-2+ or >1h without mitigation path)
              └─> Infra/DBA     (database, k8s, cloud provider issues)
              └─> Security lead (auth, credential compromise, data exposure)
              └─> Product owner (user-facing impact, comms to stakeholders)
                    └─> CTO     (SEV-1 >2h, or legal/compliance exposure)
```

Escalate **at any point** if you are unsure — an unnecessary page is cheaper
than a delayed incident.

## Versioning & Release Review Policy

Runbooks are versioned documentation and are reviewed as part of the release
process, exactly like code.

- **Version format**: every runbook carries a `Version` header (`MAJOR.MINOR.PATCH`).
  Bump **MAJOR** when the procedure changes (steps reordered, commands changed),
  **MINOR** for clarifications, contact updates, or new monitoring references.
- **Change log**: each runbook maintains a `## Changelog` section describing
  every version bump with the PR reference.
- **Review cadence**:
  1. Any PR that touches `docs/runbooks/` requires at least one review from the
     on-call rotation owner. Request that review explicitly; the current tree
     does not contain a CODEOWNERS rule enforcing it.
  2. **Quarterly fire drill**: once per quarter, an on-call engineer walks each
     runbook against staging and opens issues for any stale steps. Recorded in
     the changelog as a "Quarterly review — OK" entry.
  3. **Release gate**: the release checklist (run at every tagged release)
     includes the item "Runbooks reviewed for this release's changes" — e.g. a
     release that changes queue configuration must have the queue-failures
     runbook re-verified. This item lives in `.github/PULL_REQUEST_TEMPLATE.md`
     and the [release-readiness record](../RELEASE_READINESS_CHECKLIST.md).
- Runbook changes that accompany a feature (new queue, new alert, new admin
  tooling) belong in the **same PR** as the feature whenever possible.

## Conventions Used in Runbooks

- **Dry-run first**: destructive commands are marked ⚠️ and must be run in a
  pair (one person types, another verifies) for SEV-1 systems.
- **Slash commands** reference the actual CLI available in the deploy
  environment (`kubectl`, `psql`, `redis-cli`).
- **Endpoints** use the operator-confirmed deployment base; example domains are
  placeholders. Use the required authentication without exposing the token.

## Operator context and evidence

Before using a command, record the incident ID, environment, release SHA,
namespace/service, responsible operator, start time and last known-good state.
Confirm the target is the intended deployment. These procedures are instructions
for authorized operators, not evidence that a production drill was performed.

- Set `API_BASE_URL` to the confirmed versioned API base and `HEALTH_URL` to its
  verified health endpoint; `QUEUE_HEALTH_URL` is the verified queue endpoint.
  `main.ts` enables URI versioning with prefix `api/v` and default version `1`.
  The example Docker/Kubernetes probes still specify unversioned `/health` and
  port 3000, while bootstrap defaults to `APP_PORT=3001`. Verify the effective
  configuration/route instead of treating those examples as a deployed contract.
- For kubectl, select and verify the intended context and namespace before
  running the examples. The manifest's deployment name is `uzima-backend`; a
  real installation may use different names.
- Database/Redis URLs, passwords, tokens, message payloads and health/financial
  data stay in the approved operator tooling. Redact evidence before attaching it
  to a ticket; do not dump whole queues, environments or secret objects.
- The alerts in `monitoring/health-alerts.yaml` are examples. Check that their
  metric names, labels, URLs and notification routes exist in the deployed
  exporter. For example MetricsService emits `http_requests_total` and
  `cache_hits_total`/`cache_misses_total`, while the example file uses other names.
  An absent alert does not prove a healthy service.
- Treat QueueService TypeScript snippets as service APIs, not executable shell
  commands or evidence of an HTTP admin endpoint. Some helpers replace failed
  queue reads with zero statistics; corroborate them with worker/Redis evidence.
- Read-only diagnosis comes first. Mutating mitigations require an authorized
  owner, target verification, captured evidence and a recovery plan. Financial
  replay/corrections need reconciliation and financial-owner approval. A
  production incident is not permission to delete data, bypass signatures or
  send synthetic messages to real recipients.

Record each step as passed, failed, blocked or not executed, with timestamp and
redacted evidence. Resolve the incident only after its domain-specific recovery
checks and the observation window; record remaining work and an owner.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 2.0.0 | 2026-10-19 | #1613: add Redis, provider and Stellar procedures; verify operator context, monitoring limitations and existing database/queue steps. |
| 1.0.0 | 2026-09-24 | Initial runbook set: database outage, auth issues, queue failures, reward regressions. |
| 1.1.0 | 2026-10-19 | Added the backup and restore verification runbook and index entry. |
