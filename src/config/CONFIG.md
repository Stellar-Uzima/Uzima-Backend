# Environment Configuration Guide

This document describes the environment configuration system for the Uzima Backend.

## Overview

The configuration system provides:
- **Environment-specific settings** for development, staging, and production
- **Joi-based validation** for all environment variables
- **Clean getter functions** for accessing configuration values
- **Caching** for efficient repeated access
- **Clear error messages** when configuration is missing or invalid

## Quick Start

### 1. Set up your environment file

Copy the example environment file:

```bash
cp .env.example .env
```

### 2. Configure required variables

At minimum, set these required variables in your `.env`:

```bash
MONGO_URI=mongodb://localhost:27017/uzima
JWT_SECRET=your-secret-key-at-least-32-characters-long
```

### 3. Start the server

```bash
# Development (default)
npm run dev

# Production
NODE_ENV=production npm start

# Staging
NODE_ENV=staging npm start
```

## Configuration Structure

Access configuration values using the `getConfig()` function:

```javascript
import { getConfig } from './config/index.js';

// Access configuration
const config = getConfig();

console.log(config.server.port);    // 5000
console.log(config.server.env);     // 'development'
console.log(config.db.uri);         // MongoDB URI
console.log(config.jwt.secret);     // JWT secret
console.log(config.redis.url);      // Redis URL
```

### Available Configuration Sections

| Section | Description | Example Access |
|---------|-------------|----------------|
| `server` | Server settings | `getConfig().server.port` |
| `db` | MongoDB settings | `getConfig().db.uri` |
| `jwt` | JWT authentication | `getConfig().jwt.secret` |
| `redis` | Redis settings | `getConfig().redis.url` |
| `email` | Email/SMTP settings | `getConfig().email.from` |
| `aws` | AWS/S3 settings | `getConfig().aws.region` |
| `backup` | Backup settings | `getConfig().backup.retentionDays` |
| `monitoring` | Sentry/monitoring | `getConfig().monitoring.sentryDsn` |
| `swagger` | Swagger settings | `getConfig().swagger.user` |
| `features` | Feature flags | `getConfig().features.enableDetailedErrors` |

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGO_URI` | MongoDB connection URI | `mongodb://localhost:27017/uzima` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `your-super-secret-key-32-chars` |

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment: development, staging, production |
| `PORT` | `5000` | Server port |

### Email (SMTP)

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | - | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | - | SMTP username |
| `SMTP_PASS` | - | SMTP password |
| `MAIL_FROM` | `Uzima Health <noreply@uzima.health>` | Sender address |

### Email (Resend API)

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key (starts with `re_`) |

### Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `REDIS_HOST` | `localhost` | Alternative: Redis host |
| `REDIS_PORT` | `6379` | Alternative: Redis port |

### Email Queue

| Variable | Default | Description |
|----------|---------|-------------|
| `EMAIL_MAX_ATTEMPTS` | `3` | Max retry attempts |
| `EMAIL_BACKOFF_DELAY` | `2000` | Retry delay (ms) |
| `EMAIL_WORKER_CONCURRENCY` | `5` | Worker concurrency |
| `EMAIL_RATE_LIMIT_MAX` | `10` | Rate limit max |
| `EMAIL_RATE_LIMIT_DURATION` | `1000` | Rate limit duration (ms) |

### AWS S3

| Variable | Default | Description |
|----------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | - | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | - | AWS secret key |
| `AWS_REGION` | `us-east-1` | AWS region |
| `S3_BUCKET_NAME` | - | S3 bucket for uploads |
| `S3_BACKUP_BUCKET` | - | S3 bucket for backups |
| `S3_BACKUP_PREFIX` | `mongodb-backups/` | Backup prefix |
| `S3_ENDPOINT` | - | Custom S3 endpoint (Minio) |
| `S3_FORCE_PATH_STYLE` | `false` | Force path style (Minio) |

### Backup

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_RETENTION_DAYS` | `30` | Days to retain backups |
| `BACKUP_ENCRYPTION_KEY` | - | Encryption key (32 chars) |
| `BACKUP_SCHEDULE` | `0 2 * * *` | Cron schedule |
| `BACKUP_STORAGE_LIMIT_GB` | `100` | Storage limit in GB |

### Monitoring

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | Sentry DSN for error tracking |

### Swagger

| Variable | Default | Description |
|----------|---------|-------------|
| `SWAGGER_USER` | `admin` | Swagger UI username |
| `SWAGGER_PASSWORD` | `changeme` | Swagger UI password |
| `SWAGGER_ALLOWED_IPS` | `127.0.0.1` | Comma-separated allowed IPs |

### Other

| Variable | Description |
|----------|-------------|
| `STELLAR_SECRET_KEY` | Stellar blockchain secret key |
| `PRESCRIPTION_SECRET` | Prescription signing secret |
| `STAGING_MONGO_URI` | Staging MongoDB for restore testing |
| `CLAMAV_API_URL` | ClamAV API for virus scanning |

## Environment-Specific Behavior

### Development (`NODE_ENV=development`)

- Detailed error messages enabled
- Stack traces in error responses
- Swagger authentication disabled
- Relaxed validation (some defaults provided)
- Log level: `debug`

### Staging (`NODE_ENV=staging`)

- Mirrors production settings
- Swagger authentication enabled
- Strict validation
- Log level: `info`

### Production (`NODE_ENV=production`)

- Minimal error details (no stack traces)
- Swagger authentication enabled
- Strict validation (no defaults for secrets)
- Higher email worker concurrency
- Longer backup retention (90 days)
- Log level: `warn`

## Helper Functions

```javascript
import { 
  getConfig, 
  initConfig, 
  isDevelopment, 
  isStaging, 
  isProduction 
} from './config/index.js';

// Check environment
if (isDevelopment()) {
  console.log('Running in development mode');
}

if (isProduction()) {
  // Enable production optimizations
}
```

## Validation Errors

If required variables are missing, you'll see a clear error:

```
╔══════════════════════════════════════════════════════════╗
║          ENVIRONMENT CONFIGURATION ERROR                   ║
╠══════════════════════════════════════════════════════════╣
║  Environment: development                                  ║
╠══════════════════════════════════════════════════════════╣
║  The following configuration errors were found:           ║
╚══════════════════════════════════════════════════════════╝

  - "MONGO_URI" is required
  - "JWT_SECRET" length must be at least 32 characters long

📝 Please check your .env file and fix the above errors.

💡 See src/config/CONFIG.md for documentation.
```

## Security Best Practices

1. **Never commit `.env` files** - They're in `.gitignore`
2. **Use strong secrets** - JWT_SECRET must be at least 32 characters
3. **Rotate secrets regularly** - Especially in production
4. **Use environment variables in CI/CD** - Don't hardcode secrets
5. **Review `.env.example`** - Keep it updated without real values

## Adding New Configuration

1. Add the variable to the Joi schema in `src/config/index.js`
2. Add it to the appropriate section in the config object
3. Update `.env.example` with a placeholder
4. Document it in this file
5. Add environment-specific defaults in `dev.js`, `staging.js`, `prod.js`

## Troubleshooting

### Config not loading

Ensure `initConfig()` is called early in your application:

```javascript
import { initConfig } from './config/index.js';
initConfig(); // Call before other imports that need config
```

### Validation errors in tests

Use `resetConfig()` to clear cached config between tests:

```javascript
import { resetConfig } from './config/index.js';

beforeEach(() => {
  resetConfig();
});
```

### Missing optional variables

Optional variables have defaults. Check the environment config files in `src/config/environments/` for defaults.
