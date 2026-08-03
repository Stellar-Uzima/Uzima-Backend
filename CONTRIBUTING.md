# Contributor Guide: Database Migrations & Seeding

This section documents the database migration creation, application, and seeding workflows for new developers joining the Uzima-Backend project.

## Overview

The project uses **TypeORM** (v0.3.x) for database management with PostgreSQL in production and SQLite for testing. All database changes are managed through explicit migrations, and seeders provide idempotent test/production data initialization.

---

## 1. Migration Workflow

### Configuration
- **DataSource**: `src/database/data-source.ts` - TypeORM configuration used by CLI and seeders
- **Migrations directory**: `src/database/migrations/` - All migration files are stored here with timestamp-based naming
- **Entities**: All TypeORM entity files with `*.entity.ts` extension are automatically discovered

### Creating Migrations

#### Generate a Migration from Entity Changes
```bash
# Auto-generate migration file from entity changes
npm run typeorm -- migration:generate src/database/migrations/[description] -d src/database/data-source.ts
```

#### Create an Empty Migration
```bash
# Create a blank migration file for custom changes
npm run migrate:create src/database/migrations/[description]
```

#### Naming Convention
All migration files follow the pattern: `[timestamp]-[description].ts`
- Example: `1740000000000-CreateHealthTaskTable.ts`
- Timestamps ensure migrations execute in the correct chronological order

### Applying Migrations

```bash
# Run all pending migrations
npm run migrate
# or
npm run migration:run
```

### Rolling Back Migrations

```bash
# Revert the most recent migration
npm run migrate:rollback
```

### Refresh Full Database Schema
```bash
# Rollback all migrations, reapply everything, then seed
npm run seed:refresh
```

---

## 2. Seeding Workflow

### Architecture
Seeders implement the `BaseSeeder` abstract class from `src/database/seeders/base.seeder.ts` which enforces:
- **Idempotency**: Seeders check if data exists before inserting (safe to run multiple times)
- **Ordered execution**: Seeders run in dependency order
- **Consistent logging**: Standardized success/error logging

### BaseSeeder Interface
```typescript
abstract class BaseSeeder {
  abstract run(): Promise<void>;           // Implement your seeding logic
  async exists(): Promise<boolean>;       // Check if data already exists
  abstract getName(): string;             // Return seeder name for logging
}
```

### Current Seeders (Execution Order)
1. **UserSeeder** - Creates admin and test users with hashed passwords
2. **TaskCategorySeeder** - Creates multilingual health task categories
3. **HealthTaskSeeder** - Creates health assessment and activity tasks

### Running Seeders

```bash
# Execute all seeders in correct order
npm run seed
# or
npm run seed:db
```

### Adding a New Seeder
1. Create your seeder file in `src/database/seeders/` extending `BaseSeeder`
2. Implement `run()`, `exists()`, and `getName()` methods
3. Add it to the seeders array in `src/database/seeders/run-seeders.ts` in the correct dependency order

### Example Seeder Implementation
```typescript
export class MySeeder extends BaseSeeder {
  getName(): string {
    return 'MySeeder';
  }

  async exists(): Promise<boolean> {
    const repository = this.dataSource.getRepository(MyEntity);
    return await repository.count() > 0;
  }

  async run(): Promise<void> {
    const repository = this.dataSource.getRepository(MyEntity);
    await repository.save([/* your seed data */]);
  }
}
```

---

## 3. Common Workflows

### Fresh Database Setup
```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables (copy .env.example to .env)
cp .env.example .env

# 3. Run all migrations
npm run migrate

# 4. Seed the database
npm run seed
```

### Reset Development Database
```bash
# Complete database reset
npm run seed:refresh
```

### Testing Migrations
Always test migrations in a local development environment before creating a PR:
1. Apply migrations: `npm run migrate`
2. Verify schema changes in your PostgreSQL database
3. Test rollback: `npm run migrate:rollback`
4. Reapply to ensure both directions work correctly

---

## 4. Best Practices

### Migrations
- **Never edit existing migrations** after they've been merged - create new ones
- Keep migrations small and focused on a single schema change
- Always implement both `up()` and `down()` methods
- Test migrations against production-sized data when possible
- Add database indexes for frequently queried columns

### Seeders
- Maintain idempotency - seeders must be safe to run multiple times
- Order seeders by dependency (tables with foreign keys must seed after their dependencies)
- Use realistic test data that reflects production data patterns
- Keep seed data lean for CI/CD pipelines to maintain fast test execution
- Never include production secrets in seed files

### Troubleshooting
- **Migration failures**: Check database connection settings in `.env`
- **Seeder conflicts**: Ensure no manual data modifications conflict with seed data
- **TypeORM errors**: Verify all entities are properly imported in `data-source.ts`
- **PostgreSQL permissions**: Ensure database user has CREATE/ALTER/REFERENCES permissions

---

## 5. Test Database Isolation
For E2E and integration tests, the project uses `TestDatabaseManager` from `test/setup.ts` which:
- Creates a transaction before each test
- Rolls back the transaction after test completion
- Maintains test isolation without recreating the entire schema
- Works with the same migration structure as development databases

## Available npm Scripts
| Command | Description |
|---------|-------------|
| `npm run migrate` | Run all pending migrations |
| `npm run migrate:rollback` | Revert last migration |
| `npm run seed` | Execute all seeders |
| `npm run seed:refresh` | Rollback + migrate + seed |