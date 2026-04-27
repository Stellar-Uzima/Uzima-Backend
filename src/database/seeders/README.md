# Database Seeders

This directory contains database seeding scripts for development and testing environments.

## Overview

The seeding system provides idempotent data seeding for:
- **Users** - Admin, healer, and regular user accounts
- **Task Categories** - Health task categories with multi-language support
- **Health Tasks** - Sample health tasks across different categories

## Structure

```
seeders/
├── base.seeder.ts           # Abstract base seeder class
├── user.seeder.ts           # User seeding logic
├── task-category.seeder.ts  # Task category seeding logic
├── health-task.seeder.ts    # Health task seeding logic
└── run-seeders.ts           # Main runner script
```

## Features

✅ **Idempotent Seeding** - Safe to run multiple times without duplicating data
✅ **Sequential Execution** - Seeders run in the correct order
✅ **Detailed Logging** - Clear console output showing seeding progress
✅ **Error Handling** - Graceful error handling with proper cleanup
✅ **Type-Safe** - Full TypeScript support with proper type checking

## Usage

### Run All Seeders

```bash
npm run seed
```

This will:
1. Connect to the database
2. Run all seeders in order (users → categories → tasks)
3. Skip data that already exists (idempotent)
4. Close the database connection

### Refresh Database (Migrate + Seed)

```bash
npm run seed:refresh
```

This will:
1. Rollback the last migration
2. Run all migrations
3. Run all seeders

### Rollback Last Migration

```bash
npm run migrate:rollback
```

## Seed Data

### Users

The following users are created:

| Email | Password | Role | Country |
|-------|----------|------|---------|
| admin@example.com | AdminPass123! | ADMIN | NG |
| healer@example.com | HealerPass123! | HEALER | KE |
| user@example.com | UserPass123! | USER | NG |
| test.user@example.com | TestPass123! | USER | GH |

All passwords are hashed using bcrypt with a salt rounds of 10.

### Task Categories

7 categories are seeded with multi-language translations:
- Nutrition
- Exercise
- Mental Health
- Maternal Health
- Preventive Care
- Hygiene
- Traditional Remedies

### Health Tasks

12 sample health tasks across different categories:
- 3 Nutrition tasks
- 3 Fitness tasks
- 3 Mental Health tasks
- 2 Sleep tasks
- 2 Hydration tasks

Each task includes:
- Title and description
- XLM reward amount
- Category assignment
- Active status

## Customization

### Adding New Seed Data

To add more seed data, edit the corresponding data array in the seeder file:

```typescript
// Example: Adding a new user in user.seeder.ts
export const usersData: UserData[] = [
  // ... existing users
  {
    email: 'newuser@example.com',
    password: 'NewPass123!',
    fullName: 'New User',
    role: Role.USER,
    country: 'US',
  },
];
```

### Creating a New Seeder

1. Create a new seeder file extending `BaseSeeder`:

```typescript
import { DataSource } from 'typeorm';
import { BaseSeeder } from './base.seeder';
import { YourEntity } from '../../path/to/entity';

export class YourSeeder extends BaseSeeder {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  getName(): string {
    return 'YourSeeder';
  }

  async exists(): Promise<boolean> {
    const repo = this.dataSource.getRepository(YourEntity);
    const count = await repo.count();
    return count > 0;
  }

  async run(): Promise<void> {
    const repo = this.dataSource.getRepository(YourEntity);
    // Your seeding logic here
  }
}
```

2. Add it to `run-seeders.ts`:

```typescript
import { YourSeeder } from './your.seeder';

const seeders = [
  new UserSeeder(dataSource),
  new TaskCategorySeeder(dataSource),
  new HealthTaskSeeder(dataSource),
  new YourSeeder(dataSource), // Add here
];
```

## Idempotent Logic

Each seeder implements idempotent checks to prevent duplicate data:

1. **Check if data exists** - The `exists()` method checks if any data is present
2. **Skip if exists** - If data exists, the seeder logs and skips
3. **Individual checks** - Each item is checked before insertion (e.g., by email for users)

This ensures you can safely run `npm run seed` multiple times without creating duplicates.

## Environment Variables

The seeders use the following environment variables (from `.env`):

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=uzima
```

Or alternatively:

```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=uzima
```

## Best Practices

1. **Always use idempotent checks** - Prevent duplicate data
2. **Seed in order** - Dependencies first (users → categories → tasks)
3. **Use transactions** - For complex seeding operations
4. **Log clearly** - Use emojis and clear messages for visibility
5. **Test seeders** - Run them on a fresh database to verify
6. **Don't seed production** - Only use in development/testing

## Troubleshooting

### Connection Error

Ensure your database is running and environment variables are correct:

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Verify .env file exists
cat .env
```

### Seeder Fails Midway

The seeder will rollback and close the connection. Simply fix the issue and run again:

```bash
npm run seed
```

### Duplicate Data Error

If you see unique constraint violations, the idempotent check may have failed. Check:
- The `exists()` method logic
- Database state manually
- Clear the table and re-run if needed

## Development Workflow

1. **Fresh Database Setup**:
   ```bash
   npm run migrate
   npm run seed
   ```

2. **Reset and Reseed**:
   ```bash
   npm run seed:refresh
   ```

3. **Add New Feature with Seeds**:
   - Create entity
   - Create migration
   - Create seeder
   - Run `npm run seed`

## Notes

- Seeders are for **development and testing only**
- Never run seeders in **production** environment
- Passwords are automatically hashed before insertion
- All seed data uses example/test values
