# Uzima Backend

This is the backend service for Uzima, built with Express and MongoDB.

## Features
- RESTful API for user authentication, records, appointments, and Stellar integration
- Swagger UI documentation at `/docs`
- Cron jobs for scheduled reminders
- **Sentry integration** for real-time error monitoring and performance tracing
- **Rate limiting** with Redis to prevent abuse and brute force attacks
- **Inventory**: real-time stock tracking with FIFO and low-stock alerts

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
MONGO_URI=<your MongoDB URI>
PORT=5000
JWT_SECRET=<your JWT secret>
SMTP_HOST=<smtp host>
SMTP_PORT=<smtp port>
SMTP_USER=<smtp user>
SMTP_PASS=<smtp password>
MAIL_FROM="Telemed Support <support@yourdomain.com>"
SENTRY_DSN=<your Sentry DSN>
REDIS_URL=redis://localhost:6379
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
