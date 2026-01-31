# MongoDB Connection Pooling Optimization Plan
## Uzima Healthcare Backend

**Last Updated**: January 28, 2026  
**Status**: Analysis Complete - Ready for Implementation  
**Author**: Database Architecture Team

---

## Executive Summary

This document provides a comprehensive analysis and step-by-step implementation plan to optimize MongoDB connection pooling in the Uzima Backend. The repository currently uses basic Mongoose connection with default pooling settings. This plan addresses connection exhaustion risks, implements monitoring, and ensures optimal performance under load.

**Key Deliverables**:
- Optimized connection pool configuration (20-50 connections)
- Retry logic for transient failures
- Pool monitoring and metrics exposure
- Health endpoint with DB connection statistics
- Load testing validation approach
- Documentation of optimal settings

---

## Section 1: Repository & Current Database Connection Analysis

### 1.1 Current MongoDB Connection Setup

**File**: `src/config/database.js`
```javascript
const connectDB = async () => {
  const { db } = getConfig();
  
  try {
    await mongoose.connect(db.uri, db.options);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};
```

**Current State**:
- ✅ Uses centralized config loader (`src/config/index.js`)
- ✅ Environment-based configuration (development/staging/production)
- ❌ **NO connection pooling configuration** (relies on Mongoose defaults)
- ❌ **NO retry logic** for connection failures
- ❌ **NO timeout specifications** (connectTimeoutMS, socketTimeoutMS)
- ❌ **NO connection pool monitoring**
- ❌ **NO metrics or health endpoint for DB pool stats**

### 1.2 Configuration Files Structure

**Configuration Hierarchy**:
```
src/config/
├── index.js                    (Main config loader with Joi validation)
├── database.js                 (Connection initiation - NEEDS UPDATE)
├── environments/
│   ├── dev.js                 (Development settings)
│   ├── staging.js             (Staging settings)
│   └── prod.js                (Production settings)
├── redis.js                   (Redis client)
└── [other configs]
```

**Current DB Options** (`environments/dev.js`, `staging.js`, `prod.js`):
```javascript
db: {
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    // NO poolSize, NO timeouts, NO retry logic
  },
}
```

### 1.3 Connection Lifecycle

**Current Connection Management**:

**Initialization** (`src/index.js`):
- `connectDB()` called before Express setup
- Single connection attempt with no retries
- Failure triggers `process.exit(1)` (hard exit)

**Graceful Shutdown** (`src/shutdown.js`):
- Properly closes MongoDB connection
- 30-second timeout before forced exit
- Existing implementation is good - no changes needed

**Query Execution**:
- 40+ Mongoose models defined in `src/models/`
- Multiple routes execute concurrent queries
- No connection pool visibility or metrics

### 1.4 Existing Health Infrastructure

**File**: `src/routes/healthRoutes.js` (237 lines)

**Current Health Checks**:
- ✅ `GET /health` - Basic health check (uptime, version)
- ✅ `GET /health/detailed` - Component status (MongoDB, Redis, disk, memory)
- ✅ `GET /health/metrics` - Prometheus metrics endpoint
- ❌ **Missing**: MongoDB connection pool statistics

**MongoDB Check Implementation** (Current):
```javascript
const checkMongoDB = async () => {
  try {
    const state = mongoose.connection.readyState;
    if (state === 1) {
      return { status: 'healthy', message: 'Connected' };
    } else {
      return { status: 'unhealthy', message: `Connection state: ${state}` };
    }
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};
```

**Issues**:
- Only checks connection state (0-3), not pool health
- No visibility into pool size, active connections, waiting queue
- No pool exhaustion warnings

### 1.5 Routes & Query Load Pattern

**Route Structure** (`src/routes/index.js`):
- 45+ route files imported
- Versioned API: `/api/v1`, `/api/v2`, `/api` (legacy)
- Routes across multiple domains:
  - Authentication (JWT, OAuth, 2FA)
  - Users, Medical Records, Prescriptions
  - Inventory Management (with FIFO)
  - Payments, Analytics
  - Admin operations
  - Health & metrics

**Estimated Concurrent Queries Under Load**:
- Authentication routes: High frequency
- Record/prescription lookups: Moderate concurrent
- Inventory updates: Require transactions
- Analytics: Aggregation pipeline (heavy)
- Each endpoint may spawn 2-5 sub-queries

**Estimated Peak Load**: 
- Expected concurrent requests: 50-100
- Each request may need 1-3 DB connections
- **Recommended pool size: 25-40** (safety margin 2-3x expected concurrent queries)

### 1.6 Environment Variables Currently Validated

**File**: `src/config/index.js` (Joi schema)

**Database-Related**:
```javascript
MONGO_URI: Joi.string()
  .uri({ scheme: ['mongodb', 'mongodb+srv'] })
  .required(),
```

**Currently**: Only URI validated, NO pool configuration env vars

---

## Section 2: Connection Pool Optimization Strategy

### 2.1 Mongoose/MongoDB Driver Connection Pool Basics

**What is Connection Pooling?**
- Connection pool maintains a set of pre-established TCP connections to MongoDB
- Reuses connections across requests (eliminates handshake overhead)
- Manages queue when all connections busy
- Prevents resource exhaustion and improves throughput

**Key Parameters**:

| Parameter | Type | Default | Recommended | Purpose |
|-----------|------|---------|-------------|---------|
| `maxPoolSize` | Number | 100 | 25-40 | Max connections in pool |
| `minPoolSize` | Number | 10 | 5-10 | Min connections to maintain |
| `maxIdleTimeMS` | Number | 60000 | 30000 | Close idle connections after 30s |
| `waitQueueTimeoutMS` | Number | 10000 | 5000-10000 | Reject if queue waits too long |
| `connectTimeoutMS` | Number | 10000 | 5000-10000 | Timeout for initial connection |
| `socketTimeoutMS` | Number | 0 (infinite) | 30000-45000 | Timeout for query operations |
| `serverSelectionTimeoutMS` | Number | 30000 | 10000-30000 | Timeout for server selection |
| `retryWrites` | Boolean | true | true | Automatic retry on transient errors |
| `retryReads` | Boolean | true | true | Retry reads on network errors |

### 2.2 Environment-Specific Pool Strategy

**Development**:
- Smaller pool (5-10 connections)
- Longer timeouts for debugging
- Verbose logging
- Local MongoDB (no network overhead)

**Staging**:
- Medium pool (15-20 connections)
- Standard timeouts
- Production-like settings
- Tests realistic load before prod

**Production**:
- Optimal pool (25-40 connections) 
- Strict timeouts
- Minimal logging
- Atlas/cloud MongoDB with network latency

### 2.3 Retry Strategy Architecture

**Transient Failures to Handle**:
1. Network timeouts (temporary loss of connectivity)
2. Server selection failures (replica set elections)
3. Connection pool exhaustion (temporarily, then retry)
4. Idle connection drops by firewall/LB

**Retry Approach**:
- Use Mongoose's native `retryWrites` and `retryReads` for transient ops
- Implement exponential backoff for connection initialization
- Add circuit breaker for cascading failures
- Fail-fast on permanent errors (auth, schema validation)

### 2.4 Monitoring & Metrics Collection

**Data Points to Track**:
- Pool size (min, current, max)
- Active connections (in-use)
- Waiting queue length
- Connection age/idle time
- Connection wait time percentiles
- Connection errors (type, count)
- Pool exhaustion events

**Collection Methods**:
1. **Native MongoDB Driver Events**: Monitor pool state via driver events
2. **Prometheus Metrics**: Expose pool stats to `/health/metrics`
3. **Health Endpoint**: JSON response in `/health/db`
4. **Application Logs**: Connection issues with context

---

## Section 3: Required Components & Configuration Changes

### 3.1 Files to Create

| File Path | Purpose | Lines | Complexity |
|-----------|---------|-------|-----------|
| `src/config/mongoosePool.js` | Pool configuration & optimization | 80-120 | Medium |
| `src/utils/mongoPoolMonitor.js` | Pool event listeners & metrics | 150-200 | High |
| `src/services/connectionRetry.js` | Retry logic with exponential backoff | 100-150 | Medium |
| `docs/MONGODB_POOLING.md` | Technical documentation | 300-400 | Low |
| `scripts/load-test-mongodb.js` | Load testing script (Artillery/JMeter config) | 200-300 | High |

### 3.2 Files to Modify

| File Path | Change | Impact |
|-----------|--------|--------|
| `src/config/database.js` | Add retry logic, pool monitoring | Moderate |
| `src/config/environments/dev.js` | Add pool config | Low |
| `src/config/environments/staging.js` | Add pool config | Low |
| `src/config/environments/prod.js` | Add pool config | Low |
| `src/config/index.js` | Add env vars for pool tuning | Low |
| `src/routes/healthRoutes.js` | Add `/health/db` endpoint with pool stats | Moderate |
| `package.json` | Add new dependencies (if needed) | Low |

### 3.3 New Environment Variables

```javascript
// MongoDB Pool Configuration
MONGO_MAX_POOL_SIZE=25              // Dev: 5, Staging: 15, Prod: 25-40
MONGO_MIN_POOL_SIZE=5               // Dev: 2, Staging: 5, Prod: 5-10
MONGO_MAX_IDLE_TIME_MS=30000        // Dev: 60000, Staging: 30000, Prod: 30000
MONGO_CONNECT_TIMEOUT_MS=10000      // Dev: 20000, Staging: 10000, Prod: 10000
MONGO_SOCKET_TIMEOUT_MS=30000       // Dev: 45000, Staging: 30000, Prod: 30000
MONGO_WAIT_QUEUE_TIMEOUT_MS=10000   // Dev: 10000, Staging: 10000, Prod: 10000
MONGO_SERVER_SELECTION_TIMEOUT_MS=30000 // All envs: 30000
MONGO_RETRY_WRITES=true             // All envs: true
MONGO_RETRY_READS=true              // All envs: true
MONGO_CONNECTION_RETRY_MAX_ATTEMPTS=3  // Retry attempts on init
MONGO_CONNECTION_RETRY_INITIAL_DELAY_MS=1000 // Exponential backoff
```

### 3.4 Dependencies Check

**Current** (`package.json`):
- ✅ `mongoose`: ^8.18.2 (already installed)
- ✅ `express`: ^5.1.0
- ❌ `prom-client`: For Prometheus metrics (already in healthRoutes.js!)
- ❌ `artillery`: For load testing (optional)

**No new npm dependencies required** - MongoDB driver events are native to mongoose.

---

## Section 4: Step-by-Step Implementation Plan

### Phase 1: Configuration Enhancement (1-2 hours)

**Objective**: Add environment variables and configuration layers for pool tuning

**Tasks**:

#### 1.1 Update Environment Variable Schema (`src/config/index.js`)
- Add 10 new Joi validation rules for pool parameters
- Set appropriate defaults per environment
- All variables optional with sensible defaults

**Validation Rules Template**:
```javascript
MONGO_MAX_POOL_SIZE: Joi.number()
  .integer()
  .min(5)
  .max(100)
  .default(25) // Override in env-specific config
  .description('MongoDB max pool size'),
  
MONGO_MIN_POOL_SIZE: Joi.number()
  .integer()
  .min(1)
  .max(50)
  .default(5)
  .description('MongoDB min pool size'),

// ... [8 more parameters]
```

#### 1.2 Update Environment-Specific Configs
- `src/config/environments/dev.js`: Small pools, long timeouts
- `src/config/environments/staging.js`: Medium pools, standard timeouts
- `src/config/environments/prod.js`: Larger pools, strict timeouts

**Pattern**:
```javascript
db: {
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 5,            // Dev: small
    minPoolSize: 2,
    maxIdleTimeMS: 60000,      // Dev: longer
    waitQueueTimeoutMS: 10000,
    connectTimeoutMS: 20000,   // Dev: longer for debugging
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 30000,
    retryWrites: true,
    retryReads: true,
  },
}
```

#### 1.3 Update `src/config/index.js` Config Builder
- Extract pool parameters from environment variables
- Merge with environment-specific defaults
- Ensure type safety and validation

**Output Structure**:
```javascript
db: {
  uri: validatedEnv.MONGO_URI,
  options: {
    // ... pooling options from validated env
  },
  pool: {
    // New: pooling metadata
    maxSize: validatedEnv.MONGO_MAX_POOL_SIZE,
    minSize: validatedEnv.MONGO_MIN_POOL_SIZE,
    connectionRetryMaxAttempts: validatedEnv.MONGO_CONNECTION_RETRY_MAX_ATTEMPTS,
    connectionRetryInitialDelay: validatedEnv.MONGO_CONNECTION_RETRY_INITIAL_DELAY_MS,
  }
}
```

**Effort**: 90 minutes  
**Files**: 4 files modified  
**Validation**: Config loads without errors, values passed to Mongoose

---

### Phase 2: Connection Initialization with Retry Logic (2-3 hours)

**Objective**: Implement exponential backoff retry for initial connection

**Tasks**:

#### 2.1 Create `src/services/connectionRetry.js`
- Function: `connectWithRetry(uri, options, maxAttempts, initialDelayMs)`
- Exponential backoff: attempt 1 = 1s, attempt 2 = 2s, attempt 3 = 4s
- Logs attempt details (attempt #, delay, error reason)
- Returns connection promise or throws after max attempts

**Algorithm**:
```
For attempt = 1 to maxAttempts:
  Try: await mongoose.connect(uri, options)
  If success: return connection
  If attempt < maxAttempts:
    delay = initialDelayMs * (2 ^ (attempt - 1))
    Log: "Retrying in {delay}ms..."
    await sleep(delay)
  Else:
    throw: "Failed to connect after {maxAttempts} attempts"
```

**Error Handling**:
- Catch and log each failure with error code
- Distinguish transient errors (network) vs permanent (auth)
- Only retry on transient errors

#### 2.2 Update `src/config/database.js`
Replace simple `mongoose.connect()` with retry logic

**Before**:
```javascript
const connectDB = async () => {
  const { db } = getConfig();
  try {
    await mongoose.connect(db.uri, db.options);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};
```

**After**:
```javascript
const connectDB = async () => {
  const { db } = getConfig();
  try {
    await connectWithRetry(
      db.uri,
      db.options,
      db.pool.connectionRetryMaxAttempts,
      db.pool.connectionRetryInitialDelay
    );
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('Failed to connect to MongoDB after retries:', error);
    process.exit(1);
  }
};
```

**Effort**: 90 minutes  
**Files**: 2 files (1 new, 1 modified)  
**Validation**: Retry logic tested with connection failure simulation

---

### Phase 3: Pool Monitoring & Event Listeners (2-4 hours)

**Objective**: Capture pool metrics and expose pool status

**Tasks**:

#### 3.1 Create `src/utils/mongoPoolMonitor.js`
- Initialize MongoDB driver event listeners
- Track pool metrics in-memory
- Expose getter functions for pool state
- Integrate with Prometheus metrics

**Event Listeners to Implement**:
```javascript
Events:
- connectionPoolCreated(event)        // Pool initialized
- connectionPoolClosed(event)         // Pool closed
- connectionCreated(event)            // New connection added
- connectionClosed(event)             // Connection closed
- connectionCheckedOut(event)         // Connection allocated to request
- connectionCheckedIn(event)          // Connection returned to pool
- connectionCheckOutFailed(event)     // Failed to get connection
- connectionCheckOutStarted(event)    // Started waiting for connection
```

**Metrics to Track**:
```javascript
{
  poolSize: {
    current: number,      // Total connections in pool
    available: number,    // Available for use
    inUse: number,       // Currently in use
    min: number,         // Configured min
    max: number,         // Configured max
  },
  queue: {
    waiting: number,      // Requests waiting for connection
    totalWaited: number,  // Cumulative waited count
  },
  connections: {
    created: number,      // Total created in lifetime
    closed: number,       // Total closed in lifetime
    errors: number,       // Total errors
  },
  timing: {
    checkoutWaitMs: number,  // Current wait time
    avgCheckoutWaitMs: number,
    maxCheckoutWaitMs: number,
  },
  health: {
    poolExhausted: boolean,  // true if waiting > 0 and available = 0
    lastEventTime: timestamp,
    eventsSinceStartup: number,
  }
}
```

**Implementation Pattern**:
```javascript
const poolMetrics = {};

mongoose.connection.on('connected', () => {
  // Initialize on connection
  const client = mongoose.connection.getClient();
  client.on('connectionCreated', (event) => {
    poolMetrics.connections.created++;
  });
  // ... attach other event listeners
});

export function getPoolStats() {
  return {
    ...poolMetrics,
    timestamp: new Date().toISOString(),
  };
}
```

#### 3.2 Register Pool Monitor in `src/config/database.js`
- Import and initialize monitor after successful connection
- Ensures monitoring active for all connections
- Export pool stats getter for health endpoint

**Effort**: 150 minutes  
**Files**: 2 files (1 new, 1 modified)  
**Validation**: Events logged, metrics populated, stats exported

---

### Phase 4: Health Endpoint Enhancement (1.5-2 hours)

**Objective**: Add `/health/db` endpoint exposing pool statistics

**Tasks**:

#### 4.1 Extend `src/routes/healthRoutes.js`
Add new endpoint: `GET /health/db`

**Response Structure**:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-28T10:00:00Z",
  "connectionState": {
    "readyState": 1,
    "states": {
      "0": "disconnected",
      "1": "connected",
      "2": "connecting",
      "3": "disconnecting"
    }
  },
  "pool": {
    "size": {
      "current": 8,
      "available": 6,
      "inUse": 2,
      "configured": {
        "min": 5,
        "max": 25
      }
    },
    "queue": {
      "waiting": 0,
      "timeoutMs": 10000
    },
    "connections": {
      "created": 120,
      "closed": 112,
      "errors": 2
    },
    "timing": {
      "lastCheckoutWaitMs": 15,
      "avgCheckoutWaitMs": 8,
      "maxCheckoutWaitMs": 150
    },
    "health": {
      "poolExhausted": false,
      "warnings": [],
      "lastEventTime": "2026-01-28T10:00:00Z"
    }
  },
  "diagnostics": {
    "healthStatus": "healthy",
    "recommendations": []
  }
}
```

**Diagnostic Logic**:
```javascript
// Determine health status
if (poolStats.pool.health.poolExhausted) {
  status = "unhealthy";
  recommendations.push("Pool exhausted - increase maxPoolSize");
}
if (poolStats.pool.connections.errors > 10) {
  status = "degraded";
  recommendations.push("High connection error rate - check network");
}
if (poolStats.pool.queue.waiting > poolStats.pool.size.configured.max) {
  status = "warning";
  recommendations.push("Queue > pool size - increase pool capacity");
}
```

#### 4.2 Update Existing `/health/detailed` Endpoint
- Enhance MongoDB check to include pool statistics
- Include pool warnings in "components.mongodb.warnings"

**Before**:
```javascript
mongodb: {
  status: 'healthy',
  message: 'Connected'
}
```

**After**:
```javascript
mongodb: {
  status: 'healthy',
  message: 'Connected',
  poolSize: 8,
  poolAvailable: 6,
  poolMax: 25,
  warnings: []
}
```

#### 4.3 Integrate with Prometheus Metrics
Add gauges to `/health/metrics`:
```javascript
// New Prometheus gauges
const mongoDBPoolSize = new Gauge({
  name: 'mongodb_pool_size',
  help: 'MongoDB connection pool current size',
});

const mongoDBPoolAvailable = new Gauge({
  name: 'mongodb_pool_available_connections',
  help: 'Available connections in pool',
});

const mongoDBPoolInUse = new Gauge({
  name: 'mongodb_pool_in_use_connections',
  help: 'In-use connections in pool',
});

const mongoDBQueueWaiting = new Gauge({
  name: 'mongodb_queue_waiting_requests',
  help: 'Requests waiting for connection',
});

// Update metrics on request
app.get('/health/metrics', async (req, res) => {
  const stats = getPoolStats();
  mongoDBPoolSize.set(stats.pool.size.current);
  mongoDBPoolAvailable.set(stats.pool.size.available);
  mongoDBPoolInUse.set(stats.pool.size.inUse);
  mongoDBQueueWaiting.set(stats.pool.queue.waiting);
  // ... return metrics
});
```

**Effort**: 90 minutes  
**Files**: 1 file modified (healthRoutes.js)  
**Validation**: Endpoints return proper JSON, Prometheus metrics exported

---

### Phase 5: Load Testing & Validation (3-5 hours)

**Objective**: Validate pool configuration under load

**Tasks**:

#### 5.1 Create Load Testing Script (`scripts/load-test-mongodb.js`)
- Artillery or custom Node.js load generator
- Simulates concurrent requests hitting multiple endpoints
- Monitors pool metrics during test
- Generates performance report

**Test Scenarios**:

**Scenario 1: Steady State Load**
```yaml
Config:
  Duration: 60 seconds
  Arrival Rate: 10 requests/sec
  Ramp-up: 5 seconds
  
Expected:
  - No pool exhaustion
  - Available connections > 0
  - Response times < 200ms
  - Success rate 100%
```

**Scenario 2: Peak Load Spike**
```yaml
Config:
  Duration: 30 seconds
  Arrival Rate: 50 requests/sec (5x normal)
  Duration: 10 seconds
  Then drop to: 10 requests/sec
  
Expected:
  - Temporary queue formation (acceptable)
  - No timeouts (socketTimeoutMS not triggered)
  - Recovery within 2 seconds
  - No connection errors
```

**Scenario 3: Connection Reset Simulation**
```yaml
Config:
  During test:
  - Kill 5 connections every 5 seconds
  - Observe pool recovery
  
Expected:
  - Automatic reconnection
  - Transient delays only
  - No permanent failures
  - Pool self-heals
```

**Load Test Script Structure**:
```javascript
// Load test plan
const plan = {
  config: {
    target: 'http://localhost:5000',
    phases: [
      { duration: 10, arrivalRate: 5, name: 'Warm up' },
      { duration: 60, arrivalRate: 10, name: 'Steady state' },
      { duration: 20, arrivalRate: 50, name: 'Peak load' },
      { duration: 30, arrivalRate: 10, name: 'Cool down' },
    ]
  },
  scenarios: [
    {
      name: 'Read Heavy Workload',
      flow: [
        { get: { url: '/api/health/db' } },
        { get: { url: '/api/records' } },
        { get: { url: '/api/users' } }
      ]
    },
    {
      name: 'Write Heavy Workload',
      flow: [
        { post: { url: '/api/records', json: {...} } },
        { put: { url: '/api/records/{id}', json: {...} } }
      ]
    }
  ]
};
```

#### 5.2 Artillery Configuration File (`artillery/load-test.yml`)
Alternative: Use Artillery instead of custom script

```yaml
config:
  target: "http://localhost:5000"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Steady Load"
    - duration: 30
      arrivalRate: 50
      name: "Spike Test"
  processor: "./load-test-processor.js"
  
scenarios:
  - name: "Mixed Workload"
    flow:
      - get:
          url: "/api/records"
      - get:
          url: "/api/health/db"
      - think: 2000
      - post:
          url: "/api/prescriptions"
          json:
            patientId: "{{ $randomString(24) }}"
            medications: [...]
```

#### 5.3 Monitoring During Load Test
- Collect pool metrics every 5 seconds
- Log to CSV for analysis
- Track:
  - Pool size changes
  - Queue length
  - Response times
  - Error rates
  - Connection lifecycle events

**Monitoring Code**:
```javascript
const metricsLog = [];
const monitorInterval = setInterval(() => {
  const poolStats = getPoolStats();
  metricsLog.push({
    timestamp: Date.now(),
    ...poolStats.pool
  });
}, 5000);

// After test completes
function analyzeResults(metricsLog, results) {
  return {
    testDuration: results.aggregate.total,
    requests: results.aggregate.successfulRequests,
    errors: results.aggregate.codes['5xx'] || 0,
    p50: results.latency.p50,
    p95: results.latency.p95,
    p99: results.latency.p99,
    poolPeakSize: Math.max(...metricsLog.map(m => m.size.current)),
    poolMinAvailable: Math.min(...metricsLog.map(m => m.size.available)),
    maxQueueWaiting: Math.max(...metricsLog.map(m => m.queue.waiting)),
  };
}
```

#### 5.4 Create Load Test Report
- HTML report with charts
- Pass/fail criteria verification
- Recommendations for pool sizing

**Acceptance Criteria**:
- ✅ Peak load: 0 timeouts (socketTimeoutMS not triggered)
- ✅ Spike test: Response time increase < 200ms
- ✅ Connection errors: < 0.1% of requests
- ✅ Pool availability: Never 0 for more than 1 second
- ✅ Recovery: Pool returns to steady state within 10 seconds

**Effort**: 180 minutes  
**Files**: 2-3 files (load test script, Artillery config, optional processor)  
**Validation**: Load test completes, metrics logged, report generated

---

### Phase 6: Documentation (1-2 hours)

**Objective**: Document optimal settings and monitoring procedures

**Tasks**:

#### 6.1 Create `docs/MONGODB_POOLING.md`
**Sections**:
1. Quick Start Guide (copy-paste pool config)
2. Architecture Overview (what pooling does)
3. Configuration Reference (all parameters explained)
4. Tuning Guide (how to adjust based on load)
5. Monitoring (how to read health endpoint)
6. Troubleshooting (common issues)
7. Load Testing (how to run and interpret)
8. Performance Baselines (expected metrics)

**Key Sections Detail**:

**Tuning Guide**:
```markdown
### Adjust maxPoolSize

Increasing maxPoolSize:
- ✅ Pros: Handles more concurrent requests, reduces queue wait
- ❌ Cons: Higher memory usage, more TCP connections to MongoDB

When to increase:
- Average queue wait time > 50ms
- Pool exhaustion events occurring
- P99 response times increasing

Formula: maxPoolSize = (peak_concurrent_requests * 1.5) + buffer
Example: 30 expected concurrent → maxPoolSize = 50
```

#### 6.2 Update `src/config/CONFIG.md`
Add MongoDB pooling section:
- Environment variables list
- Default values per environment
- Recommended values for different workloads

#### 6.3 Create Sample `.env.example` Additions
```dotenv
# MongoDB Pool Configuration (Optional - defaults applied per environment)
# Development: Small pool for local debugging
# Production: Larger pool for high throughput

MONGO_MAX_POOL_SIZE=25
MONGO_MIN_POOL_SIZE=5
MONGO_MAX_IDLE_TIME_MS=30000
MONGO_CONNECT_TIMEOUT_MS=10000
MONGO_SOCKET_TIMEOUT_MS=30000
MONGO_WAIT_QUEUE_TIMEOUT_MS=10000
MONGO_CONNECTION_RETRY_MAX_ATTEMPTS=3
MONGO_CONNECTION_RETRY_INITIAL_DELAY_MS=1000
```

#### 6.4 Add Inline Code Documentation
- JSDoc comments in pool monitor
- Connection retry logic explained
- Health endpoint response schema documented

**Effort**: 60 minutes  
**Files**: 3 files (2 new markdown, 1 env example)  
**Validation**: Documentation complete, examples tested

---

## Section 5: Load Testing & Validation Approach

### 5.1 Load Testing Tools & Setup

**Recommended Tools**:

| Tool | Pros | Cons | Best For |
|------|------|------|----------|
| **Artillery** | YAML config, built-in metrics, easy setup | Less control over custom logic | Quick validation, standard scenarios |
| **JMeter** | Visual UI, detailed reporting, mature | Steep learning curve, resource-heavy | Enterprise, complex scenarios |
| **Custom Node.js** | Full control, exact metrics needed | More code to write | Custom MongoDB pool validation |

**Recommendation**: Start with custom Node.js script (for MongoDB-specific monitoring), then optionally add Artillery for standard load testing.

### 5.2 Test Environment Setup

**Requirements**:
- Test server: Same hardware as production (or similar)
- MongoDB instance: Separate from production
- Network: Consistent latency/bandwidth
- Baseline: Run tests with current pool config first

**Setup Steps**:
```bash
# 1. Start clean server
npm run dev

# 2. Wait for health check
curl http://localhost:5000/api/health

# 3. Run load test
npm run load-test:steady-state
npm run load-test:spike
npm run load-test:recovery

# 4. Collect results
npm run load-test:report
```

### 5.3 Test Execution Phases

**Phase A: Baseline (Current Configuration)**
- Run tests with existing pool settings
- Record metrics for comparison
- Establish baseline performance

**Phase B: Optimized Configuration**
- Apply recommended pool settings
- Run identical test suite
- Compare against baseline

**Phase C: Stress Testing**
- Gradually increase load beyond expected peak
- Identify failure points
- Document pool behavior at extremes

**Phase D: Sustained Load**
- 5-10 minute test at expected peak load
- Monitor for memory leaks
- Verify no connection degradation

### 5.4 Success Metrics & Acceptance Criteria

**Performance Metrics**:
```
✅ Steady State (10 req/sec)
  - Response time p50: < 100ms
  - Response time p99: < 300ms
  - Error rate: 0%
  - Pool available: > 50%

✅ Peak Load (50 req/sec)
  - Response time p50: < 200ms
  - Response time p99: < 600ms
  - Error rate: < 0.1%
  - Queue wait: < 5 seconds
  - No timeouts

✅ Recovery (after spike)
  - Return to steady state: < 10 seconds
  - Available connections: > 50%
  - No lingering connections: No

✅ Sustained Load (10 minutes)
  - Consistent response times (no degradation)
  - No memory growth > 50MB
  - Connection count stable
```

### 5.5 Monitoring During Load Test

**Collect These Metrics**:
1. **HTTP Level**: requests/sec, response time, errors, status codes
2. **Pool Level**: size, available, in-use, queue length
3. **Connection Level**: created, closed, errors, average lifetime
4. **Server Level**: CPU, memory, disk I/O

**Tools**:
- Artillery's built-in reporting
- Health endpoint polling every 5 seconds
- `/health/metrics` Prometheus endpoint
- Server `top` or `htop` for system metrics

**Analysis**:
- Plot pool size over time
- Identify pool exhaustion moments
- Correlate with response time spikes
- Validate recovery behavior

### 5.6 Load Test Report Template

**Report Structure**:
```markdown
# Load Test Report - MongoDB Pool Optimization

**Test Date**: [Date]
**Configuration**: [Pool settings tested]
**Environment**: [Dev/Staging/Prod]

## Executive Summary
- Pool sizing: [min-max]
- Peak load sustained: [req/sec]
- Result: ✅ PASSED / ❌ FAILED

## Test Scenarios
### Scenario 1: Steady State (10 req/sec)
- Duration: 60s
- Result: [p50, p95, p99, errors]
- Pool behavior: [observations]

### Scenario 2: Spike Load (50 req/sec)
- Duration: 30s
- Result: [p50, p95, p99, errors]
- Pool behavior: [queue, exhaustion, recovery]

## Acceptance Criteria
- ✅/❌ No timeouts during peak
- ✅/❌ Error rate < 0.1%
- ✅/❌ Pool never fully exhausted
- ✅/❌ Recovery within 10 seconds

## Recommendations
[Adjustments to pool config, if needed]
```

---

## Section 6: Implementation Checklist & Timeline

### Pre-Implementation

- [ ] Review this plan with team
- [ ] Identify optimal pool sizes for expected load
- [ ] Prepare test environment (separate MongoDB)
- [ ] Set up load testing tools

### Phase 1: Configuration (Day 1 - 1.5 hours)

- [ ] Update `src/config/index.js` with Joi validation for 10 pool parameters
- [ ] Update `src/config/environments/dev.js` with dev pool config
- [ ] Update `src/config/environments/staging.js` with staging pool config
- [ ] Update `src/config/environments/prod.js` with prod pool config
- [ ] Test config loads without errors
- [ ] Verify values available in `getConfig().db.options`

### Phase 2: Connection Retry (Day 1 - 2 hours)

- [ ] Create `src/services/connectionRetry.js`
- [ ] Implement exponential backoff algorithm
- [ ] Update `src/config/database.js` to use retry logic
- [ ] Test with MongoDB down, verify retries work
- [ ] Test with MongoDB up, verify one-shot connection succeeds
- [ ] Verify no infinite retry loops

### Phase 3: Pool Monitoring (Day 1-2 - 2.5 hours)

- [ ] Create `src/utils/mongoPoolMonitor.js`
- [ ] Implement MongoDB driver event listeners
- [ ] Build metrics collection object
- [ ] Export `getPoolStats()` function
- [ ] Update `src/config/database.js` to initialize monitor
- [ ] Verify events firing, metrics populating
- [ ] Test with sample load, verify changes in metrics

### Phase 4: Health Endpoint (Day 2 - 1.5 hours)

- [ ] Create new `GET /health/db` endpoint
- [ ] Implement diagnostic logic (status determination)
- [ ] Add Prometheus gauges for pool metrics
- [ ] Update `GET /health/detailed` MongoDB check
- [ ] Test endpoints respond with correct structure
- [ ] Verify metrics exposed in Prometheus format

### Phase 5: Load Testing (Day 2-3 - 3 hours)

- [ ] Create load test script
- [ ] Develop test scenarios (steady, spike, recovery)
- [ ] Implement metrics collection during test
- [ ] Run baseline tests (current config)
- [ ] Run optimized tests (new config)
- [ ] Generate report with comparison
- [ ] Validate against acceptance criteria

### Phase 6: Documentation (Day 3 - 1 hour)

- [ ] Write `docs/MONGODB_POOLING.md`
- [ ] Update `src/config/CONFIG.md`
- [ ] Add `.env.example` additions
- [ ] Add inline code documentation (JSDoc)
- [ ] Review documentation completeness
- [ ] Create summary for team

### Testing & Validation

- [ ] Unit tests for retry logic (mock connect failures)
- [ ] Integration test: endpoint returns valid pool stats
- [ ] Load test: validates acceptance criteria
- [ ] Production staging: test with production database snapshot
- [ ] Peer review of code changes

### Deployment

- [ ] Merge feature branch
- [ ] Deploy to staging
- [ ] Run production load test against staging
- [ ] Deploy to production during low-traffic window
- [ ] Monitor pool metrics for 24 hours post-deploy
- [ ] Adjust pool size if needed based on real traffic

---

## Section 7: Handling Edge Cases & Troubleshooting

### Common Issues & Solutions

**Issue 1: Pool Exhaustion Under Load**
```
Symptom:
- maxPoolSize reached
- Queue building up
- Some requests timeout

Solution:
- Increase maxPoolSize by 10-20%
- Check for long-running queries holding connections
- Verify socketTimeoutMS is configured
- Consider optimizing slow queries
```

**Issue 2: Connection Timeouts**
```
Symptom:
- "Client disconnected" errors
- Dropped connections frequently

Solution:
- Increase connectTimeoutMS (especially for cloud)
- Check network latency to MongoDB
- Verify firewall allows persistent connections
- Reduce maxIdleTimeMS if firewall drops idle connections
```

**Issue 3: Memory Leak**
```
Symptom:
- Memory grows over time
- doesn't stabilize
- Connections not closing properly

Solution:
- Verify maxIdleTimeMS is set (not 0)
- Check that connections are returned to pool
- Audit code for connection leaks (unclosed queries)
- Enable detailed monitoring to find leaking connections
```

**Issue 4: Slow Recovery After Connection Loss**
```
Symptom:
- Pool takes > 30 seconds to recover
- High error rate during recovery

Solution:
- Reduce serverSelectionTimeoutMS
- Increase retryWrites = true (should be default)
- Check network stability
- Consider circuit breaker pattern for cascading failures
```

### Manual Testing Commands

```bash
# Check pool status
curl http://localhost:5000/api/health/db | jq '.pool'

# Check detailed health with pool info
curl http://localhost:5000/api/health/detailed | jq '.components.mongodb'

# Get Prometheus metrics
curl http://localhost:5000/api/health/metrics | grep mongodb

# Simulate connection drop (restart MongoDB)
# Then check recovery in pool metrics

# Load test with slow queries
# Monitor pool behavior with high wait times
```

---

## Summary: What to Implement

| Phase | Component | Status | Priority |
|-------|-----------|--------|----------|
| 1 | Pool configuration (env vars) | ✅ Designed | CRITICAL |
| 2 | Retry logic with backoff | ✅ Designed | CRITICAL |
| 3 | Pool monitoring & metrics | ✅ Designed | HIGH |
| 4 | Health endpoint `/health/db` | ✅ Designed | HIGH |
| 5 | Load testing & validation | ✅ Designed | MEDIUM |
| 6 | Documentation | ✅ Designed | MEDIUM |

**Total Estimated Effort**: 10-14 hours of implementation + 2-3 hours testing

**Expected Outcome**: 
- ✅ Connection pool sized 20-50 per environment
- ✅ Automatic retry on transient failures
- ✅ Full pool visibility via health endpoint
- ✅ Load testing validates configuration
- ✅ Zero connection exhaustion under peak load
- ✅ Complete documentation for operations team

---

**Next Steps**: 
When you're ready to proceed, provide authorization to begin Phase 1 (Configuration Enhancement). I'll create the code implementations following this plan.

