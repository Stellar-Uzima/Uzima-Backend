# Operational Runbooks

Step-by-step procedures for engineering and support teams responding to common
incidents and monitoring alerts in the Stellar Uzima backend.

## Runbook Index

| Runbook | Trigger / Alert | Severity | Owner (primary) | Escalation |
| --- | --- | --- | --- | --- |
| [Database Outage](./database-outage.md) | `ApplicationHealthCheckFailed`, `PodNotReady`, DB connection errors | SEV-1 | Backend on-call | Infra lead → CTO |
| [Authentication Issues](./auth-issues.md) | Login failure spike, JWT errors, account lockout surge | SEV-2 | Backend on-call | Security lead |
| [Queue Failures](./queue-failures.md) | `HighQueueBacklog`, dead-letter queue growth, stuck jobs | SEV-2 | Backend on-call | Platform lead |
| [Reward Regressions](./reward-regressions.md) | Reward balance complaints, failed reward jobs, wrong payouts | SEV-2 | Backend on-call | Product owner → Backend lead |

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
   minutes (`GET /health` returning 200 and `Alertmanager` silent).
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

- **Version format**: every runbook carries a `Version` header (`MAJOR.MINOR`).
  Bump **MAJOR** when the procedure changes (steps reordered, commands changed),
  **MINOR** for clarifications, contact updates, or new monitoring references.
- **Change log**: each runbook maintains a `## Changelog` section describing
  every version bump with the PR reference.
- **Review cadence**:
  1. Any PR that touches `docs/runbooks/` requires at least one review from the
     on-call rotation owner (CODEOWNERS path rule).
  2. **Quarterly fire drill**: once per quarter, an on-call engineer walks each
     runbook against staging and opens issues for any stale steps. Recorded in
     the changelog as a "Quarterly review — OK" entry.
  3. **Release gate**: the release checklist (run at every tagged release)
     includes the item "Runbooks reviewed for this release's changes" — e.g. a
     release that changes queue configuration must have the queue-failures
     runbook re-verified. This item lives in `.github/PULL_REQUEST_TEMPLATE.md`
     and the release checklist.
- Runbook changes that accompany a feature (new queue, new alert, new admin
  tooling) belong in the **same PR** as the feature whenever possible.

## Conventions Used in Runbooks

- **Dry-run first**: destructive commands are marked ⚠️ and must be run in a
  pair (one person types, another verifies) for SEV-1 systems.
- **Slash commands** reference the actual CLI available in the deploy
  environment (`kubectl`, `psql`, `redis-cli`).
- **Endpoints** are the production API base (`https://api.uzima.example`),
  authenticated with an admin token.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-09-24 | Initial runbook set: database outage, auth issues, queue failures, reward regressions. |
