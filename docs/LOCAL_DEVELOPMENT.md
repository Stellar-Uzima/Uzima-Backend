# Local development

This is the contributor entry point for installing, configuring and checking the
backend. Commands run from the repository root. Use local, disposable data and
test accounts; production credentials are not required.

## Prerequisites

| Tool                   | Local baseline                                     | Source                            |
| ---------------------- | -------------------------------------------------- | --------------------------------- |
| Node.js and npm        | Node 20.x, matching CI                             | `.github/workflows/pr-checks.yml` |
| PostgreSQL             | 15                                                 | Compose and database test harness |
| Redis                  | 7                                                  | Compose and CI services           |
| Docker with Compose v2 | Optional if PostgreSQL/Redis are installed locally | `docker-compose.yml`              |
| Git                    | Clone and review changes                           | Repository root                   |

The Dockerfile still uses Node 18; that is not the Node version used for the
checks below. The `full` Compose profile builds that Dockerfile, so it is not a
shortcut around application build failures.

## 1. Clone and install

```sh
git clone https://github.com/Stellar-Uzima/Uzima-Backend.git
cd Uzima-Backend
npm ci --ignore-scripts --legacy-peer-deps
```

Use the committed npm lockfile. The legacy peer resolver is needed for the
repository's current mixed dependency versions; it does not upgrade them.
Dependency lifecycle scripts are disabled for this initial check. If a feature
needs a native dependency install script, review that dependency and rebuild it
explicitly in your local environment rather than enabling arbitrary scripts.

## 2. Configure a local environment

Copy `.env.example` to `.env` (`cp .env.example .env` in a POSIX shell,
`Copy-Item .env.example .env` in PowerShell). `.env` is ignored by Git.

Set these development values before starting services:

```dotenv
NODE_ENV=development
APP_PORT=3001
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=local-uzima-only-change-me
DB_NAME=stellar_uzima_dev
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_DB=0
REDIS_URL=redis://127.0.0.1:6379
CORS_ORIGINS=http://localhost:3000
```

Generate a different local value for each of `JWT_SECRET`, `JWT_REFRESH_SECRET`
and `SECRETS_VAULT_KEY`, then put them in `.env`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not paste generated values into issues or PRs. The active AppModule rejects
the example JWT placeholders, short keys, and `DB_PASSWORD=postgres` or
`DB_PASSWORD=password`. A configured vault also needs its local encryption key.

Comment out unused provider credentials instead of supplying fake production
credentials or empty strings to the configuration validator. In particular,
remove the `STELLAR_FUNDING_SECRET` placeholder for local checks that do not fund
accounts. Keep any Stellar work on testnet.

Also comment out `DB_SYNCHRONIZE` for a migration-managed database. Its active
consumer reads the value directly; the string `false` from a dotenv file is not
an explicitly parsed boolean. Leaving it unset uses the false default rather
than relying on that string to disable schema synchronization.

### Which variable names are actually consumed?

| Consumer                        | Database name / port                     | Notes                                        |
| ------------------------------- | ---------------------------------------- | -------------------------------------------- |
| Application `DatabaseModule`    | `DB_NAME`, `DB_PORT`                     | Active application connection                |
| Migration/seed `AppDataSource`  | `DB_NAME`, with `DATABASE_NAME` fallback | CLI connection, not the test harness         |
| Legacy `databaseConfig` factory | `DB_DATABASE`                            | Not the active DatabaseModule's name setting |
| HTTP bootstrap                  | `APP_PORT`, default `3001`               | `PORT` alone does not configure `main.ts`    |
| QueueModule                     | `REDIS_HOST/PORT/PASSWORD/DB/TLS`        | Do not assume `QUEUE_REDIS_*` overrides it   |
| E2E harness                     | Explicit `TEST_DB_*`                     | Never falls back to development settings     |

Use the active consumer rather than combining all the legacy aliases. Additional
validation helpers exist in `src/config/`; their existence does not mean they
are the schema wired into `AppModule`.

### Optional integrations

| Integration | Local behaviour / prerequisites                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FCM push    | Without Firebase credentials, initialization uses offline/mock mode. A live delivery is not verified by that mode.                                                       |
| Twilio SMS  | Credentials are needed when sending SMS, not for database-harness tests. Do not send messages to real numbers while checking setup.                                      |
| Email       | The notification-center email path currently renders a template and logs; an external mailer is still a TODO.                                                            |
| Stellar     | `StellarService` currently constructs a testnet Horizon client. Other Stellar clients have their own configuration; a variable does not universally switch every client. |
| Storage     | Inspect the module used by the feature: local storage and object-storage implementations coexist. Database-harness tests need no cloud account.                          |

There is no documented global switch that mocks every external provider. Use
the focused tests below when you do not have provider credentials; do not invent
provider credentials to make startup appear successful.

## 3. Start development PostgreSQL and Redis

```sh
docker compose --env-file .env config --quiet
docker compose up -d postgres redis
docker compose ps
docker compose exec postgres pg_isready -U postgres -d stellar_uzima_dev
docker compose exec redis redis-cli ping
```

Expected service checks: PostgreSQL accepts connections and Redis returns `PONG`.
If you change the database user/name, update the check arguments. For an API run
on the host, use `127.0.0.1`; inside Compose, use service names `postgres`/`redis`.

Compose uses fixed container names and persistent volumes. Check for name/port
conflicts first. Changing `DB_PORT` or `REDIS_PORT` changes the host mappings,
not the containers' internal ports. Changing PostgreSQL initialization values
does not rewrite credentials in an existing volume.

## 4. Migrate, optionally seed, then run the API

The scripts declared by `package.json` are:

```sh
npm run migrate
npm run seed
npm run start:dev
```

Seed only a disposable local database after migrations succeed. The normal HTTP
port is `3001`; Swagger is mounted at `http://localhost:3001/api/docs`.
URI-versioned controllers use the bootstrap's `api/v` prefix and version `1`.
Confirm actual routes after startup before scripting a health probe.

**Current baseline blockers:** on main revision
`5a50b5ef067b679cf6d288957b479649b2970e7b` (2026-10-19), `npm run migrate`
fails with `Given data source file must contain only one export of DataSource
instance`; `npm run build` also fails on existing application errors. These are
not missing production secrets. Stop at a failed step and retain its error;
do not seed a partial schema, enable schema synchronization as a workaround, or
claim that the complete API has started. Fixes to the underlying application
must be reviewed separately from this setup documentation.

`npm run migrate:rollback` reverts the **last** migration. `seed:refresh` runs
one rollback, then migrate and seed; it is not a full database reset. Neither
command belongs in a routine onboarding or production recovery shortcut.

## 5. Run tests against a different PostgreSQL server

Follow [Isolated E2E databases](./e2e-database.md) for the full lifecycle and
permissions. Start a disposable server on a different host port:

```sh
docker run --rm --name uzima-e2e-postgres \
  -e POSTGRES_PASSWORD=e2e-local-only \
  -p 127.0.0.1:55432:5432 postgres:15-alpine
```

After it is ready, set these variables **in a separate terminal**:

```sh
export NODE_ENV=test
export TEST_DATABASE_TYPE=postgres
export TEST_DB_HOST=127.0.0.1
export TEST_DB_PORT=55432
export TEST_DB_USERNAME=postgres
export TEST_DB_PASSWORD=e2e-local-only
export TEST_DB_NAME=uzima_test
npm run test:db -- --runInBand --detectOpenHandles
```

PowerShell equivalents (then run the same npm command):

```powershell
$env:NODE_ENV = 'test'
$env:TEST_DATABASE_TYPE = 'postgres'
$env:TEST_DB_HOST = '127.0.0.1'
$env:TEST_DB_PORT = '55432'
$env:TEST_DB_USERNAME = 'postgres'
$env:TEST_DB_PASSWORD = 'e2e-local-only'
$env:TEST_DB_NAME = 'uzima_test'
```

The role must connect to the maintenance database and create/drop databases.
`TEST_DB_NAME` is a lowercase base ending in `_test`, not a database to create
manually. Each suite owns a generated database and teardown removes only that
database. Keep the test settings distinct from development; do not use
`.env.test`'s legacy `DATABASE_*` entries as a substitute for `TEST_DB_*`.

| Command                                              | Scope and interpretation                                                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test -- --runInBand`                            | Unit tests; does not start the database harness                                                                                                        |
| `npm run test:db -- --runInBand --detectOpenHandles` | Real PostgreSQL isolation and focused HTTP fixtures; 35 tests passed in the documented baseline                                                        |
| `npm run test:e2e -- --runInBand`                    | Full application E2E, also requiring application dependencies; baseline fails before tests execute, including the `Transform` import in `login.dto.ts` |
| `npm run build`                                      | Full application compilation; baseline failure must remain visible                                                                                     |
| `npm run lint:check` / `npm run format:check`        | Check source style; `lint` and `format` instead modify files                                                                                           |

The passing `test:db` fixture uses the initial schema. It does not prove the
complete historical migration chain or full application is healthy. Report
passed, failed, blocked and unexecuted commands separately in a PR.

## Troubleshooting and cleanup

- **Connection refused:** check Compose health, host port and whether the command
  runs on the host or in a container. Never print a credential-bearing URL.
- **Authentication failure:** ensure the app and Compose use the same local
  password; an existing PostgreSQL volume retains its original password.
- **Test configuration rejected:** supply every `TEST_DB_*` value explicitly,
  use a valid `_test` base, and use the disposable server's port.
- **Compiler, entity or migration loader error:** retain the first failure and
  revision. Do not treat a failed application build as a successful setup.
- **Redis healthy but notifications absent:** health does not prove provider
  delivery. See the [operational runbooks](./runbooks/README.md).

Stop development services with `docker compose down`; it retains their data.
Stop the disposable test container with `docker stop uzima-e2e-postgres`; because
it was created with `--rm`, its disposable data is removed. Removing Compose
volumes is a destructive opt-in, not a required setup step.

When reporting a problem, include revision, Node/npm versions, command, exit
status and a redacted error excerpt. Exclude `.env`, tokens, wallet secrets,
provider credentials and personal data.
