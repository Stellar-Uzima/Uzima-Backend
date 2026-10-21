# Public API versioning and OpenAPI policy

## Versioning rules

- Public routes use URI versioning: `/api/v1/<resource>`. The URI version is the
  compatibility boundary clients should pin to.
- Version 1 is the default version for routes without an explicit `@Version()`
  decorator. New public routes therefore join version 1 unless they explicitly
  target a newer version.
- A compatible change may add an optional request field, response field,
  endpoint, or enum value. Existing fields, defaults, status codes, validation
  rules, and response meanings must remain unchanged.
- A change is breaking when it removes or renames a route or field, changes a
  field's type or meaning, makes an optional input required, narrows accepted
  input, or changes an established response/status contract. Introduce a new
  URI version for a breaking change and keep the previous implementation
  available during migration.
- Do not silently redirect old-version requests to a new contract. Implement
  both versions explicitly (for example, with `@Version('1')` and
  `@Version('2')`) and test each published contract.

## Deprecation expectations

- Announce a version deprecation before removing it. The notice must identify
  the affected version, replacement version, migration guidance, and planned
  removal date.
- Continue serving a deprecated version through its announced migration
  window. Where operationally supported, return the standard `Deprecation`,
  `Sunset`, and `Link` headers on deprecated routes.
- Removal requires a release note and must not occur before the published
  sunset date. Security or legal emergencies may require an exception; document
  the reason and notify affected consumers as soon as practical.

## OpenAPI contract

The Swagger document is served at `/api/docs`. The Nest Swagger compiler plugin
derives DTO property schemas and validation constraints from DTO types and
`class-validator` decorators. Keep route annotations (`@ApiOperation`,
`@ApiParam`, `@ApiQuery`, and response decorators) in sync with runtime
behavior; describe bearer authentication on protected operations and include
the actual success response type where one is available.

Every documented failure response uses the shared
`ApiErrorResponse` schema. Its JSON shape is `{ "error": { "code", "message",
"statusCode", "details"?, "path", "method", "requestId"?, "timestamp" } }`.
Validation details are keyed by property and contain the corresponding
validation messages. Clients should branch on `error.code`, not the
human-readable `error.message`.

## Contract testing

Contract tests must initialize URI versioning with the same prefix and default
version as the production bootstrap, issue requests to the versioned URL, and
assert the externally observable status and response shape. Add or update these
tests whenever a public version's request or response contract changes.
