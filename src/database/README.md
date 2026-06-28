# Database Module

This directory contains database configuration and migrations for Stellar Uzima Backend.

## Structure

```
database/
├── migrations/          # TypeORM migrations
├── data-source.ts       # Database configuration (to be created)
├── database.module.ts   # Database module
└── README.md
```

## Migrations

To create a new migration:

```bash
npm run migrate:create -- -n MigrationName
```

To run migrations:

```bash
npm run migrate
```

## Entity Files Location

Entity files are located in their respective module directories:
- `src/modules/users/entities/user.entity.ts`
- `src/modules/health-tasks/entities/task.entity.ts`
- `src/modules/wallet/entities/wallet.entity.ts`
- etc.

## Database Setup

1. Ensure PostgreSQL is running
2. Create the database specified in `.env`
3. Run `npm run start:dev` to automatically sync entities (in development)

## Best Practices

- Create entities in their respective modules
- Use TypeORM decorators for all database-related metadata
- Always create migrations for schema changes
- Add proper indexes and constraints
- Use migrations for production deployments
