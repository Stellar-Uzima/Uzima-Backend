# Runbook: Stellar Incidents

**Version:** 1.0.0
**Severity:** SEV-2; SEV-1 for suspected lost/duplicate funds or broad payout failure
**Primary owner:** Backend on-call
**Escalation:** Backend lead → Platform/provider owner → Financial/product owner

## 1. Detection and diagnosis

Symptoms include Horizon timeouts, stale balances, failed reward/withdrawal
processing, webhook signature errors, and a growing Stellar-related failure
category. Capture network, operation, request/correlation ID, transaction hash
if available, error code and incident start time. Never collect seed phrases,
secret keys, signed envelopes or personal account data in a public incident.

1. Identify the exact consumer and network. `src/stellar/stellar.service.ts`
   constructs a testnet Horizon client directly. The price-feed service reads
   `STELLAR_HORIZON_URL`; changing that variable does not switch every consumer.
   Confirm the deployed code and endpoint rather than inferring mainnet/testnet
   from a single environment variable.
2. Distinguish provider/network errors from Stellar result codes, account state
   and business validation. `accountExists` returns `false` and
   `getAccountBalance` returns `null` after a provider failure; these values alone
   do not prove a nonexistent account or a zero balance.
3. Inspect the read-call resilience policy: three attempts, bounded timeout,
   exponential delay/jitter and an in-memory circuit in ResilienceService. A
   healthy backend/Redis check is not a Horizon health check.
4. For a transaction with unknown outcome, use its hash to inspect status on the
   **same** network through the approved read-only Horizon/explorer tooling.
   Preserve its sequence, time bounds and result codes for the financial owner.
5. For webhooks, inspect the active `src/modules/webhooks/` path. It validates
   HMAC over raw bytes using `STELLAR_WEBHOOK_SECRET`, deduplicates event IDs and
   records retries/failure in `webhook_events`. Confirm the signature format and
   secret version without logging either secret or raw payload.

## 2. Mitigation

- For provider outage, check the provider status and allow bounded retries and
  circuit recovery. An endpoint failover requires the operator to verify the
  network/passphrase, TLS and returned data before rollout. Never silently send
  a testnet operation to mainnet or vice versa.
- For unknown transaction outcome, reconcile on-chain status and persisted
  reward/withdrawal state **before** any resubmission. A client timeout is not
  evidence that a transaction failed. Rebuilding a transaction or replaying a
  payout can duplicate financial effects.
- For sequence, fee, balance, authorization or contract errors, retain the
  actual result code and obtain the financial/service owner's decision. This
  runbook does not authorize funding, signing, transfers or balance edits.
- For webhook authentication failure, restore the correct configured secret
  through the normal secret-management process. Keep signature verification
  enabled. Do not fabricate an accepted event or modify its ID to force replay.
- Repair the listener/dependency before reviewing retrying/failed webhook rows.
  The scheduler retries due records; the default maximum is five attempts and
  the delay is bounded. Avoid manually invoking processing concurrently with it.
- For a regression, the release owner assesses application rollback, schema
  compatibility and pending work together. Reconcile ledger effects separately;
  an application rollback does not reverse a transaction already on-chain.

## 3. Escalation and communication

Page the financial/product owner immediately for duplicate or missing funds,
network mismatch or uncertain transaction state. Security owns key exposure or
signature bypass suspicion. Platform/provider owners handle Horizon availability.
Use [Reward Regressions](./reward-regressions.md) and
[Queue Failures](./queue-failures.md) when their pipelines are affected.
State what is confirmed versus pending reconciliation, user impact and next
update time. Do not promise that a payment failed, succeeded or was reversed
until the evidence supports it.

## 4. Recovery verification

1. Read-only provider requests to the confirmed network succeed across the
   observation window; stale cached values are distinguished from fresh data.
2. Every affected transaction is reconciled against its hash and application
   record, including duplicates and unknown outcomes. Obtain financial-owner
   sign-off for unresolved discrepancies and any corrective action.
3. Webhook records progress to the expected terminal state without duplicate
   listener effects. Invalid signatures remain rejected; exhausted events stay
   visible for review rather than being marked processed manually.
4. Reward/withdrawal queues recover without new duplicate effects. A testnet
   drill may use a designated synthetic account with separate authorization;
   it is not a production-funds recovery test.
5. Observe for at least the index's 30-minute window; retain longer financial
   reconciliation when needed. Record the cause, network, affected hashes,
   reconciliation evidence and owners in the post-mortem.

## Changelog

| Version | Date       | Change                                                        |
| ------- | ---------- | ------------------------------------------------------------- |
| 1.0.0   | 2026-10-19 | Initial Stellar/Horizon/webhook response procedure for #1613. |
