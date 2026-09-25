# Runbook: Authentication Issues

**Version:** 1.0.0
**Severity:** SEV-2 (SEV-1 if all users are locked out or credentials are compromised)
**Primary owner:** Backend on-call
**Escalation:** Secondary on-call → Security lead → Team lead → CTO (if compromise)

## 1. Detection

Signals that auth is degraded:

- Spike in 401/403 response rates on `/api/v1/auth/*` endpoints.
- Surge of `failedLoginAttempts` / account-lockout events (users get
  `lockedUntil` set; see `src/entities/user.entity.ts`).
- `TokenExpiredError`, `JsonWebTokenError` in application logs.
- JWT secret/issuer mismatch after a config or deploy change.
- Support tickets: "can't log in", "logged out randomly", "2FA codes rejected".

Triage queries:

```bash
# Error mix in recent logs (adapt to your log platform)
kubectl logs deploy/uzima-backend --since=15m | grep -E "401|JsonWebTokenError|TokenExpiredError" | tail -50

# Health (auth depends on DB + Redis for sessions/refresh tokens)
curl -s https://api.uzima.example/health | jq
```

```sql
-- Lockout surge?
SELECT count(*) FROM users
WHERE locked_until > now() - interval '15 minutes';

-- Failed login concentration (single account vs. broad)?
SELECT count(*) AS failures, count(DISTINCT id) AS accounts
FROM users WHERE failed_login_attempts > 0;
```

## 2. Triage — classify the failure

| Symptom | Likely cause | Go to |
| --- | --- | --- |
| Broad 401s with `JsonWebTokenError: invalid signature` | JWT secret changed/rotated inconsistently | 3.1 |
| Broad 401s with `TokenExpiredError` | Clock skew or expirations misconfigured | 3.2 |
| One user / small group cannot log in | Account lockout or status change | 3.3 |
| Login 500s, DB/Redis errors in logs | Downstream dependency | 3.4 |
| 2FA codes rejected broadly | TOTP time drift | 3.5 |
| Logins succeed but sessions drop constantly | Refresh-token store issue (Redis) | 3.4 |
| Unexpected successful logins, unfamiliar IPs | **Possible credential compromise** | 3.6 |

## 3. Mitigation

### 3.1 JWT signature errors

1. Check what changed: recent deploys, secret rotation, `JWT_SECRET` in
   `uzima-secrets` vs the value the pods actually run with.
2. If a rotation half-completed, restore the **previous** secret to unblock
   users, then rotate properly during a quiet window:
   ⚠️ `kubectl set env deploy/uzima-backend JWT_SECRET=<previous>` (pair-verify)
   followed by `kubectl rollout restart deployment/uzima-backend`.
3. Note: outstanding tokens signed with the old secret will fail once more —
   prefer a dual-key verification window if the codebase supports it, otherwise
   expect one re-login per user and say so in comms.

### 3.2 Expiry / clock skew

1. Compare pod time to NTP: `kubectl exec <pod> -- date -u` vs `date -u` on a
   known-good host.
2. Verify `JWT_EXPIRATION` config was not changed (default `7d`).
3. Fix clock sync (node restart usually re-syncs) or revert the expiry change.

### 3.3 Account lockouts

1. Confirm the surge is organic (typical for credential-stuffing waves) vs a
   bug (lockout on correct passwords).
2. For **verified-safe** users, unlock:
   ```sql
   UPDATE users SET failed_login_attempts = 0, locked_until = NULL
   WHERE id IN ('<uuid>', ...);
   ```
   Every unlock is auditable — log the action with `AuditService.logAction`.
3. If a bug is locking people out, roll back the most recent auth-related
   deploy: `kubectl rollout undo deployment/uzima-backend`.

### 3.4 Downstream dependency (DB/Redis)

Follow [database-outage.md](./database-outage.md) if `/health` shows `database`
failing. If only Redis is down (sessions/refresh tokens, rate limiting):

1. `kubectl get pods -l app=redis` / provider status.
2. Restart Redis or failover; refresh tokens stored in Redis are lost — users
   will need to log in again (communicate this).
3. Verify `/health` `redis` indicator returns to `up`.

### 3.5 TOTP drift

1. Confirm server time is NTP-synced (TOTP is time-based; see `otplib` usage in
   the auth module).
2. Rejects that started after a DST/timezone change usually resolve with clock
   fix + user re-enrollment only as a last resort.

### 3.6 Suspected credential compromise ⚠️ SEV-1 path

1. **Do not tip off** beyond the incident channel; involve the security lead
   before any user-facing action.
2. Force global logout by rotating `JWT_SECRET` (invalidates all tokens), then
   restart the deployment.
3. Revoke refresh tokens:
   ```sql
   UPDATE users SET refresh_token = NULL, refresh_token_expiry = NULL;
   ```
4. Suspend affected accounts via the admin API
   (`PATCH /api/v1/admin/users/:id/suspend`), capture evidence (IPs, user
   agents) from logs and the `audit_logs` table first.
5. Follow the security incident process for disclosure; CTO must be informed
   within the hour.

## 4. Duties During the Incident

| Role | Duty |
| --- | --- |
| On-call engineer | Triage, execute mitigation, capture log/DB evidence |
| Security lead | Called for 3.6 or any suspicion of compromise; owns disclosure decisions |
| Support lead | Quantifies affected users, tracks ticket themes, drafts user comms |
| Team lead | Decides rollback vs forward-fix, approves credential rotations |

## 5. Communication

- Incident channel `#inc-<date>-auth`; updates every 2 hours (SEV-2), 30
  minutes if upgraded to SEV-1.
- Support talking points: whether logins are affected globally or per-account,
  whether users must re-authenticate, ETA for the next update.
- Never share secrets, token payloads, or user credentials in the channel.

## 6. Recovery Verification

1. 401 rate back to baseline on the auth dashboard.
2. No new lockout rows: the SQL check in §1 returns near-zero.
3. `/health` fully green (DB + Redis).
4. A manual login + refresh-token rotation smoke test with a staging account.
5. Alerts silent for 30 minutes.

## 7. Post-mortem

Same template as the index ([README.md](./README.md)). For auth incidents
always answer: was any data exposed, which secrets were rotated, and what
stops a repeat (rate limiting, alerting on lockout spikes, secret-rotation
automation).

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.0.0 | 2026-09-24 | Initial version. |
