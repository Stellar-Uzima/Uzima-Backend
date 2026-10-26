# API contract tests

Run `npm ci` and `npm run test:contracts` (Node 20, matching CI).
Both pull requests and pushes to main/develop run the API Contract Tests job.
The command fails if no contract tests are found.

The suite sends HTTP requests through the registered production controllers,
URI versioning, CustomValidationPipe, StandardizedExceptionFilter and
TransformInterceptor. No database, Redis or Stellar connection is required.
Service doubles provide deterministic results for controller and validation cases.
Additional cases execute production service methods for auth register/login,
health-task lists, savings goal details/lists, wallet summaries and reward payouts.
Those cases replace repository, cache, token-generation and network collaborators,
so response field renames and mapping changes inside services are also detected.
Service instances in those cases are assembled without invoking constructors that
connect to external infrastructure. Persistence, dependency-injection startup,
token verification and rate limiting still need the integration suites.

Contracts include exact status codes, success/error envelopes, date serialization,
nullable fields, pagination, DTO rejection and controller-to-service arguments.
Unknown body/query properties must be rejected and invalid requests must not reach
services. Dynamic timestamps are checked without committing time-sensitive snapshots.

For an intentional breaking change, follow the API versioning policy and review
any corresponding contract assertion changes. Do not regenerate expectations
blindly or accept multiple status codes to make a failure disappear.

The health-task controller currently registers `/api/v1/tasks` and has a local
placeholder authentication guard. This suite does not claim to verify its JWT
security. Other protected routes use a deterministic guard double to test their
HTTP authentication error envelope.
