# Testing Coupon Feature (Issue: XLM Milestone Coupons)

## Acceptance criteria checklist

| Criteria | How to verify |
|----------|----------------|
| Code generated in `@BeforeInsert()`: 8-char uppercase alphanumeric | Coupons returned from GET /coupons/me have `code` length 8, uppercase A–Z/0–9 |
| Triggered by `reward.milestone` event listener | Call POST /rewards/check-milestone (or have rewards recorded); then GET /coupons/me shows new coupons |
| GET /coupons/me returns user's active coupons | Call with valid JWT; returns array of active, non-expired coupons |
| Max 5 active coupons per user | After 5 coupons, further milestones do not create more until some are used/expired |
| Nightly cron marks expired coupons | Cron runs at 00:00; expired coupons get `status: 'expired'` (can check DB or logs) |
| Screenshot from server | Capture terminal + GET /coupons/me response (e.g. Swagger or curl) |

---

## 1. Start the server

```bash
npm run start:dev
```

Wait for: `Nest application successfully started`.

---

## 2. Get a JWT (login)

**Option A – Swagger UI**

1. Open http://localhost:3000/api/docs
2. Use **POST /auth/login** (or **POST /auth/register** then login) with body e.g.:
   ```json
   { "email": "your@email.com", "password": "yourpassword" }
   ```
3. Copy the `access_token` from the response.

**Option B – curl**

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}' | jq -r '.access_token'
```

Set the token for later:

```bash
export TOKEN="<paste_access_token_here>"
```

---

## 3. Call GET /coupons/me (before any milestones)

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/coupons/me
```

Expected: `[]` or existing coupons. Take a screenshot for the PR if you want “before” state.

---

## 4. Create reward data so a milestone is reached (one-time setup)

Milestones are: **10, 25, 50, 100, 250** XLM (sum of completed reward transactions).

You need at least one row in `reward_transactions` for your user with `status = 'COMPLETED'` and enough `amount` to cross a threshold (e.g. 10).

**Option A – SQL (replace `YOUR_USER_UUID` with your user id)**

Get your user id from the JWT payload (e.g. decode at https://jwt.io) or from the users table.

```sql
INSERT INTO reward_transactions (id, "userId", amount, status, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'YOUR_USER_UUID',
  10,
  'COMPLETED',
  NOW(),
  NOW()
);
```

**Option B – If your app has a flow that creates reward_transactions**

Complete that flow so the user has ≥10 XLM in completed rewards.

---

## 5. Trigger milestone check (creates coupons)

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/rewards/check-milestone
```

Expected: `{"message":"Milestone check completed. Check GET /coupons/me for new coupons."}`

---

## 6. Call GET /coupons/me again

```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/coupons/me
```

Expected: array with at least one coupon; each has `code` (8 chars), `discount`, `expiresAt`, `status: 'active'`, etc.

**Screenshot for PR:** terminal showing server running + this response (or Swagger response for GET /coupons/me).

---

## 7. Optional – Validate a coupon (POST /coupons/validate)

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"<ONE_OF_THE_8_CHAR_CODES>"}' \
  http://localhost:3000/coupons/validate
```

Expected: `{"valid":true}` (or reason if invalid).

---

## 8. Optional – Max 5 coupons

- Add more completed reward rows so the same user crosses 25, 50, 100, 250 XLM.
- Call **POST /rewards/check-milestone** after each.
- Call **GET /coupons/me**; you should see at most **5** active coupons. Further milestones do not add more until some are redeemed or expired.

---

## Quick reference

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| /auth/login | POST | No | Get JWT |
| /coupons/me | GET | Bearer | List my active coupons |
| /coupons/validate | POST | Bearer | Validate a coupon code |
| /rewards/check-milestone | POST | Bearer | Re-check XLM total and emit milestone (creates coupons) |
