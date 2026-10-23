# Idempotency Keys

Retryable write endpoints accept an optional `Idempotency-Key` request header.

## Key scope
An idempotency key is scoped to the authenticated user (or client IP for
anonymous requests), the HTTP method, and the request path. The same key value
may be reused by different users or against different endpoints without
collision.

## Expiration
A key is retained for 24 hours from the first successful response. After it
expires, the key may be reused and is processed as a brand-new request.

## Mismatched payloads
Reusing a key within its lifetime with a different request payload (method,
path, query parameters, or body) returns `409 Conflict` and does not execute
the operation again. Reusing a key with an identical payload returns the
original response, including its status code and body, without re-running the
endpoint.

## Referral rewards and idempotency
Referral reward issuance is a retryable write. Requests that settle referral
rewards accept the `Idempotency-Key` header and follow the rules above. In
addition, reward issuance is guarded by the referral's qualification state:

- A reward is only granted after every configured qualification event for the
  referral has been verified.
- Each referral produces at most one reward per configured reward type,
  regardless of how many distinct idempotency keys are used. A repeated
  settlement attempt for an already-rewarded referral and reward type is a
  no-op that returns the existing reward record.
