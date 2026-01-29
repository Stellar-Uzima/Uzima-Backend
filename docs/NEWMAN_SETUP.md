# Newman CLI Setup & Configuration

Complete guide for installing and configuring Newman for automated API testing.

## Installation

### Via npm (Recommended)

```bash
# Install locally as dev dependency (already in package.json)
npm install

# Verify installation
newman --version
# Output: newman/6.1.0
```

### Global Installation (Optional)

```bash
# Install globally to use from any directory
npm install -g newman newman-reporter-html

# Verify global installation
which newman
newman --version
```

## Basic Usage

### Run Collection Against Environment

```bash
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json
```

### Generate HTML Report

```bash
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  -r html \
  --reporter-html-export test-results/api-test-results.html
```

### Generate JSON Report

```bash
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  -r json \
  --reporter-json-export test-results/api-test-results.json
```

### Generate Both HTML and JSON

```bash
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  -r html,json \
  --reporter-html-export test-results/results.html \
  --reporter-json-export test-results/results.json
```

## Configuration Options

### Common Options

| Option | Usage | Default |
|--------|-------|---------|
| `-e, --environment` | Environment file path | None (required) |
| `-r, --reporters` | Report format (html, json, cli) | cli |
| `--reporter-html-export` | HTML output path | None |
| `--reporter-json-export` | JSON output path | None |
| `--timeout-request` | Request timeout (ms) | 5000 |
| `--timeout-script` | Script timeout (ms) | 5000 |
| `--timeout` | Global timeout (ms) | 0 (unlimited) |
| `--bail` | Stop on first failure | false |
| `--iteration-count` | Repeat collection N times | 1 |
| `--delay-request` | Delay between requests (ms) | 0 |
| `--suppress-exit-code` | Always exit with 0 | false |

### Example Configurations

**Production - Safe Mode** (slow, strict):
```bash
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Production.postman_environment.json \
  -r html \
  --reporter-html-export test-results/prod-results.html \
  --timeout-request 10000 \
  --bail \
  --suppress-exit-code false
```

**Development - Fast Mode** (quick iteration):
```bash
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  -r cli \
  --delay-request 0 \
  --timeout-request 5000
```

**CI/CD - Verbose Mode** (debugging):
```bash
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  -r html,json \
  --reporter-html-export test-results/results.html \
  --reporter-json-export test-results/results.json \
  --verbose \
  --bail
```

## Configuration Files

### newman.json (Optional)

Create `newman-config/default.json` for reusable configuration:

```json
{
  "collection": "postman/Uzima-API.postman_collection.json",
  "environment": "postman/environments/Development.postman_environment.json",
  "reporters": ["html", "json", "cli"],
  "reporter": {
    "html": {
      "export": "test-results/api-test-results.html",
      "template": "default",
      "showTimestamps": true,
      "showEnvironment": true,
      "showFolders": true
    },
    "json": {
      "export": "test-results/api-test-results.json"
    }
  },
  "timeoutRequest": 5000,
  "timeoutScript": 5000,
  "bail": true,
  "insecure": false,
  "stopOnError": true
}
```

Then run with:
```bash
newman run newman-config/default.json
```

## npm Scripts

Available test scripts in `package.json`:

```bash
# Run development tests (default)
npm run test:api

# Run development tests only
npm run test:api:dev

# Run staging tests (if staging environment exists)
npm run test:api:staging

# Run production smoke tests (read-only, safe)
npm run test:api:prod

# Run all environment tests sequentially
npm run test:api:all

# Pre-test setup (seed data, create tokens)
npm run pretest:api

# Post-test parsing (optional, exit code handling)
npm run posttest:api
```

### Script Details

**npm run test:api** = npm run pretest:api + newman (dev)
```bash
npm run pretest:api && \
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  -r html,json \
  --reporter-html-export test-results/api-test-results.html \
  --bail
```

**npm run test:api:dev**:
```bash
npm run pretest:api && \
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  -r html,json \
  --reporter-html-export test-results/api-test-results-dev.html \
  --bail
```

**npm run pretest:api**:
Runs `scripts/api-test-setup.js` which:
- Connects to MongoDB
- Creates/authenticates test users
- Captures JWT tokens
- Creates test data (records, prescriptions, inventory)
- Updates environment files with tokens and IDs

## Advanced Usage

### Run Specific Folder

```bash
# Run only Authentication tests
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  --folder "Authentication"

# Run only Medical Records tests
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  --folder "Medical Records"
```

### Run Multiple Iterations

```bash
# Run collection 3 times (for stress testing)
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  --iteration-count 3 \
  -r html \
  --reporter-html-export test-results/stress-test.html
```

### Provide Environment Variables Override

```bash
# Override baseUrl for testing
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  --env-var baseUrl=http://localhost:3000 \
  -r cli
```

### Disable SSL Verification (Dev Only)

```bash
# For self-signed certificates in dev/staging
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  --insecure
```

### Save Collection Run Results to Database

```bash
# Capture results for analysis
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  -r json \
  --reporter-json-export test-results/run-$(date +%s).json
```

## Reporters

### HTML Reporter

**Features**:
- Beautiful, interactive dashboard
- Request/response details
- Test script visibility
- Timeline view
- Folder-based organization

**Options**:
```json
{
  "html": {
    "export": "path/to/export.html",
    "template": "default",
    "showTimestamps": true,
    "showEnvironment": true,
    "showFolders": true,
    "showStats": true
  }
}
```

**Example**:
```bash
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  -r html \
  --reporter-html-export test-results/report.html
```

Output: `test-results/report.html` - Open in browser

### JSON Reporter

**Features**:
- Machine-readable format
- Complete execution data
- Programmatic analysis possible
- Small file size

**Structure**:
```json
{
  "collection": {...},
  "environment": {...},
  "run": {
    "stats": {...},
    "timings": {...},
    "executions": [...]
  }
}
```

### CLI Reporter

**Features**:
- Terminal output
- Real-time feedback
- No file generation
- Good for development

**Output**:
```
┌─────────────────────────────────┬──────────┬──────────┐
│                         │ executed │   failed │
├─────────────────────────────────┼──────────┼──────────┤
│ ↳ Authentication        │       12 │        0 │
│ ↳ User Management       │        8 │        0 │
│ ↳ Medical Records       │       10 │        0 │
│ ↳ Prescriptions         │        8 │        0 │
│ ↳ Payments              │        6 │        0 │
└─────────────────────────────────┴──────────┴──────────┘
```

## Environment Variable Management

### Setting Variables

**In Postman environment file**:
```json
{
  "values": [
    {
      "key": "baseUrl",
      "value": "http://localhost:5000",
      "enabled": true
    },
    {
      "key": "adminToken",
      "value": "eyJhbGciOiJIUzI1NiIs...",
      "enabled": true
    }
  ]
}
```

**Via CLI override**:
```bash
newman run ... \
  --env-var baseUrl=http://localhost:3000 \
  --env-var adminToken=your-token-here
```

**Via setup script** (recommended):
- `scripts/api-test-setup.js` automatically updates environment files
- Runs as `npm run pretest:api`

### Using Variables in Requests

**In URL**:
```
{{baseUrl}}/api/auth/login
```

**In Headers**:
```
Authorization: Bearer {{adminToken}}
```

**In Body**:
```json
{
  "patientId": "{{testUserId}}"
}
```

**In Tests**:
```javascript
pm.environment.set("newVariable", "value");
const token = pm.environment.get("adminToken");
```

## Exit Codes

Newman returns different exit codes:

| Code | Meaning |
|------|---------|
| 0 | All tests passed |
| 1 | Tests failed or error occurred |
| 2 | Aborted by user (Ctrl+C) |

**Use in CI/CD**:
```bash
npm run test:api
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Tests passed"
else
  echo "❌ Tests failed with code $EXIT_CODE"
  exit 1
fi
```

## Troubleshooting

### "Cannot find module 'newman'"
```bash
# Install missing dependency
npm install newman newman-reporter-html --save-dev
```

### "ECONNREFUSED: Connection refused"
```
Error: connect ECONNREFUSED 127.0.0.1:5000

Fix:
1. Ensure API server is running: npm run dev
2. Check if port 5000 is correct
3. Check firewall/network issues
```

### "Timeout waiting for response"
```
Error: Request timed out

Fix:
1. Increase timeout: --timeout-request 10000
2. Check network latency
3. Verify server performance
```

### "Invalid environment file"
```
Error: Could not parse environment

Fix:
1. Validate JSON syntax
2. Check file path is correct
3. Verify file has proper structure
```

### "Authentication failed"
```
Error: Token invalid or expired

Fix:
1. Run setup script: npm run pretest:api
2. Check environment variables
3. Verify JWT_SECRET matches server
```

## Performance Tips

### Optimize Execution Speed

```bash
# Parallel execution of independent requests
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  --delay-request 0 \
  --timeout-request 5000
```

### Handle Rate Limits

```bash
# Add delay between requests
newman run postman/Uzima-API.postman_collection.json \
  -e postman/environments/Development.postman_environment.json \
  --delay-request 500  # 500ms between requests
```

### Monitor Resource Usage

```bash
# Watch CPU/Memory during test run
watch -n 0.1 'ps aux | grep newman'

# Run on specific CPU cores
taskset -c 0-3 newman run ...
```

## Integration Examples

### GitHub Actions

```yaml
- name: Run API tests
  run: npm run test:api
  env:
    NODE_ENV: test
    MONGO_URI: mongodb://localhost:27017/test
    JWT_SECRET: test-secret
```

### Docker

```dockerfile
FROM node:16-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY postman/ ./postman/
COPY scripts/ ./scripts/

CMD ["npm", "run", "test:api"]
```

### Jenkins

```groovy
stage('API Tests') {
  steps {
    sh 'npm install'
    sh 'npm run pretest:api'
    sh 'npm run test:api'
  }
  post {
    always {
      publishHTML([
        reportDir: 'test-results',
        reportFiles: 'api-test-results.html',
        reportName: 'API Test Report'
      ])
    }
  }
}
```

## Best Practices

1. **Always include environment** - Never run without `-e` flag
2. **Use meaningful names** - Name collections and requests clearly
3. **Validate responses** - Always check both status and content
4. **Handle errors gracefully** - Use `--bail` for CI but not local dev
5. **Version control** - Commit collection and environment files
6. **Document assumptions** - Comment complex test logic
7. **Monitor performance** - Track test execution times
8. **Secure secrets** - Never commit real credentials to git

## References

- **Newman Docs**: https://learning.postman.com/docs/running-collections/using-newman-cli/
- **Reporter Docs**: https://learning.postman.com/docs/running-collections/using-newman-cli/reporting-with-newman/
- **Environment Docs**: https://learning.postman.com/docs/sending-requests/managing-environments/

---

Last updated: January 28, 2026
