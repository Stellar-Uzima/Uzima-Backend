# Migration System - API Examples

Complete examples for using the migration system REST API.

## Base URL

```
http://localhost:5000/api/migrations
```

---

## 1. Get Migration Status

**Endpoint:** `GET /api/migrations/status`

**Description:** Get comprehensive migration status including applied, pending, and failed migrations.

**Example:**

```bash
curl -X GET http://localhost:5000/api/migrations/status
```

**Response:**

```json
{
  "applied": [
    {
      "version": "20250122001",
      "name": "Initialize Migrations Table",
      "appliedAt": "2025-01-22T10:30:15.123Z",
      "executionTime": 245,
      "reversible": true
    },
    {
      "version": "20250122002",
      "name": "Add Sample Index",
      "appliedAt": "2025-01-22T10:30:17.456Z",
      "executionTime": 156,
      "reversible": true
    }
  ],
  "pending": [
    {
      "version": "20250122003",
      "name": "Add User Verification Status",
      "reversible": true
    }
  ],
  "failed": [],
  "locked": null,
  "summary": {
    "total": 3,
    "applied": 2,
    "pending": 1,
    "failed": 0
  }
}
```

---

## 2. Run Pending Migrations (Up)

**Endpoint:** `POST /api/migrations/up`

**Description:** Execute all pending migrations.

**Query Parameters:**
- `dryRun` (boolean, optional): Test without applying changes
- `continueOnError` (boolean, optional): Continue on first failure

**Examples:**

### Normal Run

```bash
curl -X POST http://localhost:5000/api/migrations/up
```

### Dry Run (Test First)

```bash
curl -X POST http://localhost:5000/api/migrations/up?dryRun=true
```

### Continue on Error

```bash
curl -X POST http://localhost:5000/api/migrations/up?continueOnError=true
```

### Both Options

```bash
curl -X POST http://localhost:5000/api/migrations/up?dryRun=true&continueOnError=true
```

**Success Response (200):**

```json
{
  "success": true,
  "migrations": [
    {
      "version": "20250122003",
      "name": "Add User Verification Status",
      "status": "completed",
      "executionTime": 189
    }
  ]
}
```

**Error Response (500):**

```json
{
  "error": "Migration 'Add User Verification Status' failed. Stopped execution."
}
```

---

## 3. Rollback Migrations (Down)

**Endpoint:** `POST /api/migrations/down`

**Description:** Rollback one or more applied migrations.

**Query Parameters:**
- `steps` (number, optional, default=1): How many to rollback
- `dryRun` (boolean, optional): Test without applying
- `continueOnError` (boolean, optional): Continue on failure

**Examples:**

### Rollback Last Migration

```bash
curl -X POST http://localhost:5000/api/migrations/down
```

### Rollback Last 3 Migrations

```bash
curl -X POST http://localhost:5000/api/migrations/down?steps=3
```

### Dry Run Rollback

```bash
curl -X POST http://localhost:5000/api/migrations/down?dryRun=true
```

### Rollback 2 with Continue on Error

```bash
curl -X POST http://localhost:5000/api/migrations/down?steps=2&continueOnError=true
```

**Success Response (200):**

```json
{
  "success": true,
  "migrations": [
    {
      "version": "20250122003",
      "name": "Add User Verification Status",
      "status": "rolled-back",
      "executionTime": 156
    }
  ]
}
```

---

## 4. Get Migration History

**Endpoint:** `GET /api/migrations/history`

**Description:** Retrieve migration history with filtering and pagination.

**Query Parameters:**
- `limit` (number, optional, default=50): Records per page
- `skip` (number, optional, default=0): Skip records
- `status` (string, optional): Filter by status (completed, failed, etc.)

**Examples:**

### Get All History

```bash
curl http://localhost:5000/api/migrations/history
```

### Get Last 20 Completed Migrations

```bash
curl http://localhost:5000/api/migrations/history?limit=20&status=completed
```

### Get Failed Migrations

```bash
curl http://localhost:5000/api/migrations/history?status=failed
```

### Pagination: Get Second Page (50 items per page)

```bash
curl http://localhost:5000/api/migrations/history?limit=50&skip=50
```

**Response:**

```json
{
  "migrations": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "version": "20250122002",
      "name": "Add Sample Index",
      "description": "Create indexes on frequently queried fields",
      "status": "completed",
      "appliedAt": "2025-01-22T10:30:17.456Z",
      "executionTime": 156,
      "reversible": true,
      "batch": 1,
      "createdAt": "2025-01-22T10:30:17.456Z",
      "updatedAt": "2025-01-22T10:30:17.456Z"
    }
  ],
  "pagination": {
    "total": 15,
    "limit": 50,
    "skip": 0
  }
}
```

---

## 5. Create New Migration

**Endpoint:** `POST /api/migrations`

**Description:** Create a new migration file with template.

**Request Body:**

```json
{
  "name": "Add User Subscription Table"
}
```

**Example:**

```bash
curl -X POST http://localhost:5000/api/migrations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Add User Subscription Table"
  }'
```

**Response (201):**

```json
{
  "filename": "1705916300145-add-user-subscription-table.js",
  "path": "/app/src/migrations/1705916300145-add-user-subscription-table.js"
}
```

---

## 6. Get Lock Status

**Endpoint:** `GET /api/migrations/lock/status`

**Description:** Check if migrations are currently locked and by whom.

**Example:**

```bash
curl http://localhost:5000/api/migrations/lock/status
```

**Response (No Lock):**

```json
{
  "locked": false,
  "lock": null
}
```

**Response (Locked):**

```json
{
  "locked": true,
  "lock": {
    "_id": "507f1f77bcf86cd799439012",
    "locked": true,
    "lockedAt": "2025-01-22T10:30:15.123Z",
    "lockedBy": "550e8400-e29b-41d4-a716-446655440000",
    "reason": "Running up migrations",
    "expiresAt": "2025-01-22T11:00:15.123Z",
    "createdAt": "2025-01-22T10:30:15.123Z",
    "updatedAt": "2025-01-22T10:30:15.123Z"
  }
}
```

---

## 7. Force Release Lock

**Endpoint:** `POST /api/migrations/lock/release`

**Description:** Force release the migration lock (admin only, use with caution).

**Example:**

```bash
curl -X POST http://localhost:5000/api/migrations/lock/release
```

**Response (200):**

```json
{
  "success": true,
  "message": "Migration lock released"
}
```

**Error Response (500):**

```json
{
  "error": "Error releasing lock: Database connection error"
}
```

---

## Common Workflows

### Workflow 1: Create and Apply a Migration

```bash
# 1. Create migration
curl -X POST http://localhost:5000/api/migrations \
  -H "Content-Type: application/json" \
  -d '{"name": "add-email-verification"}'

# 2. Check status (should show pending)
curl http://localhost:5000/api/migrations/status

# 3. Test with dry-run
curl -X POST http://localhost:5000/api/migrations/up?dryRun=true

# 4. Apply migration
curl -X POST http://localhost:5000/api/migrations/up

# 5. Verify applied
curl http://localhost:5000/api/migrations/status
```

### Workflow 2: Troubleshoot Failed Migrations

```bash
# 1. Check status
curl http://localhost:5000/api/migrations/status

# 2. View failed migrations in history
curl http://localhost:5000/api/migrations/history?status=failed

# 3. Check if locked
curl http://localhost:5000/api/migrations/lock/status

# 4. If locked, force release (use carefully!)
curl -X POST http://localhost:5000/api/migrations/lock/release

# 5. Retry
curl -X POST http://localhost:5000/api/migrations/up
```

### Workflow 3: Rollback Changes

```bash
# 1. Check what's applied
curl http://localhost:5000/api/migrations/status

# 2. Test rollback (dry-run)
curl -X POST http://localhost:5000/api/migrations/down?dryRun=true

# 3. Actually rollback
curl -X POST http://localhost:5000/api/migrations/down

# 4. Verify rolled back
curl http://localhost:5000/api/migrations/history?status=rolled-back
```

### Workflow 4: Monitor Migration Progress

```bash
# Initial check
curl http://localhost:5000/api/migrations/status

# Monitor during execution
curl http://localhost:5000/api/migrations/lock/status

# Check after completion
curl http://localhost:5000/api/migrations/history?limit=10
```

---

## Error Handling

### 400 Bad Request

Missing required fields:

```json
{
  "error": "Migration name is required"
}
```

### 500 Internal Server Error

Migration execution failed:

```json
{
  "error": "Failed to acquire migration lock: Migration lock is held by 550e8400-e29b-41d4-a716-446655440000. Reason: Running migrations"
}
```

### Timeout Errors

Lock will auto-expire after 30 minutes. If stuck:

```bash
curl -X POST http://localhost:5000/api/migrations/lock/release
```

---

## Integration with Frontend

### React Example

```javascript
// Check status
const checkStatus = async () => {
  const response = await fetch('/api/migrations/status');
  const data = await response.json();
  console.log('Migration Status:', data);
};

// Run migrations
const runMigrations = async () => {
  try {
    // Dry run first
    const dryRun = await fetch('/api/migrations/up?dryRun=true', {
      method: 'POST'
    });
    const dryResult = await dryRun.json();
    
    if (dryRun.ok && dryResult.success) {
      // Then apply
      const actual = await fetch('/api/migrations/up', {
        method: 'POST'
      });
      const result = await actual.json();
      console.log('Migrations applied:', result);
    }
  } catch (error) {
    console.error('Migration failed:', error);
  }
};

// Check lock status
const checkLock = async () => {
  const response = await fetch('/api/migrations/lock/status');
  const data = await response.json();
  if (data.locked) {
    console.log('Migrations are locked:', data.lock.reason);
  }
};
```

### Vue Example

```vue
<script setup>
import { ref, onMounted } from 'vue'

const status = ref(null)
const loading = ref(false)

onMounted(async () => {
  await fetchStatus()
})

async function fetchStatus() {
  const response = await fetch('/api/migrations/status')
  status.value = await response.json()
}

async function runMigrations() {
  loading.value = true
  try {
    const response = await fetch('/api/migrations/up', {
      method: 'POST'
    })
    const result = await response.json()
    await fetchStatus()
  } finally {
    loading.value = false
  }
}

async function rollback() {
  loading.value = true
  try {
    const response = await fetch('/api/migrations/down', {
      method: 'POST'
    })
    const result = await response.json()
    await fetchStatus()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h2>Database Migrations</h2>
    
    <div v-if="status" class="status">
      <p>Applied: {{ status.summary.applied }}</p>
      <p>Pending: {{ status.summary.pending }}</p>
      <p>Failed: {{ status.summary.failed }}</p>
    </div>

    <button @click="runMigrations" :disabled="loading">
      {{ loading ? 'Running...' : 'Run Migrations' }}
    </button>

    <button @click="rollback" :disabled="loading">
      {{ loading ? 'Rolling back...' : 'Rollback' }}
    </button>
  </div>
</template>
```

---

## Postman Collection

Import this cURL as Postman requests:

### Collection: Database Migrations

**GET /status**
```
GET http://localhost:5000/api/migrations/status
```

**POST /up**
```
POST http://localhost:5000/api/migrations/up
```

**POST /down**
```
POST http://localhost:5000/api/migrations/down
```

**GET /history**
```
GET http://localhost:5000/api/migrations/history
```

**POST /create**
```
POST http://localhost:5000/api/migrations
Content-Type: application/json

{
  "name": "your-migration-name"
}
```

**GET /lock/status**
```
GET http://localhost:5000/api/migrations/lock/status
```

**POST /lock/release**
```
POST http://localhost:5000/api/migrations/lock/release
```

---

## Response Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | Success | Migration completed, status retrieved |
| 201 | Created | New migration file created |
| 400 | Bad Request | Missing required fields |
| 500 | Server Error | Database connection error, migration failed |

---

## Rate Limiting

Migration endpoints inherit the application's global rate limiting. If you hit limits:

```json
{
  "error": "Too many requests, please try again later"
}
```

---

For more information, see [MIGRATIONS.md](MIGRATIONS.md) and [MIGRATION_SETUP_GUIDE.md](MIGRATION_SETUP_GUIDE.md)
