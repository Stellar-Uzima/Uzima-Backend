# Runbook: Reward Regressions

**Version:** 1.0.0
**Severity:** SEV-2 (SEV-1 if payouts are wrong at scale or funds are duplicated/lost)
**Primary owner:** Backend on-call
**Escalation:** Secondary on-call → Product owner → Backend lead → CTO (financial impact)

## 1. Detection

The reward pipeline runs through the `reward-queue`
(`reward-distribution`, `reward-calculation`, `reward-claim` jobs in
`src/queue/queue.constants.ts`) with failed jobs collected in the
`reward-dead-letter-queue`.

Signals:

- `HighQueueBacklog` on the reward queue, or dead-letter growth.
- `GET /api/v1/admin/rewards/failed-jobs` count rising.
- Support tickets: "didn't receive my XLM reward", "reward amount is wrong",
  "double reward for one task".
- `dailyXlmEarned` values that violate daily caps found in data checks.
- A reward-affecting deploy just shipped (calculation rules, streaks, coupons).

Triage commands:

```bash
# Failed reward jobs (admin token)
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.uzima.example/api/v1/admin/rewards/failed-jobs?limit=50 | jq

# Recent reward processor errors
kubectl logs deploy/uzima-backend --since=60m | grep -iE "reward" | grep -iE "fail|error" | tail -50
```

```sql
-- Payout volume and totals in the last 24h vs the previous day
SELECT date_trunc('day', created_at) AS day, count(*), sum(amount)
FROM reward_transactions WHERE created_at > now() - interval '2 days'
GROUP BY day ORDER BY day;

-- Users with abnormally high daily earnings (cap check)
SELECT id, email, daily_xlm_earned FROM users
WHERE daily_xlm_earned > <EXPECTED_DAILY_CAP> LIMIT 20;

-- Duplicate payouts for the same task
SELECT user_id, task_id, count(*) FROM reward_transactions
WHERE created_at > now() - interval '2 days'
GROUP BY user_id, task_id HAVING count(*) > 1 LIMIT 20;
```

## 2. Triage — classify the failure

| Symptom | Likely cause | Go to |
| --- | --- | --- |
| Jobs failing, dead-letter queue grows | Payout dependency/DB error | 3.1 |
| Wrong amounts paid after a deploy | Calculation rule regression | 3.2 |
| Duplicate payouts | Non-idempotent replay / double enqueue | 3.3 |
| Rewards missing but jobs "completed" | Wrong user/task mapping, silent no-op | 3.4 |
| Daily cap violations | Streak/bonus logic bug or backdated grants | 3.5 |

## 3. Mitigation

### 3.1 Failed reward jobs

1. Inspect `failedReason` in the failed-jobs listing.
2. Fix the underlying cause (DB constraint, wallet fetch failure, etc.).
3. Replay: `POST /api/v1/admin/rewards/failed-jobs/:id/retry` per job.
   ⚠️ Confirm idempotency of the reward processor before batch replays —
   a non-idempotent replay turns a failure into duplicates (3.3).

### 3.2 Wrong amounts (calculation regression)

1. **Stop the bleeding first**: pause the reward queue
   (`QueueService.pauseQueue('reward-queue')`) so wrong payouts stop accumulating.
2. Identify the offending commit: `git log --oneline -- src/rewards/` and diff
   calculation logic against the last known-good release.
3. Roll back the deploy (`kubectl rollout undo deployment/uzima-backend`) or
   ship a hotfix. Resume the queue only with the fixed code running.
4. Compute the blast radius: run the §1 SQL to list transactions since the
   offending release; overpaid users and underpaid users both go on the
   correction list (3.6).

### 3.3 Duplicate payouts

1. Pause the reward queue immediately (as above).
2. Identify duplicates with the §1 duplicate-payout query.
3. ⚠️ Coordinate with the product owner before **any** clawback: reversing user
   funds is a support-sensitive action. Prefer crediting corrections over
   debits where possible.
4. File a financial-impact note in the incident channel (amounts, user count);
   CTO is informed if totals are material.

### 3.4 Missing rewards (jobs completed, no payout)

1. Check the processor logs for silent no-ops (conditions that skip payouts
   without failing the job).
2. Verify the user actually qualifies (task verified? streak logic correct?).
3. Re-enqueue corrected jobs manually or grant rewards through the admin
   reward tooling; record every manual grant in the incident channel with a
   reason.

### 3.5 Daily cap violations

1. Verify the cap logic in the rewards module and any streak multipliers.
2. Reset offending `dailyXlmEarned` values only with product-owner approval —
   the number may legitimately reflect backdated campaign grants.
3. Add/verify an alert on cap violations so this is caught automatically.

### 3.6 Corrections (over/under-payment)

Corrections are executed as explicit adjustment transactions referencing the
incident, never by editing `walletBalance` in place:

- Over-payment: adjustment entry (negative) with `reason: incident-<id>`.
- Under-payment: re-run the reward job or manual grant with the same reference.

The product owner signs off on the correction list; support notifies affected
users.

## 4. Duties During the Incident

| Role | Duty |
| --- | --- |
| On-call engineer | Pauses/resumes queue, gathers payout evidence, replays jobs |
| Product owner | Approves correction lists and user comms |
| Backend lead | Owns root-cause fix and rollback decision |
| CTO | Informed for material financial impact; approves clawbacks |
| Support lead | Notifies affected users about corrections |

## 5. Communication

- Incident channel `#inc-<date>-rewards`; updates every 2 hours (SEV-2).
- Money-related comms are precise: amounts, counts, and correction direction
  (credit vs debit). No speculation about totals until the SQL evidence is in.
- Users are contacted **only after** the correction list is approved.

## 6. Recovery Verification

1. Reward queue backlog drained; dead-letter queue stable.
2. §1 SQL shows payout volume/amounts back within expected ranges.
3. No new cap violations or duplicates over a 24h window.
4. Alerts silent for 30 minutes.

## 7. Post-mortem

Use the index template ([README.md](./README.md)). Reward incidents must
additionally document: total financial impact (over/under-paid), correction
plan with owners, and which test gap allowed the regression (a payout-rule
regression test is the standard follow-up action).

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-09-24 | Initial version. |
