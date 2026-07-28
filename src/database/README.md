# Database Module

This directory contains database configuration, migrations, and seeders for Stellar Uzima Backend.

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

To create a new migration:

```bash
npm run migrate:create -- -n MigrationName
```

To run migrations:

```bash
npm run migrate
# or
npm run migration:run
```

To rollback the last migration:

```bash
npm run migrate:rollback
```

### Migration Naming Convention

Migrations use Unix timestamp prefixes (milliseconds since epoch) to ensure deterministic ordering. Example:
- `1700000000000-InitialSchema.ts`
- `1700000000001-AddReferralFields.ts`

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

## Best Practices

- Create entities in their respective modules
- Use TypeORM decorators for all database-related metadata
- Always create migrations for schema changes
- Add proper indexes and constraints
- Use migrations for production deployments
- Always add migrations to `src/database/migrations/` (the canonical folder)
- Use `src/database/seeders/` for all seeding needs