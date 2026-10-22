# Backend release readiness

Use this record before deploying a backend revision. Copy the template below to
the release issue or a versioned release record and link it from the deployment
request. A blank template, a merged PR or a green summary job is not approval.

The release owner coordinates completion. Individual check owners supply
evidence; authorized reviewers make the go/no-go decision. The existing
[Security Review Checklist](./SECURITY_REVIEW_CHECKLIST.md) remains mandatory,
including its two authorized reviewers. This checklist links to it rather than
replacing its controls or approval requirements.

## Record rules

- Identify an immutable commit SHA, artifact/image digest and environment.
  Re-evaluate affected checks if any of them changes after review.
- Use one status per row: `PENDING`, `PASS`, `FAIL`, `N/A` or
  `EXCEPTION_APPROVED`. Every row requires an owner, timestamp and evidence link
  or a specific reason. `N/A` requires a reviewed scope explanation.
- A command result records the exact command, revision, exit status and redacted
  output. An unexecuted test remains `PENDING`/blocked, not `PASS`.
- Existing failures remain visible. A previously failing build/test or skipped
  gate does not become a pass because the release is documentation-only.
  Explain the effect of the change separately from the release's readiness.
- An operational exception records risk, compensating controls, an authorized
  approver, expiry, a tracked follow-up owner and the exact check it covers.
  The release owner cannot self-approve an exception to a check they performed.
  Exceptions do not waive mandatory security approvals, unresolved exposed
  secrets, data-loss risk, or unreconciled financial effects.
- `FAIL`/`PENDING` blocks a production go decision until resolved or, where
  permitted, replaced by a properly recorded exception. Preserve the original
  failure evidence when an exception is approved. A staging-only approval must
  specify its restricted target and must not be reused for production.

## Template: release identity and ownership

```text
Release/version:
Release record URL:
Commit SHA:
Artifact/image digest:
Previous verified release SHA/digest:
Target environment, cluster/context and namespace:
Deployment window and timezone:
Change/PR/issue links:
Release owner:
Deployment operator:
Migration/data owner:
Security reviewers (two authorized people):
On-call/rollback owner:
Affected services, queues, providers and consumers:
```

## Template: pre-deployment evidence

Fill the final four columns for every row. `PENDING` is the initial state.

| ID     | Check / required evidence                                                                                                                                     | Owner | Status  | Evidence / result | Checked at (UTC) |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------- | ----------------- | ---------------- |
| REL-01 | Scope, breaking changes, linked PRs and dependency updates reviewed; artifact matches the reviewed SHA                                                        |       | PENDING |                   |                  |
| REL-02 | Build and relevant CI jobs inspected individually on this SHA; no unresolved blocking check                                                                   |       | PENDING |                   |                  |
| REL-03 | Unit/regression tests for affected behaviour; commands, outcomes and coverage limitations recorded                                                            |       | PENDING |                   |                  |
| REL-04 | PostgreSQL isolation checks (`test:db`) and applicable full application E2E; scoped fixture success distinguished from complete application success           |       | PENDING |                   |                  |
| REL-05 | Migrations inventoried, ordered and tested on a disposable/restored database, with schema/data compatibility and expected duration/locking assessed           |       | PENDING |                   |                  |
| REL-06 | Backup/snapshot identified; restore drill evidence, authorized recovery owner and environment-specific recovery objectives recorded                           |       | PENDING |                   |                  |
| REL-07 | Config changes and secret references checked for the target; required settings, rotations, network selection and permissions verified without exposing values |       | PENDING |                   |                  |
| REL-08 | Security checklist completed and linked; both authorized approvals and all blocking security results reviewed                                                 |       | PENDING |                   |                  |
| REL-09 | API/auth/permission and consumer compatibility verified; documentation and contract changes reviewed                                                          |       | PENDING |                   |                  |
| REL-10 | Redis/Bull worker compatibility, job payloads, retry budgets, dead letters and replay/idempotency risks reviewed                                              |       | PENDING |                   |                  |
| REL-11 | Notification providers/Stellar consumers tested as applicable, with mock versus live results and testnet versus mainnet clearly identified                    |       | PENDING |                   |                  |
| REL-12 | Health URLs/ports, probes, metrics, alert queries, scrape configuration and notification destinations verified in the target                                  |       | PENDING |                   |                  |
| REL-13 | Affected operational runbooks reviewed; procedure changes include Version/changelog update and on-call review                                                 |       | PENDING |                   |                  |
| REL-14 | Rollback artifact and trigger thresholds recorded; application and database rollback/forward-recovery compatibility verified                                  |       | PENDING |                   |                  |
| REL-15 | Deployment sequence, responsible operator, communications and observation window agreed; exceptions reviewed and unexpired                                    |       | PENDING |                   |                  |

### Evidence sources and important limits

**Tests/build:** derive commands from `package.json` and inspect
`.github/workflows/ci.yml`, `pr-checks.yml` and `security-review.yml`. Current
scripts include `npm run build`, `npm test`, `npm run test:db`,
`npm run test:e2e`, `npm run lint:check` and `npm run format:check`.
`npm run lint` modifies files. The database harness needs explicit `TEST_DB_*`
settings and a disposable PostgreSQL 15 server; see
[Isolated E2E databases](./e2e-database.md). Its focused initial-schema fixtures
do not prove all entities/migrations work. Do not omit a failing required suite
or lower a threshold to complete this record.

**Migrations:** review `src/database/data-source.ts` and the actual migration
list, plus [Database Migration Workflow](./database-migration-workflow.md) and
[CONTRIBUTING](../CONTRIBUTING.md). Confirm CLI commands against `package.json`;
there is no `typeorm` npm script. The current `migrate` entry uses TypeORM CLI,
and loader/application failures must be recorded instead of described as a
successful rehearsal. `migrate:rollback` is one migration, not a full restore.
Assess irreversible data transformations and old/new application compatibility;
do not edit historical migrations or run destructive checks on production.

**Configuration:** bootstrap reads `APP_PORT` (default 3001), while the active
DatabaseModule reads `DB_NAME`; CLI/legacy factories have different aliases.
QueueModule uses the `REDIS_*` settings and Bull prefix `uzima`. Confirm the
exact consumer, including notification-center's separate retry queue and every
Stellar client/network. A placeholder/absent provider credential is not a live
integration check.

**Monitoring:** the Kubernetes and Docker examples use port 3000 and `/health`,
while bootstrap defaults to 3001 and URI versioning. Establish the effective
probe URL/port in the target. `monitoring/health-alerts.yaml` is an example, not
proof of deployed alerts. Confirm emitted metric names/labels: a quiet alert
with a nonmatching query is not recovery evidence. Health 200 also does not
prove all queues, external message delivery or on-chain reconciliation.

**Security gates:** inspect individual outcomes, not only `Security Summary`.
`Production Release Gate` is a conditional job, and dependency checks can be
skipped depending on event type. A skipped gate or text containing
`security-approved` is not a substitute for the checklist's actual authorized
approvals. Record missing evidence as blocking and escalate to the maintainer;
this document does not change or bypass CI/branch-protection policy.

**Runbooks:** use the [runbook index](./runbooks/README.md), including database,
queues, auth and rewards, plus any procedures added for the affected feature.
Verify links against the release revision. Do not mark a new/unmerged procedure
as already deployed or reviewed.

## Template: rollback and recovery plan

```text
Decision-maker and rollback operator:
Triggers and observation window (error/latency/backlog/data-integrity criteria):
Previous verified artifact SHA/digest and availability:
Application rollback steps and verification:
Database changes; old/new application compatibility:
Database down-migration OR forward-recovery/restore plan, with rehearsal evidence:
Backup identifier, restore target, authorized owner and recovery objectives:
Pending jobs, schemas, provider requests and transaction reconciliation:
Communications and escalation contacts/roles:
Abort conditions; conditions under which rollback is unsafe:
```

For Kubernetes installations, `kubectl rollout undo` only changes the deployed
application revision; it does not reverse database writes or Stellar effects.
Use an operator-reviewed, target-specific plan rather than treating one command
as a universal rollback.

## Template: approved operational exceptions

| Check ID | Failure/blocker and evidence | Risk and compensating control | Follow-up issue and owner | Authorized approver and approval evidence | Expiry (UTC) |
| -------- | ---------------------------- | ----------------------------- | ------------------------- | ----------------------------------------- | ------------ |
|          |                              |                               |                           |                                           |              |

If an exception is missing an approver/evidence, has expired, or does not cover
the exact target revision, the check remains blocking. Reapproval is required
after scope changes. Do not fill approvals on someone else's behalf.

## Template: go/no-go and post-deployment record

```text
Decision: PENDING / NO-GO / GO-STAGING-ONLY / GO-PRODUCTION
Approved revision, artifact digest and exact target:
Release owner's completion record and timestamp:
Security approval record (two authorized reviewers):
Authorized release approver, decision timestamp and evidence URL:
Accepted operational exception IDs and expiry:
Unresolved blockers (NO-GO unless a permitted exception applies):
Deployment operator, start/end timestamps and deployment evidence:
Smoke/readiness, error/latency, queue and provider verification results:
Migration/schema and financial reconciliation results:
Observation window start/end and on-call owner:
Rollback invoked? Trigger, decision, execution and recovery evidence:
Final outcome: PENDING / VERIFIED / ROLLED-BACK / INCIDENT-OPEN
Follow-up issues and owners:
```

Do not close the record until the target-specific smoke tests and observation
window are complete. Keep financial/provider reconciliation open when its result
is still uncertain. Store evidence links and redacted results, never `.env`
files, tokens, private keys, patient data or message payloads.
