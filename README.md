# Uzima Backend

This is the backend service for Uzima, built with Express and MongoDB.

## Features

- RESTful API for user authentication, records, appointments, and Stellar integration
- Swagger UI documentation at `/docs`
- Cron jobs for scheduled reminders
- **Sentry integration** for real-time error monitoring and performance tracing
- **Rate limiting** with Redis to prevent abuse and brute force attacks
- **Inventory**: real-time stock tracking with FIFO and low-stock alerts
- **Comprehensive Password Policy**: Complexity validation, breach detection, expiry management, and account lockout

## Prerequisites

- Node.js v16 or higher
- npm v8 or higher
- MongoDB database
- Redis server (for rate limiting)
- A Sentry project and DSN (Data Source Name)

## Installation

1. Clone the repo:
   ```bash
   git clone https://github.com/Stellar-Uzima/Uzima-Backend.git
   cd Uzima-Backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

## Environment Variables

Create a `.env` file in the project root (you can copy from `.env.example`) and set:

```dotenv
# Core Configuration
MONGO_URI=<your MongoDB URI>
PORT=5000
JWT_SECRET=<your JWT secret>
NODE_ENV=development

# Email Configuration
SMTP_HOST=<smtp host>`
SMTP_PORT=<smtp port>
SMTP_USER=<smtp user>
SMTP_PASS=<smtp password>
MAIL_FROM="Telemed Support <support@yourdomain.com>"

# Monitoring & Logging
SENTRY_DSN=<your Sentry DSN>
REDIS_URL=redis://localhost:6379

# Password Policy Configuration
PASSWORD_MIN_LENGTH=8
PASSWORD_MAX_LENGTH=64
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBER=true
PASSWORD_REQUIRE_SPECIAL_CHAR=true
PASSWORD_EXPIRY_DAYS=90
PASSWORD_HISTORY_COUNT=5

# Account Security
MAX_LOGIN_ATTEMPTS=5
LOGIN_LOCKOUT_DURATION_MINUTES=15

# Breach Detection (haveibeenpwned API)
HIBP_CHECK_ENABLED=true
HIBP_API_TIMEOUT_MS=5000
HIBP_API_RETRY_COUNT=1

# Password Policy Logging
LOG_PASSWORD_CHANGES=true
LOG_FAILED_LOGIN_ATTEMPTS=true
LOG_ACCOUNT_LOCKOUTS=true
```

## Running the App

Start in development mode (with nodemon):

```bash
npm run dev
```

Start in production mode:

```bash
npm start
```

The API is now available at `http://localhost:<PORT>` and Swagger UI at `http://localhost:<PORT>/docs`.

### Inventory System

REST endpoints (under `/api/inventory`):

- `POST /` create item `{ sku, name, threshold, lots? }`
- `GET /` list items
- `GET /:sku` fetch one item
- `PATCH /:sku` update name/category/unit/threshold/metadata
- `POST /:sku/lots` add stock to lot `{ lotNumber, quantity, expiryDate }`
- `POST /:sku/consume` consume stock FIFO `{ quantity }`

WebSocket events (Socket.IO, connect to the same host):

- `inventory:update` payload `{ type, item, lotsConsumed? }`
- `inventory:lowStock` payload `{ sku, name, totalQuantity, threshold, lots }`

Behavior:

- FIFO consumption prioritizes earliest `expiryDate` lots
- Low-stock alerts emit when `totalQuantity <= threshold`
- All changes are audit-logged in `InventoryAuditLog`

## Password Policy System

Uzima Backend includes enterprise-grade password security with comprehensive policies:

### Features

- **Password Complexity**: Enforces minimum 8 characters with uppercase, lowercase, numbers, and special characters
- **Password History**: Prevents reuse of last 5 passwords
- **Password Expiry**: Passwords expire after 90 days with warnings at 30, 14, and 7 days
- **Breach Detection**: Checks passwords against haveibeenpwned database using k-anonymity for privacy
- **Strength Scoring**: Provides 0-4 password strength scores with actionable feedback
- **Account Lockout**: Locks account after 5 failed login attempts for 15 minutes
- **Force Password Change**: Enforces password update on expiry or admin reset
- **Audit Logging**: All password changes logged for compliance

### API Endpoints

- `POST /api/auth/password/strength` - Check password strength (public)
- `POST /api/auth/password/change` - Change password (authenticated)
- `GET /api/auth/password/status` - Get password status (authenticated)

### Configuration

All password policy settings are configurable via environment variables (see [PASSWORD_POLICY_ENV_CONFIG.md](./PASSWORD_POLICY_ENV_CONFIG.md)):

```
PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_EXPIRY_DAYS, PASSWORD_HISTORY_COUNT,
MAX_LOGIN_ATTEMPTS, LOG_PASSWORD_CHANGES, HIBP_CHECK_ENABLED, etc.
```

For complete documentation, see [PASSWORD_POLICY_README.md](./PASSWORD_POLICY_README.md).

## Sentry Integration

Uzima Backend is configured to report runtime errors and performance traces to Sentry.

### Testing Error Reporting

1. Ensure `SENTRY_DSN` is set in `.env`.
2. Run the app.
3. Open your browser and visit:
   ```
   http://localhost:<PORT>/debug-sentry
   ```
   This will throw a test error.
4. Verify the error appears in your Sentry project under **Issues**.

### Viewing Performance Metrics

Sentry captures performance traces for all incoming requests (sampling rate = 100%).

1. Call any endpoint (e.g., `/api`).
2. In Sentry Dashboard, go to **Performance → Transactions** to inspect traces and response times.

## Rate Limiting

The API implements comprehensive rate limiting to prevent abuse and brute force attacks:

- **General API**: 100 requests per 15 minutes
- **Authentication**: 5 requests per 15 minutes
- **2FA Operations**: 10 requests per 15 minutes
- **File Uploads**: 20 requests per hour
- **Admin Operations**: 200 requests per 15 minutes

Rate limits are enforced per-IP for anonymous users and per-user for authenticated users. When limits are exceeded, the API returns HTTP 429 with retry information.

For detailed information, see [RATE_LIMITING.md](./RATE_LIMITING.md).

### Testing Rate Limits

```bash
# Test rate limiting functionality
node test-rate-limit.js
```

## Security

### Automated Vulnerability Scanning

We use `npm audit` and GitHub Actions to ensure our dependencies are secure.

- **CI Integration**: Every Pull Request to `main` or `develop` triggers a security check that fails if High or Critical vulnerabilities are found.
- **Manual Check**: You can run the security check locally:
  ```bash
  npm run security:check
  ```
- **Automated Fixes**: GitHub Dependabot is configured to automatically create Pull Requests for vulnerable dependencies.

### Remediation Workflow

1. **Detection**:
   - CI pipeline fails on `npm run security:check`.
   - Dependabot alerts or PRs are created.

2. **Resolution**:
   - **For Dependabot PRs**: Review the changelog and compatibility, then merge if tests pass.
   - **Manual Fixes**:
     Run `npm audit fix` to automatically fix compatible vulnerabilities.
     ```bash
     npm audit fix
     ```
     For breaking changes, run `npm audit fix --force` with caution or manually upgrade the package in `package.json`.

3. **Verification**:
   - Run `npm run security:check` to confirm no high/critical vulnerabilities remain.
   - Push changes to trigger the CI pipeline.

## Monitoring and Alerts

- Configure alerts and dashboards in Sentry for proactive notifications.
- Monitor rate limit violations in Redis and application logs.

## License

ISC
