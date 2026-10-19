# Isolated E2E databases

E2E tests use PostgreSQL 15, matching CI. They never load development credentials
from `.env`. Every Jest test file creates its own database named
`<TEST_DB_NAME>_<random suffix>` and drops only that database during teardown.
Application connections use the same generated name through the existing `DB_*`
and `DATABASE_*` aliases. No development database is migrated or reset.

## Local setup

Start a disposable PostgreSQL server on a separate local port:

```sh
docker run --rm --name uzima-e2e-postgres \
  -e POSTGRES_PASSWORD=e2e-local-only \
  -p 127.0.0.1:55432:5432 postgres:15-alpine
```

Wait for PostgreSQL to report that it is ready. In another terminal, set all of
these variables explicitly (PowerShell uses `$env:NAME = 'value'`):

```sh
export NODE_ENV=test
export TEST_DATABASE_TYPE=postgres
export TEST_DB_HOST=127.0.0.1
export TEST_DB_PORT=55432
export TEST_DB_USERNAME=postgres
export TEST_DB_PASSWORD=e2e-local-only
export TEST_DB_NAME=uzima_test
npm run test:db -- --maxWorkers=2
npm run test:db -- --runInBand --detectOpenHandles
npm run test:e2e
```

`TEST_DB_NAME` is a base name, not a database that must exist. It must end in
`_test`, contain only lowercase letters, digits and underscores, and have at most
40 characters. It must differ from `DB_NAME`, `DB_DATABASE` and `DATABASE_NAME`
when those are set. Missing fields, unsupported engines and invalid ports fail
before connecting. Only `TEST_DB_*` credentials are used, with no fallback to
development settings. The test role must be able to connect to the `postgres`
maintenance database and create/drop databases on this disposable server.

The existing application E2E suites may also need Redis and other application
dependencies. Configure those separately for testing. `test:db` exercises the
database harness against real PostgreSQL, including a focused Nest HTTP fixture
application that uses the existing initial migration. It does not boot the full
application or call external services. Unit tests (`npm test`) do not run database lifecycle
hooks; real database lifecycle tests run explicitly through `test:db` in CI.

Stop the disposable server when finished:

```sh
docker stop uzima-e2e-postgres
```

## Lifecycle and fixtures

The E2E Jest configuration loads `jest-e2e.env.ts` before application imports,
then `jest.setup.ts` creates the database and runs the existing migrations.
Setup errors fail the suite. Partial setup closes pools and drops only a database
successfully created by that manager. A name collision is an error; an existing
database is never adopted or removed. Cleanup errors are propagated to Jest.

Each file starts with a fresh database, so files and concurrent Jest workers do
not share fixtures. Journey steps within one file may intentionally share state.
For independent cases, call `beforeEachTest`/`afterEachTest` or use
`IsolatedTestRunner`. Cleanup truncates application tables in one statement with
`RESTART IDENTITY CASCADE`, preserving the migrations table. The shared E2E user
fixture has a fixed email; fixture IDs restart predictably after cleanup.

`withTransaction` commits on success and rolls back on failure. It isolates only
queries made through its supplied `QueryRunner`, not unrelated application pools.
`IsolatedTestRunner` therefore uses explicit cleanup around independent cases.

Normal teardown closes the manager pool and uses PostgreSQL 15 `DROP DATABASE
... WITH (FORCE)` to close leftover pools connected to that generated database.
A forcibly killed test process cannot run teardown; on the disposable local
server, stop/recreate the container to discard such databases. No generic
cleanup command is run against development or production servers.

## Focused HTTP lifecycle checks

`test:db` runs both manager/configuration checks and two independent HTTP suites.
A fixture setup configures the existing `InitialSchema1700000000000` migration
before the standard E2E environment and lifecycle hooks run. Both suites insert
the same fixed user ID/email through a separate Nest application connection;
sharing a database would cause a collision. They also check that journey state
survives between cases and that all application database aliases match the owned
database. Teardown closes each HTTP application and its pool before dropping
the suite database. The test endpoints exist only in test fixtures.

This scoped fixture-schema check is not a claim that the full application or
its complete historical migration chain is healthy. `npm run test:e2e` still
uses its original application entities and migration list. Failures in those
files remain visible rather than being skipped or silently normalized.
