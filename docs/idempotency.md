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
