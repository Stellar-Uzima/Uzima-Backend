# Database Migration System

A comprehensive versioned database migration system for managing schema changes and data transformations safely.

## Features

✅ **Versioned Migrations** - Numbered files with automatic ordering
✅ **Up/Down Support** - Full rollback capability for reversible migrations
✅ **Migration Locking** - Prevents concurrent migration runs
✅ **Dry-Run Mode** - Test migrations without applying changes
✅ **Auto-Run on Startup** - Optional automatic migration execution
✅ **Transaction Support** - Atomic operations for data consistency
✅ **CLI Commands** - Full command-line interface with multiple commands
✅ **REST API** - HTTP endpoints for migration management
✅ **History Tracking** - Complete audit trail of all migrations
✅ **Status Reporting** - Detailed status on applied, pending, and failed migrations

## Quick Start

### CLI Commands

```bash
# View migration status
npm run migrate:status

# Create a new migration
npm run migrate:create "add-user-index"

# Run pending migrations
npm run migrate:up

# Dry run (test without applying)
npm run migrate:up -- --dry-run

# Rollback last migration
npm run migrate:down

# Rollback multiple migrations
npm run migrate:down -- --steps 3

# Check lock status
npm run migrate:lock-status

# Force release lock (use with caution)
npm run migrate:force-unlock -- --confirm
```

### Environment Variables

```bash
# Enable auto-run on application startup
MIGRATE_ON_START=true

# Fail application startup if migration fails (optional)
MIGRATE_ON_START_FAIL_HARD=true
```

## Creating Migrations

### Basic Migration Template

```javascript
/**
 * Migration: Add User Index
 * Description: Create index on user email for faster lookups
 */

export const name = 'Add User Index';
export const description = 'Create index on user email field';

/**
 * Up migration - Apply changes
 */
export async function up() {
  const db = mongoose.connection.db;
  const usersCollection = db.collection('users');
  
  // Create index
  await usersCollection.createIndex({ email: 1 }, { unique: true });
  console.log('✓ Created email index on users collection');
}

/**
 * Down migration - Rollback changes
 */
export async function down() {
  const db = mongoose.connection.db;
  const usersCollection = db.collection('users');
  
  // Drop index
  await usersCollection.dropIndex('email_1');
  console.log('✓ Dropped email index from users collection');
}
```

### Advanced Migration with Transactions

```javascript
export const name = 'Transform Data Format';
export const description = 'Transform patient records to new format';

export async function up() {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const db = mongoose.connection.db;
    const patientsCollection = db.collection('patients');

    // Transform existing documents
    await patientsCollection.updateMany(
      { phoneNumber: { $type: 'string' } },
      [
        {
          $set: {
            phone: {
              country: '+254',
              number: '$phoneNumber',
            },
          },
        },
        { $unset: 'phoneNumber' },
      ],
      { session }
    );

    await session.commitTransaction();
    console.log('✓ Transformed patient phone numbers');
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function down() {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const db = mongoose.connection.db;
    const patientsCollection = db.collection('patients');

    // Revert transformation
    await patientsCollection.updateMany(
      { phone: { $exists: true } },
      [
        {
          $set: {
            phoneNumber: {
              $concat: ['$phone.country', '$phone.number'],
            },
          },
        },
        { $unset: 'phone' },
      ],
      { session }
    );

    await session.commitTransaction();
    console.log('✓ Reverted patient phone numbers');
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}
```

### Non-Reversible Migration

```javascript
export const name = 'Archive Old Records';

// Omit the down() function to mark as non-reversible
export async function up() {
  const db = mongoose.connection.db;
  const recordsCollection = db.collection('records');
  const archiveCollection = db.collection('records_archive');

  // Move old records to archive
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const oldRecords = await recordsCollection
    .find({ createdAt: { $lt: oneYearAgo } })
    .toArray();

  if (oldRecords.length > 0) {
    await archiveCollection.insertMany(oldRecords);
    await recordsCollection.deleteMany({ createdAt: { $lt: oneYearAgo } });
    console.log(`✓ Archived ${oldRecords.length} old records`);
  }
}
```

## API Endpoints

### Get Migration Status

```http
GET /api/migrations/status
```

Response:
```json
{
  "applied": [
    {
      "version": "20250122001",
      "name": "Initialize Migrations Table",
      "appliedAt": "2025-01-22T10:00:00Z",
      "executionTime": 150
    }
  ],
  "pending": [
    {
      "version": "20250122002",
      "name": "Add User Index",
      "reversible": true
    }
  ],
  "failed": [],
  "locked": null,
  "summary": {
    "total": 2,
    "applied": 1,
    "pending": 1,
    "failed": 0
  }
}
```

### Run Migrations Up

```http
POST /api/migrations/up?dryRun=false&continueOnError=false
```

### Rollback Migrations

```http
POST /api/migrations/down?steps=1&dryRun=false&continueOnError=false
```

### Get Migration History

```http
GET /api/migrations/history?limit=50&skip=0&status=completed
```

### Create New Migration

```http
POST /api/migrations
Content-Type: application/json

{
  "name": "Add User Index"
}
```

### Get Lock Status

```http
GET /api/migrations/lock/status
```

### Force Release Lock

```http
POST /api/migrations/lock/release
```

## Migration Workflow

### Typical Development Flow

1. **Create migration**
   ```bash
   npm run migrate:create "add-subscription-field"
   ```

2. **Edit the migration file** in `src/migrations/`

3. **Test the migration**
   ```bash
   npm run migrate:up -- --dry-run
   ```

4. **Apply if looks good**
   ```bash
   npm run migrate:up
   ```

5. **Verify status**
   ```bash
   npm run migrate:status
   ```

### Production Deployment

1. **Pre-deployment check**
   ```bash
   npm run migrate:status
   npm run migrate:up -- --dry-run
   ```

2. **Run migrations before deployment**
   ```bash
   npm run migrate:up
   ```

3. **Deploy application**

4. **Auto-run on startup (optional)**
   - Set `MIGRATE_ON_START=true` in environment
   - Application will auto-run pending migrations

## Best Practices

### 1. Migration Naming

Use clear, descriptive names:
```bash
✓ Good
20250122001-add-user-email-index
20250122002-add-subscription-table
20250122003-migrate-phone-format

✗ Avoid
20250122001-fix
20250122002-update
20250122003-changes
```

### 2. File Organization

- Keep migrations small and focused
- One logical change per migration
- Name files numerically and chronologically
- Include descriptive comments

### 3. Data Transformations

- Always write `down()` migrations for data changes
- Use transactions for multi-step operations
- Test rollback scenarios
- Keep transformations idempotent when possible

### 4. Testing

- Test migrations in dry-run mode first
- Test rollback in development
- Verify data integrity after migration
- Check performance on large datasets

### 5. Deployment

- Run migrations before application startup
- Use `--dry-run` in staging before production
- Monitor migration execution times
- Keep rollback procedures documented

### 6. Documentation

- Document the purpose of each migration
- Explain any complex transformations
- Note any data loss or breaking changes
- Include rollback instructions

## Error Handling

### Migration Failure

If a migration fails:

1. **Check error details**
   ```bash
   npm run migrate:status
   ```

2. **Fix the issue** (code or data)

3. **Retry** (the lock will auto-expire after 30 minutes)
   ```bash
   npm run migrate:up
   ```

4. **Or force unlock if necessary**
   ```bash
   npm run migrate:force-unlock -- --confirm
   ```

### Common Issues

**Lock timeout:**
- Migrations are locked, waiting for another process
- Wait 30 minutes for auto-release or force unlock

**Non-reversible migration:**
- Cannot rollback migrations without `down()` function
- These are marked as "Non-reversible" in status

**Data inconsistency:**
- Always test with dry-run first
- Use transactions for multi-step operations

## Monitoring

### Check Migration Status

```bash
npm run migrate:status
```

### View Migration History

```bash
curl http://localhost:3000/api/migrations/history
```

### Monitor Lock Status

```bash
npm run migrate:lock-status
```

## Troubleshooting

### Migrations stuck in "running" status

1. Check lock status: `npm run migrate:lock-status`
2. If lock is held: `npm run migrate:force-unlock -- --confirm`
3. Retry: `npm run migrate:up`

### Migration file not found

- Ensure file is in `src/migrations/` directory
- Check filename starts with a number
- Verify file has `.js` extension

### Import errors in migration

- Ensure all required modules are imported
- Check module paths are correct
- Verify Node.js version compatibility

### Database connection issues

- Verify `MONGO_URI` environment variable
- Test MongoDB connection separately
- Check network/firewall connectivity

## Performance Considerations

- Large data migrations should be done in batches
- Create indexes after populating data in some cases
- Consider impact on application during migrations
- Monitor database resources during execution
- Test migrations on production-like data volume

## Auto-Run on Startup

Enable automatic migration execution on application startup:

```javascript
// In src/index.js
import { setupAutoRun } from './services/autoRunMigrations.js';

const app = express();

// ... configure app ...

// Setup auto-run (optional)
setupAutoRun(app);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

Then set environment variable:
```bash
MIGRATE_ON_START=true
```

## Integration with CI/CD

```yaml
# Example GitHub Actions workflow
- name: Run migrations
  run: npm run migrate:up
  env:
    MONGO_URI: ${{ secrets.MONGO_URI_DEV }}

- name: Run tests
  run: npm test

- name: Deploy
  run: npm run deploy
```

## Database Schema

### Migrations Collection

```javascript
{
  _id: ObjectId,
  version: "20250122001",           // Unique version identifier
  name: "Initialize Migrations Table", // Human-readable name
  description: "...",                // Detailed description
  status: "completed",               // pending | running | completed | failed | rolled-back
  appliedAt: Date,                   // When migration was applied
  rolledBackAt: Date,                // When rolled back (if applicable)
  executionTime: Number,             // Time in milliseconds
  error: String,                     // Error message if failed
  reversible: Boolean,               // Can be rolled back
  batch: Number,                     // Batch number for grouping
  metadata: {},                      // Additional data
  createdAt: Date,
  updatedAt: Date
}
```

### Migration Locks Collection

```javascript
{
  _id: ObjectId,
  locked: Boolean,                   // Lock status
  lockedAt: Date,                    // When lock was acquired
  lockedBy: String,                  // Process ID holding lock
  reason: String,                    // Why it's locked
  expiresAt: Date,                   // Auto-expiration (30 min)
  createdAt: Date,
  updatedAt: Date
}
```

---

For more information, see the [source code](./src/services/migrationRunner.js) or [CLI implementation](./src/cli/migrations.js).
