# API Boundary Validation and Logging

## Incoming DTOs

The global `CustomValidationPipe` validates and transforms DTOs before controller
methods run. DTO properties must use `class-validator` decorators to be accepted.
Unknown properties are **rejected with HTTP 400**; they are not silently stripped.
Use `class-transformer` decorators such as `@Type()` when a request value needs
conversion to a non-string DTO type.

## Application logs

`CustomLogger` writes one JSON object per line to the application log file and
stdout. Each entry includes an ISO-8601 `timestamp`, uppercase severity in
`level`, and `service` (from `SERVICE_NAME`, defaulting to `uzima-backend`).
Request logs include both `requestId` and `correlationId` when a request ID is
available.
Context, trace, user ID, and structured metadata are optional.

Sensitive fields (including passwords, tokens, authorization values, cookies,
session IDs, API/private keys, OTPs, SSNs, and card data) are redacted before
output. Sensitive `key=value` text and bearer credentials in messages, traces,
and string metadata are also redacted.
