# Operations Workflows

This document describes the operational workflows delivered for issues #1352, #1353, #1354, and #1360.

## Service-Level Monitoring Targets

These targets define measurable reliability and latency objectives for key API workflows. Dashboards and alerts must use these documented values, and they must be reviewed after every incident.

- **Measurement window:** rolling 30 days, evaluated continuously with a 5-minute aggregation granularity.
- **Endpoint scope:**
  - `POST /webhooks/stellar` (webhook ingestion)
  - `/support/cases` (support case workflows)
  - `/admin/backfills/:jobKey/run` (backfill execution)
- **Availability (error-rate) threshold:** at least 99.9% of requests in the window must not return a 5xx response. Client errors (4xx) are excluded from the error budget.
- **Latency threshold:** at least 95% of requests must complete within 500 ms, and at least 99% within 2000 ms, measured at the server.
- **Alerting:** an alert fires when the 5-minute error rate exceeds 1% or the p95 latency exceeds 500 ms for 10 consecutive minutes.
- **Review:** every incident must include a review of these targets, confirming whether the thresholds, endpoint scope, and alert configuration remain accurate and adjusting them if necessary.

## Webhooks

`POST /webhooks/stellar` accepts a JSON event signed with `X-Stellar-Signature`. The signature is an HMAC-SHA256 hex digest over the exact raw request body. Events are deduplicated by `id`, `eventId`, or `event_id`; payloads without an identifier use a deterministic payload hash.

Accepted events are stored in `webhook_events`, emitted as `webhook.<type>`, and acknowledged with HTTP 202. Listener failures are retried with exponential backoff up to `WEBHOOK_MAX_ATTEMPTS`; permanently failed events remain available for operations review.

Required configuration:

```env
STELLAR_WEBHOOK_SECRET=replace-with-a-secret
WEBHOOK_MAX_ATTEMPTS=5
```

## Data retention

The daily retention job removes non-compliance audit logs after their `retention_expires_at` timestamp and user status logs older than `STATUS_LOG_RETENTION_DAYS` (default 90). Compliance audit events are never removed by this job. `RetentionService.purge()` is available for a controlled manual run.

## Support workflow

Support cases are available under `/support/cases`. Cases retain the affected user, category, status, description, and an append-only note history. Statuses are `open`, `in_progress`, `resolved`, and `closed`; resolved and closed cases receive a timestamp for reporting.

## Backfills

Backfill execution records are stored in `backfill_runs` and keyed uniquely by job key. A completed key cannot be run again, failed runs can be retried, and each run records processed and failed counts plus an error message. Register jobs with `BackfillService.register()` before exposing them through `/admin/backfills/:jobKey/run`.

The migration `1800000000000-add-operations-workflows` creates all required tables. Apply it through the normal TypeORM migration workflow before enabling these endpoints.
