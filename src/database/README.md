# Database Module

This directory contains database configuration, migrations, and seeders for Stellar Uzima Backend.

## Prerequisites

- **Node.js** >= 18.x
- **PostgreSQL** 12+ (or 15+ via Docker)
- **npm** (or yarn/pnpm)
- **Docker & Docker Compose** (optional, for containerized development)

## Quick Start for New Developers

Follow these steps to get the database running locally:

### 1. Clone and install dependencies

```bash
git clone https://github.com/Stellar-Uzima/Uzima-Backend.git
cd Uzima-Backend
npm install
```

### 2. Set up environment variables

Create a `.env` file at the project root with the required database variables:

```env
# Database (REQUIRED)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=uzima

# Alternative variable names (also supported)
# DB_HOST=localhost
# DB_PORT=5432
# DB_USERNAME=postgres
# DB_PASSWORD=postgres
# DB_NAME=uzima

# SSL (set to 'true' if your PostgreSQL requires SSL)
DATABASE_SSL=false

# For SQLite testing only (optional)
# DATABASE_TYPE=sqlite
```

**Note:** The application accepts both `DATABASE_*` and `DB_*` prefixed variables. `data-source.ts` (used for CLI migrations/seeding) checks `DB_*` first, then falls back to `DATABASE_*`. The NestJS module (`typeorm.config.ts`) uses `DATABASE_*` first, then `DB_*`.

### 3. Start PostgreSQL (choose one)

**Option A — Docker (recommended):**

```bash
docker compose up -d postgres
# Wait for healthy status:
docker compose ps
```

This starts a PostgreSQL 15 container with:
- User: `postgres` (or whatever `DB_USERNAME` is set to)
- Password: `postgres` (or whatever `DB_PASSWORD` is set to)
- Database: `stellar_uzima_dev` (or whatever `DB_NAME` is set to)
- Port: `5432` mapped to localhost

**Option B — Local PostgreSQL:**

Ensure PostgreSQL is installed and running, then create the database:

```bash
createdb uzima
# or via psql:
# psql -U postgres -c "CREATE DATABASE uzima;"
```

### 4. Run migrations

Apply all pending migrations to set up the database schema:

```bash
npm run migrate
# or
npm run migration:run
```

Expected output: A list of executed migrations with no errors.

### 5. Seed the database (optional)

Populate the database with initial data (users, categories, tasks):

```bash
npm run seed
# or
npm run seed:db
```

Seeders run in this order:
1. `UserSeeder` — creates admin, healer, and test users
2. `TaskCategorySeeder` — creates task categories (Nutrition, Exercise, Mental Health, etc.)
3. `HealthTaskSeeder` — creates health tasks linked to categories

### 6. Verify everything works

Start the development server:

```bash
npm run start:dev
```

The API should be available at `http://localhost:3000` (or the port set in `APP_PORT`).

### 7. Refresh from scratch (reset database)

If you need to reset the database completely:

```bash
npm run seed:refresh
```

This rolls back all migrations, re-applies them, and re-seeds the data.

## Structure

```
database/
├── migrations/          # Canonical TypeORM migrations folder (single source of truth)
├── seeders/             # TypeORM seeder classes (canonical seeding mechanism)
├── entities/            # Shared database entities
├── services/            # Transaction services
├── data-source.ts       # DataSource config for TypeORM CLI (migrations & seeding)
├── database.module.ts   # Database module
├── typeorm.config.ts    # TypeORM config for NestJS module
└── README.md
```

## Migrations

All migrations are consolidated in `src/database/migrations/` — this is the canonical migrations folder.

### Create a new migration

```bash
npm run migrate:create -- -n MigrationName
```

The new migration file is created in the current working directory. **Move it** to `src/database/migrations/` and add the Unix timestamp prefix followed by a descriptive name.

### Run migrations

```bash
npm run migrate
# or
npm run migration:run
```

Both commands use the data source defined in `src/database/data-source.ts`.

### Rollback last migration

```bash
npm run migrate:rollback
```

### Migration Naming Convention

Migrations use Unix timestamp prefixes (milliseconds since epoch) to ensure deterministic ordering. Example:
- `1700000000000-InitialSchema.ts`
- `1700000000001-AddReferralFields.ts`

### Common Migration Issues

| Issue | Solution |
|-------|----------|
| "relation already exists" | The migration was already applied. Check `migrations` table in the database. |
| "relation does not exist" | Run `npm run migrate` to apply pending migrations. |
| Connection refused | Ensure PostgreSQL is running. Check `DATABASE_HOST` and `DATABASE_PORT` in `.env`. |
| Authentication failed | Verify `DATABASE_USERNAME` and `DATABASE_PASSWORD` in `.env`. |
| Database does not exist | Create the database manually: `createdb uzima` |

## Seeding

The canonical seeding mechanism is `src/database/seeders/`, using TypeORM-based seeder classes.

To seed the database:

```bash
npm run seed
```

Seeders run in this order:
1. `UserSeeder` — creates admin, healer, and test users
2. `TaskCategorySeeder` — creates task categories (Nutrition, Exercise, Mental Health, etc.)
3. `HealthTaskSeeder` — creates health tasks linked to categories

### Seeder Environment

Seeders use the same environment variables as migrations (`DATABASE_*` or `DB_*`). They connect via `src/database/data-source.ts`.

### Writing a new seeder

1. Create a new class in `src/database/seeders/` that implements a `seed()` method
2. Add it to the seeders array in `src/database/seeders/run-seeders.ts`
3. Ensure it handles duplicate data gracefully (use `INSERT ... ON CONFLICT DO NOTHING` or check existence before inserting)

## Entity Files Location

Entity files are located in their respective module directories:
- `src/modules/users/entities/user.entity.ts`
- `src/modules/health-tasks/entities/task.entity.ts`
- `src/modules/wallet/entities/wallet.entity.ts`
- etc.

## Database Setup

1. Ensure PostgreSQL is running
2. Create the database specified in `.env`
3. Run `npm run migrate` to apply migrations
4. Run `npm run seed` to populate seed data

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_HOST` / `DB_HOST` | Yes | `localhost` | PostgreSQL host |
| `DATABASE_PORT` / `DB_PORT` | No | `5432` | PostgreSQL port |
| `DATABASE_USERNAME` / `DB_USERNAME` | Yes | `postgres` | PostgreSQL user |
| `DATABASE_PASSWORD` / `DB_PASSWORD` | Yes | `postgres` | PostgreSQL password |
| `DATABASE_NAME` / `DB_NAME` | Yes | `uzima` | Database name |
| `DATABASE_SSL` | No | `false` | Enable SSL (`true` / `false`) |
| `DATABASE_TYPE` | No | `postgres` | Set to `sqlite` for in-memory testing |
| `NODE_ENV` | No | `development` | When `test`, SQLite may be auto-selected |

## Best Practices

- Create entities in their respective modules
- Use TypeORM decorators for all database-related metadata
- Always create migrations for schema changes
- Add proper indexes and constraints
- Use migrations for production deployments
- Always add migrations to `src/database/migrations/` (the canonical folder)
- Use `src/database/seeders/` for all seeding needs
- Never run `synchronize: true` in production
- Test migrations locally before deploying