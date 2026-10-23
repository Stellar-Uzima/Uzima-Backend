# Runbook: Notification Provider Incidents

**Version:** 1.0.0
**Severity:** SEV-2; SEV-1 for a complete outage of a critical notification flow
**Primary owner:** Backend on-call
**Escalation:** Platform lead → Provider account owner; Security for credential exposure

## 1. Detection and diagnosis

Symptoms include missing SMS/push, stale delivery logs, exhausted retries and an
open provider circuit. Identify channel, notification type, first failure time
and sanitized correlation/delivery IDs. Check user preferences before treating
an intentionally disabled channel as an outage.

The active facade is `src/modules/notifications/notifications.module.ts`, which
imports NotificationCenterModule. Start diagnosis in
`src/modules/notification-center/channel-router.service.ts`, not an unrelated
legacy notification service.

| Channel/path  | Source and diagnosis                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SMS           | `src/shared/sms/sms.service.ts`: check Twilio status/quota and the configured SID, token and sender privately; distinguish invalid recipient from network/429/auth failures                                   |

### 1.1 Provider response classification

SMS provider responses must be classified into exactly one of two outcomes:

- **Retryable:** network timeouts, connection resets, HTTP 429 (rate limited), and HTTP 5xx provider errors. These consume the configured retry budget and respect the channel circuit. Do not retry beyond the budget.
- **Terminal:** invalid recipient or number format, authentication/authorization failures (401/403), rejected sender identity, and rendering failures. These must not be retried; mark the delivery as failed and escalate only if the failure rate is abnormal.

Every classified outcome, retryable or terminal, must be logged with a trace reference (the sanitized correlation/delivery ID). Never log phone numbers, message bodies, or credentials alongside the trace reference.

User-facing flows must remain safe during provider failure: a failed or queued SMS must not block the originating request, must not expose provider error details to the user, and must present a neutral status (queued or unavailable) rather than a raw error.

When diagnosing, filter logs by trace reference first, then confirm the classification recorded for that attempt before changing configuration or replaying anything.

| Push          | `src/shared/notifications/services/push-notification.service.ts`: check Firebase initialization, token validity and provider response; missing credentials select offline/mock mode and do not prove delivery |
| Email         | `ChannelRouterService.dispatchEmail` renders the `notification` template and logs; the actual mailer is still a TODO. A logged email is not an external provider receipt                                      |
| Retry/sweeper | `notification-center-retry-queue`, delivery logs, `delivery-sweeper.service.ts` and `processors/retry.processor.ts`: inspect attempts, age, final status and escalation                                       |

Useful existing signals in MetricsService are `notification_deliveries_total`,
`notification_delivery_retries_total` and `notification_provider_circuit_state`.
They measure application attempts/circuit state, not receipt by the final user.
Verify scrape labels and the deployed metrics URL before querying them.

The notification-center retry queue is separate from `notification-queue` and
is not one of QueueService's seven mapped queues. A successful `/health/queue`
response does not establish that its retry worker is running. Check its actual
Bull registration and the `uzima` prefix before inspecting Redis keys.

## 2. Mitigation

1. Classify configuration/credentials, rate limiting, provider outage, invalid
   recipient/token, rendering failure, or worker failure using sanitized logs.
   Validate the template path before diagnosing email as a provider outage.
2. Restore a known-good provider configuration through the approved deployment
   process. Credentials belong in the secret manager, not a ticket or shell log.
3. For 429/outage, respect provider quotas, the configured retry budget and the
   channel circuit. Do not reset attempts or repeatedly restart pods to bypass
   backoff. Circuit state is process-local and a restart is not evidence of
   recovery.
4. For push-token failures, follow the application/provider's token lifecycle;
   do not substitute another user's token. Do not enable notifications against
   the user's preferences to obtain a successful test.
5. Inspect delivery logs and sweeper results before replaying anything. Agree a
   bounded set with the service owner and guard against duplicate SMS/push or
   repeated sensitive content. No public bulk-replay endpoint is assumed here.
6. If a deployment introduced the fault, assess a rollback with the release
   owner, including compatibility of pending delivery payloads and database
   schema. Preserve the delivery evidence.

## 3. Escalation and communication

The provider account owner handles quota/account restrictions; Platform handles
workers and Redis. Security owns suspected key exposure or unintended delivery
of personal/health information. Escalate critical notification loss to SEV-1.
Support updates must distinguish queued, attempted, provider-accepted and
confirmed-delivered messages. State the affected channel and next update time;
do not publish phone numbers, FCM tokens, message bodies or provider credentials.

## 4. Recovery verification

- The underlying configuration/provider fault is resolved; circuit probes
  recover without repeated reopenings.
- The specific retry queue is consumed; attempts and stale/escalated delivery
  counts stabilize. Confirm a new successful attempt in the delivery record.
- In staging, send one approved synthetic notification to a designated test
  recipient and inspect the provider result/receipt where supported. An FCM mock
  or email log cannot satisfy live provider verification.
- Confirm preferences still apply, retries remain bounded and duplicates have
  not appeared. Observe for the index's 30-minute window.

Record outstanding undelivered items, provider confirmation, replay approvals,
user impact and prevention work in the post-mortem. External delivery tests
requiring operator credentials must be recorded as unexecuted until performed.

## Changelog

| Version | Date       | Change                                                 |
| ------- | ---------- | ------------------------------------------------------ |
| 1.0.0   | 2026-10-19 | Initial provider/channel response procedure for #1613. |
| 1.1.0   | 2026-10-20 | Added SMS provider response classification (retryable vs terminal), trace-reference logging, and user-facing safety guidance for issue 096. |
