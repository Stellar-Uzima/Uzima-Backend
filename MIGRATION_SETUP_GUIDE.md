# Migration System Setup Guide

## Overview

The database migration system has been fully implemented with the following components:

### 📁 Created Files

#### Models
- **[Migration.js](src/models/Migration.js)** - Schema for tracking applied migrations
- **[MigrationLock.js](src/models/MigrationLock.js)** - Schema for migration locking mechanism

#### Services
- **[migrationRunner.js](src/services/migrationRunner.js)** - Core migration execution engine
- **[autoRunMigrations.js](src/services/autoRunMigrations.js)** - Auto-run migrations on startup

#### Controllers & Routes
- **[migrationController.js](src/controllers/migrationController.js)** - API request handlers
- **[migrationRoutes.js](src/routes/migrationRoutes.js)** - REST API endpoints

#### CLI
- **[migrations.js](src/cli/migrations.js)** - Command-line interface with 6 commands

#### Example Migrations
- **[20250122001-initialize-migrations.js](src/migrations/20250122001-initialize-migrations.js)** - Setup migrations collection
- **[20250122002-add-sample-index.js](src/migrations/20250122002-add-sample-index.js)** - Example index creation

#### Tests
- **[migrations.test.js](src/__tests__/migrations.test.js)** - Comprehensive test suite

#### Documentation
- **[MIGRATIONS.md](MIGRATIONS.md)** - Complete user documentation

### 🔧 Updated Files
- **[package.json](package.json)** - Added commander, uuid dependencies and CLI scripts
- **[src/index.js](src/index.js)** - Integrated migration routes and auto-run

---

## Installation & Setup

### 1. Install Dependencies

```bash
npm install
```

The following packages have been added:
- `commander@^12.1.0` - CLI framework
- `uuid@^10.0.0` - Lock ID generation

### 2. Verify Installation

```bash
# Check if migration commands are available
npm run migrate:status
```

You should see MongoDB connection status and any existing migrations.

### 3. Configure Environment (Optional)

Add to your `.env` file:

```bash
# Enable auto-run on application startup
MIGRATE_ON_START=true

# Optional: Fail startup if migration fails
MIGRATE_ON_START_FAIL_HARD=true

# MongoDB connection (if not already set)
MONGO_URI=mongodb://127.0.0.1:27017/uzima
```

---

## Quick Start

### View Migration Status

```bash
npm run migrate:status
```

Output shows:
- ✓ Applied migrations
- ⏳ Pending migrations
- ✗ Failed migrations
- 🔒 Lock status

### Create a New Migration

```bash
npm run migrate:create "add-user-verification-status"
```

This creates a template file at `src/migrations/{timestamp}-add-user-verification-status.js`

### Apply Pending Migrations

```bash
# Test first with dry-run
npm run migrate:up -- --dry-run

# Apply if looks good
npm run migrate:up
```

### Rollback Migrations

```bash
# Rollback last migration
npm run migrate:down

# Rollback last 3 migrations
npm run migrate:down -- --steps 3

# Test rollback first
npm run migrate:down -- --dry-run
```

---

## CLI Commands Reference

### `migrate:status`
Display current migration status with summary statistics.

```bash
npm run migrate:status
```

### `migrate:up`
Run all pending migrations.

```bash
npm run migrate:up
npm run migrate:up -- --dry-run
npm run migrate:up -- --continue-on-error
```

Options:
- `--dry-run` - Simulate without applying
- `--continue-on-error` - Don't stop on first failure

### `migrate:down`
Rollback applied migrations.

```bash
npm run migrate:down
npm run migrate:down -- --steps 2
npm run migrate:down -- --dry-run
```

Options:
- `--steps <n>` - Number to rollback (default: 1)
- `--dry-run` - Simulate without applying
- `--continue-on-error` - Don't stop on first failure

### `migrate:create <name>`
Create a new migration file with template.

```bash
npm run migrate:create "your migration name"
```

### `migrate:lock-status`
Check if migrations are currently locked.

```bash
npm run migrate:lock-status
```

### `migrate:force-unlock`
Force release the migration lock (use with caution).

```bash
npm run migrate:force-unlock -- --confirm
```

---

## REST API Endpoints

All endpoints are at `/api/migrations`

### GET /api/migrations/status
Get current migration status.

```bash
curl http://localhost:5000/api/migrations/status
```

### POST /api/migrations/up
Run pending migrations.

```bash
# Normal run
curl -X POST http://localhost:5000/api/migrations/up

# Dry run
curl -X POST http://localhost:5000/api/migrations/up?dryRun=true

# Continue on error
curl -X POST http://localhost:5000/api/migrations/up?continueOnError=true
```

### POST /api/migrations/down
Rollback migrations.

```bash
# Rollback 1
curl -X POST http://localhost:5000/api/migrations/down

# Rollback 3
curl -X POST http://localhost:5000/api/migrations/down?steps=3

# Dry run
curl -X POST http://localhost:5000/api/migrations/down?dryRun=true
```

### GET /api/migrations/history
Get migration history.

```bash
# Get all
curl http://localhost:5000/api/migrations/history

# Filter by status
curl http://localhost:5000/api/migrations/history?status=completed

# Pagination
curl http://localhost:5000/api/migrations/history?limit=20&skip=0
```

### POST /api/migrations
Create new migration.

```bash
curl -X POST http://localhost:5000/api/migrations \
  -H "Content-Type: application/json" \
  -d '{"name":"add-user-roles"}'
```

### GET /api/migrations/lock/status
Check lock status.

```bash
curl http://localhost:5000/api/migrations/lock/status
```

### POST /api/migrations/lock/release
Force release lock (admin only).

```bash
curl -X POST http://localhost:5000/api/migrations/lock/release
```

---

## Migration Writing Guide

### Basic Structure

```javascript
export const name = 'Migration Name';
export const description = 'What this migration does';

export async function up() {
  // Apply changes here
  const db = mongoose.connection.db;
  const collection = db.collection('collectionName');
  // ... your code
}

export async function down() {
  // Rollback changes here
  // Omit if migration is not reversible
}
```

### Common Patterns

#### Creating Indexes

```javascript
export async function up() {
  const db = mongoose.connection.db;
  const collection = db.collection('users');
  await collection.createIndex({ email: 1 }, { unique: true });
}

export async function down() {
  const db = mongoose.connection.db;
  const collection = db.collection('users');
  await collection.dropIndex('email_1');
}
```

#### Updating Documents

```javascript
export async function up() {
  const db = mongoose.connection.db;
  const collection = db.collection('posts');
  
  await collection.updateMany(
    { published: { $exists: false } },
    { $set: { published: false } }
  );
}

export async function down() {
  const db = mongoose.connection.db;
  const collection = db.collection('posts');
  
  await collection.updateMany(
    { published: false },
    { $unset: { published: 1 } }
  );
}
```

#### Using Transactions

```javascript
export async function up() {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const db = mongoose.connection.db;
    const collection = db.collection('accounts');

    // Multiple operations in one transaction
    await collection.updateOne({ _id: 1 }, { $inc: { balance: -100 } }, { session });
    await collection.updateOne({ _id: 2 }, { $inc: { balance: 100 } }, { session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}
```

---

## Testing Migrations

### Unit Tests

```bash
npm test -- migrations.test.js
```

Tests cover:
- Migration file discovery
- Lock mechanisms
- Up/Down execution
- Status tracking
- Dry-run mode
- Error handling

### Manual Testing

1. **Create a test migration**
   ```bash
   npm run migrate:create "test-migration"
   ```

2. **Test with dry-run**
   ```bash
   npm run migrate:up -- --dry-run
   ```

3. **Apply the migration**
   ```bash
   npm run migrate:up
   ```

4. **Verify status**
   ```bash
   npm run migrate:status
   ```

5. **Test rollback**
   ```bash
   npm run migrate:down -- --dry-run
   npm run migrate:down
   ```

---

## Auto-Run on Startup

To automatically run pending migrations when the application starts:

### 1. Set Environment Variable

```bash
MIGRATE_ON_START=true
```

### 2. (Optional) Fail Startup on Error

```bash
MIGRATE_ON_START_FAIL_HARD=true
```

With this flag, if a migration fails, the entire application startup fails.

### How It Works

- Application connects to MongoDB
- Before HTTP server starts listening
- Runs all pending migrations
- Continues even if migrations fail (unless `MIGRATE_ON_START_FAIL_HARD=true`)
- Then starts HTTP server

---

## Troubleshooting

### Issue: Migrations are locked

**Symptoms:** Error message about migration lock

**Solution:**
1. Check lock status: `npm run migrate:lock-status`
2. If lock is stale (held for 30+ minutes), force release:
   ```bash
   npm run migrate:force-unlock -- --confirm
   ```
3. Retry: `npm run migrate:up`

### Issue: Migration file not found

**Symptoms:** Error about migration file not existing

**Solution:**
- Verify file exists in `src/migrations/`
- Check filename starts with a number
- Verify `.js` extension
- Run: `ls -la src/migrations/`

### Issue: Import errors in migration

**Symptoms:** Error about missing modules

**Solution:**
- Check all imports at the top of migration file
- Verify module paths are correct
- Use `mongoose.connection.db` for database access

### Issue: Rollback not working

**Symptoms:** Cannot rollback a migration

**Solution:**
- Check if migration has `down()` function
- If not, it's marked as non-reversible
- Manually write a `down()` function if possible
- Run: `npm run migrate:status` to verify

---

## Best Practices

### Before Running Migrations

1. ✅ Test with `--dry-run` first
2. ✅ Backup your database
3. ✅ Check lock status
4. ✅ Review migration code
5. ✅ Test on staging environment first

### Writing Migrations

1. ✅ Keep migrations small and focused
2. ✅ Write reversible migrations when possible
3. ✅ Use transactions for multi-step changes
4. ✅ Add clear error handling
5. ✅ Log progress for long-running migrations

### Production Deployment

1. ✅ Run migrations BEFORE application deployment
2. ✅ Use `--dry-run` in staging first
3. ✅ Have rollback plan for non-reversible migrations
4. ✅ Monitor migration execution
5. ✅ Verify data integrity after migrations

---

## Database Schema

### Migrations Collection

Stores history of all migrations:

```javascript
{
  _id: ObjectId,
  version: "20250122001",              // Unique version ID
  name: "Migration Name",              // Human readable
  description: "...",                  // What it does
  status: "completed",                 // pending|running|completed|failed|rolled-back
  appliedAt: ISODate("2025-01-22T..."), // When applied
  rolledBackAt: ISODate("..."),        // If rolled back
  executionTime: 150,                  // Milliseconds
  error: null,                         // Error message if failed
  reversible: true,                    // Can be rolled back
  batch: 1,                            // Grouped batch number
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

### Migration Locks Collection

Prevents concurrent migrations:

```javascript
{
  _id: ObjectId,
  locked: true,
  lockedAt: ISODate("..."),
  lockedBy: "uuid-1234...",            // Process ID
  reason: "Running up migrations",
  expiresAt: ISODate("..."),           // Auto-expires after 30 min
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

---

## Integration with CI/CD

### GitHub Actions Example

```yaml
- name: Run migrations
  run: npm run migrate:up
  env:
    MONGO_URI: ${{ secrets.MONGO_URI }}

- name: Run tests
  run: npm test

- name: Deploy
  run: npm run deploy
```

### GitLab CI Example

```yaml
migrations:
  script:
    - npm run migrate:status
    - npm run migrate:up
  environment: production
  only:
    - main
```

---

## Support & Documentation

For detailed documentation, see [MIGRATIONS.md](MIGRATIONS.md)

For API documentation, visit: `http://localhost:5000/api-docs`

---

## Next Steps

1. ✅ Review the [MIGRATIONS.md](MIGRATIONS.md) documentation
2. ✅ Run `npm run migrate:status` to see current state
3. ✅ Try creating a test migration with `npm run migrate:create "test"`
4. ✅ Run tests: `npm test -- migrations.test.js`
5. ✅ Set `MIGRATE_ON_START=true` when ready for auto-run

Enjoy seamless database migrations! 🚀
