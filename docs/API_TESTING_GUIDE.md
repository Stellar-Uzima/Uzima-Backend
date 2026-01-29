# API Testing Guide - Uzima Healthcare Platform

Complete guide for running and managing API tests using Postman and Newman CLI.

## Quick Start

### Prerequisites
- Node.js v16+
- npm v8+
- Running MongoDB instance
- Running Redis instance
- Uzima Backend server running locally

### Run Tests Locally

```bash
# Setup environment and run full test suite
npm run test:api

# Run tests against staging
npm run test:api:staging

# Run smoke tests against production
npm run test:api:prod

# Run all environment tests
npm run test:api:all
```

## Directory Structure

```
postman/
├── Uzima-API.postman_collection.json     # Main collection with 50+ tests
└── environments/
    ├── Development.postman_environment.json      # Dev environment vars
    ├── Staging.postman_environment.json          # Staging environment vars
    └── Production.postman_environment.json       # Production environment vars

scripts/
├── api-test-setup.js                     # Seed users, create test data
└── parse-newman-report.js                # Parse test results (optional)

test-results/
├── api-test-results.html                 # Human-readable HTML report
├── api-test-results.json                 # Machine-readable results
└── api-test-summary.txt                  # Quick summary

docs/
├── API_TESTING_GUIDE.md                  # This file
├── NEWMAN_SETUP.md                       # Newman CLI setup details
├── POSTMAN_COLLECTION_MANIFEST.md        # Endpoint coverage map
└── API_TEST_SCENARIOS.md                 # Detailed test scenarios
```

## Test Environment Setup

### Development Environment

1. **Start MongoDB**:
   ```bash
   # Using Docker
   docker run -d -p 27017:27017 --name mongodb mongo:5
   
   # Or using mongod directly
   mongod
   ```

2. **Start Redis**:
   ```bash
   # Using Docker
   docker run -d -p 6379:6379 --name redis redis:7-alpine
   
   # Or using redis-server directly
   redis-server
   ```

3. **Start Uzima Backend**:
   ```bash
   npm run dev
   ```

4. **Run API Tests**:
   ```bash
   npm run test:api
   ```

### Environment Variables

Create or update `.env` with:

```dotenv
# Core
MONGO_URI=mongodb://localhost:27017/uzima_dev
PORT=5000
JWT_SECRET=your-jwt-secret-key
NODE_ENV=development

# Optional
API_BASE_URL=http://localhost:5000
REDIS_URL=redis://localhost:6379
```

## Understanding Test Results

### HTML Report

The generated `test-results/api-test-results.html` includes:

- **Test Summary**: Total, passed, failed, skipped
- **Collection Stats**: Requests sent, assertions checked
- **Request Details**: Each request with status, response time
- **Response Preview**: Full request/response bodies for debugging
- **Test Scripts**: Assertions that were executed
- **Timeline**: Execution time for each test

### JSON Results

The `api-test-results.json` contains:

```json
{
  "run": {
    "stats": {
      "collections": 1,
      "folders": 8,
      "requests": {
        "total": 50,
        "failed": 0
      },
      "tests": {
        "total": 100,
        "passed": 100,
        "failed": 0
      },
      "assertions": {
        "total": 120,
        "passed": 120,
        "failed": 0
      },
      "testScripts": {
        "passed": 45,
        "failed": 0
      }
    },
    "timings": {
      "start": "2026-01-28T10:00:00.000Z",
      "completed": "2026-01-28T10:02:30.000Z"
    }
  }
}
```

### CLI Output

Newman displays test progress in terminal:

```
┌─────────────────────────────────┬──────────┬──────────┐
│                         │ executed │   failed │
├─────────────────────────────────┼──────────┼──────────┤
│ ↳ Authentication        │       12 │        0 │
│  ↳ Register User        │        1 │        0 │
│  ↳ Login User           │        1 │        0 │
│ ↳ User Management       │        8 │        0 │
│ ↳ Medical Records       │       10 │        0 │
└─────────────────────────────────┴──────────┴──────────┘

│ iterations │ 1                                         │
│ requests   │ 50                                        │
│ tests      │ 100                                       │
│ assertions │ 120                                       │
│ duration   │ 2m 30s                                    │
```

## Working with Postman GUI

### Import Collection

1. Open [Postman Desktop](https://www.postman.com/downloads/)
2. Click **Import** button
3. Select `postman/Uzima-API.postman_collection.json`
4. Click **Import**

### Import Environment

1. Click **Environments** in left sidebar
2. Click **Import**
3. Select `postman/environments/Development.postman_environment.json`
4. Click **Import**
5. Set as active environment (top-right dropdown)

### Running Tests in Postman GUI

1. Click on collection name → **Run** button
2. Select environment
3. Choose start folder (or run all)
4. Click **Run Uzima-API** button
5. Watch live test execution
6. Review results in output panel

### Editing Tests

1. Select an endpoint in collection
2. Click **Tests** tab
3. Edit test script (JavaScript)
4. Click **Save** to persist

**Example test**:
```javascript
pm.test("Status is 200", () => {
    pm.response.to.have.status(200);
});

pm.test("Response contains user", () => {
    const json = pm.response.json();
    pm.expect(json).to.have.property('_id');
});
```

## Updating Test Data

### Add New Test User

Edit `scripts/api-test-setup.js`:

```javascript
const TEST_USERS = {
  admin: { /* existing */ },
  // Add new role:
  nurse: {
    email: 'nurse.test@uzima.local',
    password: 'NurseTest@123',
    username: 'nurse_test',
    role: 'nurse',
  }
};
```

### Create New Endpoint Test

1. **In Postman GUI**:
   - Right-click folder → **Add Request**
   - Fill in URL, method, headers, body
   - Add test script in **Tests** tab
   - Click **Save**

2. **Export to file**:
   - Right-click collection → **Export**
   - Select `postman/Uzima-API.postman_collection.json`
   - Choose "Collection v2.1"

3. **Or edit JSON directly**:
   - Open `postman/Uzima-API.postman_collection.json`
   - Add new item under appropriate folder
   - Save and re-import in Postman GUI

## Fixing Flaky Tests

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Timeout | Server too slow | Increase `--timeout` in newman |
| Token invalid | Previous test failed | Check setup script logs |
| Rate limit hit | Tests running too fast | Add delays with `setTimeout` |
| Missing test data | Setup script incomplete | Run pretest:api manually |
| Connection refused | Service not running | Start MongoDB, Redis, server |

### Debugging

1. **Check server logs**:
   ```bash
   # Terminal where server is running
   npm run dev
   ```

2. **Review setup script output**:
   ```bash
   node scripts/api-test-setup.js
   ```

3. **Run single endpoint test**:
   ```bash
   newman run postman/Uzima-API.postman_collection.json \
     -e postman/environments/Development.postman_environment.json \
     --folder "Authentication" \
     --folder "Login User"
   ```

4. **Enable verbose logging**:
   ```bash
   newman run ... --verbose
   ```

5. **Export requests as cURL**:
   - Open endpoint in Postman
   - Click **Code** button
   - Select **cURL**
   - Copy and run in terminal

## Performance Baselines

Expected response times (in milliseconds):

```
Authentication endpoints:     200-500ms
User management:              150-400ms
Medical records CRUD:         200-600ms
Prescriptions:                250-700ms
Inventory management:         150-400ms
Payment initialization:       300-1000ms
Admin operations:             500-2000ms
Health checks:                50-200ms
```

If endpoints exceed these, investigate:
- Database query optimization
- Network latency
- Server resource usage (CPU, memory)
- Redis connection issues

## CI/CD Integration

### GitHub Actions

The `.github/workflows/api-testing.yml` automatically runs tests on:

- **Pull requests** to `main` or `develop` branches
- **Manual trigger** (workflow_dispatch)
- **Schedule** - Daily at 2 AM UTC

**Status checks**:
- ✅ Tests passed → PR can merge
- ❌ Tests failed → PR blocked until fixed

### Viewing CI Results

1. **In GitHub PR**:
   - Scroll to "Checks" section
   - Click "API Tests - Development"
   - View live logs and artifacts

2. **View HTML report**:
   - Click "Artifacts" tab
   - Download `api-test-report-html.zip`
   - Open `api-test-results.html` in browser

3. **View test summary**:
   - Look for comment on PR with test metrics

## Maintenance & Updates

### Adding New Endpoints

When new API endpoints are added:

1. **Document in Swagger/OpenAPI**
2. **Create Postman test**:
   - Add folder (if new feature)
   - Add request with proper auth
   - Add test script for validation
3. **Update collection JSON**
4. **Update endpoint coverage** in POSTMAN_COLLECTION_MANIFEST.md
5. **Commit and push**

### Updating Existing Tests

If an endpoint changes:

1. **Update request** (URL, headers, body)
2. **Update test scripts** (verify new response structure)
3. **Update environment variables** (if needed)
4. **Export and commit**

### Deprecating Tests

If removing an endpoint:

1. **Mark as deprecated** in test folder name
2. **Comment out** test folder (don't delete)
3. **Update POSTMAN_COLLECTION_MANIFEST.md**
4. **Remove from CI** if it breaks

## Troubleshooting

### "API server did not start within timeout"
```
❌ API server not responding on http://localhost:5000

Fix:
1. Check if server is running: npm run dev
2. Check logs for startup errors
3. Verify port 5000 is not in use: lsof -i :5000
4. Try different port: PORT=5001 npm run dev
```

### "Authentication failed"
```
❌ Token invalid or expired

Fix:
1. Run setup script again: npm run pretest:api
2. Check JWT_SECRET in .env
3. Verify test user exists in database
4. Check environment variable interpolation
```

### "Rate limit exceeded (429)"
```
❌ Too many requests

Fix:
1. Wait before retrying (15 minutes for auth endpoints)
2. Run fewer tests in parallel
3. Increase delays between requests
```

### "Cannot find module 'newman'"
```
❌ Newman not installed

Fix:
npm install newman newman-reporter-html --save-dev
```

## Best Practices

1. **Keep tests isolated** - Each test should be independent
2. **Use meaningful names** - Folder and request names should describe purpose
3. **Validate responses** - Always check status code AND response structure
4. **Handle dynamic data** - Use environment variables for IDs, tokens
5. **Document assumptions** - Comment complex test logic
6. **Review reports** - Check HTML report after each test run
7. **Commit collection** - Version control Postman collection JSON
8. **Rotate credentials** - Change test user passwords periodically

## Support & Resources

- **Newman Documentation**: https://learning.postman.com/docs/running-collections/using-newman-cli/
- **Postman Learning Center**: https://learning.postman.com/
- **API Documentation**: http://localhost:5000/api-docs

## Next Steps

1. ✅ Run local tests: `npm run test:api`
2. ✅ Review HTML report
3. ✅ Explore collection in Postman GUI
4. ✅ Add custom tests for your use cases
5. ✅ Commit changes to git
6. ✅ Push to GitHub and watch CI run tests

---

Last updated: January 28, 2026
