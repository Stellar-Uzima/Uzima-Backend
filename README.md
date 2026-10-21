# Stellar Uzima Backend

A robust, scalable NestJS backend for the Stellar Uzima health and wellness platform. This repository contains the core API and services that power the Uzima ecosystem.

## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Development](#development)
- [API Documentation](#api-documentation)
- [Operational Runbooks](#operational-runbooks)
- [Contributing](#contributing)
- [License](#license)

## 🎯 Overview

Stellar Uzima is a comprehensive health and wellness platform designed to help users manage their health goals, track progress, and receive personalized recommendations. The backend provides:

- **Authentication & Authorization**: Secure user authentication with JWT tokens
- **User Management**: Complete user profile and account management
- **Health Tasks**: Track and manage health-related tasks and habits
- **Data Persistence**: Robust database operations with TypeORM
- **Error Handling**: Comprehensive error handling and logging
- **API Documentation**: Auto-generated API documentation with Swagger

## 🛠 Tech Stack

- **Runtime**: Node.js (v18+)
- **Framework**: NestJS 10+
- **Language**: TypeScript
- **Database**: PostgreSQL with TypeORM
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: class-validator, class-transformer
- **Testing**: Jest
- **API Documentation**: Swagger/OpenAPI
- **Linting & Formatting**: ESLint, Prettier

## 🎨 Code Quality & Formatting

This project uses **ESLint** for code linting and **Prettier** for automatic code formatting to ensure consistent code style across all contributions.

### Available Scripts

Run these commands to maintain code quality:

```bash
# Run linting and automatically fix issues
npm run lint

# Only check for linting issues without fixing
npm run lint:check

# Run Prettier to format all files
npm run format

# Only check if files are properly formatted
npm run format:check

# Run both linting fixes and formatting
npm run lint:format
```

### Configuration Files

- **`.eslintrc.js`**: ESLint configuration with TypeScript support
- **`.prettierrc`**: Prettier formatting rules
- **`.prettierignore`**: Files to exclude from formatting
- **`eslint.config.mjs`**: Modern ESLint flat configuration

### Pre-commit Checks

Run checks explicitly before submitting changes. The current package.json does
not declare a `prepare` script installing a pre-commit hook; do not rely on an
automatically installed hook.

## 📁 Project Structure

```
backend/
├── src/
│   ├── main.ts                 # Application entry point
│   ├── app.module.ts           # Root module
│   ├── app.controller.ts       # Root controller
│   ├── app.service.ts          # Root service
│   │
│   ├── common/                 # Shared utilities and components
│   │   ├── decorators/         # Custom decorators (auth, roles, etc.)
│   │   ├── filters/            # Exception filters
│   │   ├── guards/             # Authentication & authorization guards
│   │   ├── interceptors/       # Request/response interceptors
│   │   ├── pipes/              # Validation and transformation pipes
│   │   ├── dtos/               # Common DTOs (pagination, responses)
│   │   └── utils/              # Utility functions and helpers
│   │
│   ├── config/                 # Configuration management
│   │   ├── database.config.ts
│   │   ├── app.config.ts
│   │   └── validation.schema.ts
│   │
│   ├── database/               # Database setup and migrations
│   │   ├── migrations/
│   │   ├── seeds/
│   │   └── entities/           # Database entities
│   │
│   ├── modules/                # Feature modules
│   │   ├── auth/               # Authentication module
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── strategies/     # Passport strategies
│   │   │   ├── guards/
│   │   │   └── dtos/
│   │   │
│   │   ├── users/              # User management module
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   ├── entities/
│   │   │   └── dtos/
│   │   │
│   │   └── health-tasks/       # Health tasks module
│   │       ├── health-tasks.module.ts
│   │       ├── health-tasks.controller.ts
│   │       ├── health-tasks.service.ts
│   │       ├── entities/
│   │       └── dtos/
│   │
│   └── shared/                 # Shared services (mail, notifications, etc.)
│       ├── mail/
│       ├── notifications/
│       └── logger/
│
├── test/                       # End-to-end tests
│   └── app.e2e.spec.ts
│
├── package.json
├── tsconfig.json
├── nest-cli.json
├── jest.config.js
├── .env.example
├── .eslintrc.js
├── .prettierrc
├── .gitignore
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## 🚀 Getting Started

Follow [Local development](docs/LOCAL_DEVELOPMENT.md) for prerequisites, a fresh
clone, environment setup, PostgreSQL/Redis startup, migrations and tests. It
includes POSIX and PowerShell test configuration, optional integrations and
current application startup blockers. Use Node 20.x to match CI.

Development uses `APP_PORT` (default `3001`) and `DB_NAME`. E2E tests require
separate explicit `TEST_DB_*` settings and a disposable PostgreSQL server; see
[Isolated E2E databases](docs/e2e-database.md). A passing database-harness test is
not evidence that the complete backend or migration chain is healthy.

## 💻 Development

### Available Scripts

```bash
# Development
npm run start          # Start the application
npm run start:dev     # Start with hot reload
npm run start:debug   # Start with debug mode

# Building
npm run build         # Build for production

# Testing
npm run test          # Run unit tests
npm run test:watch   # Run tests with watch mode
npm run test:cov     # Run tests with coverage
npm run test:e2e     # Run e2e tests

# Database
npm run migrate       # Run migrations
npm run migrate:rollback # Revert last migration
npm run seed         # Seed the database
npm run seed:db      # Run database seeders

# Linting & Formatting
npm run lint         # Run ESLint
npm run lint:fix    # Fix linting errors
npm run format      # Format with Prettier
```

### Code Style

This project uses ESLint and Prettier for code consistency:

- **ESLint**: Enforces code quality rules
- **Prettier**: Handles automatic code formatting

```bash
# Format all files
npm run format

# Check and fix linting issues
npm run lint:fix
```

### Environment Variables

Use the [local configuration guide](docs/LOCAL_DEVELOPMENT.md#2-configure-a-local-environment)
to reconcile `.env.example` with the active consumers. The HTTP server uses
`APP_PORT`, DatabaseModule uses `DB_NAME`, and the E2E harness uses only explicit
`TEST_DB_*` settings. Legacy factories and migration helpers use some different
aliases; do not assume every variable in an example configures the running app.

## 📚 API Documentation

API documentation is available via Swagger at:

```
http://localhost:3001/api/docs
```

Swagger is generated at application startup by `SwaggerModule.createDocument`;
there is no separate `swagger` npm script.

## 🚨 Operational Runbooks
Procedures for responding to incidents and monitoring alerts live in [`docs/runbooks/`](docs/runbooks/README.md):

- [Database Outage](docs/runbooks/database-outage.md)
- [Authentication Issues](docs/runbooks/auth-issues.md)
- [Queue Failures](docs/runbooks/queue-failures.md)
- [Redis Incidents](docs/runbooks/redis-incidents.md)
- [Notification Provider Incidents](docs/runbooks/notification-provider-incidents.md)
- [Stellar Incidents](docs/runbooks/stellar-incidents.md)
- [Reward Regressions](docs/runbooks/reward-regressions.md)

Runbooks are versioned and reviewed as part of the release process — see the
[versioning & review policy](docs/runbooks/README.md#versioning--release-review-policy).

## 🧪 Testing

The project uses Jest for unit and integration testing.

### Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:cov
```

### Writing Tests

Create test files next to the modules with `.spec.ts` suffix:

```typescript
// Example: users.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```
## 🔄 API Versioning

This API uses URI-based versioning. All endpoints are available under `/api/v1/`.

### Current Version

| Version | Status | Base URL |
|---------|--------|----------|
| v1 | Active | `/api/v1/` |

### Examples
GET /api/v1/auth/login
GET /api/v1/users/profile
### Versioning Strategy

When breaking changes are introduced, a new version (e.g., `/api/v2/`) will be added.
Existing versions remain available to allow gradual client migration.

## 🐳 Docker

### Local development with Docker Compose

The [local guide](docs/LOCAL_DEVELOPMENT.md#3-start-development-postgresql-and-redis)
documents starting only PostgreSQL and Redis, host/container addresses, health
checks and non-destructive cleanup. The optional `full` and `tools` profiles
are defined in `docker-compose.yml`. The `full` profile still depends on the
application build; it is not a workaround for the documented baseline failures.

## 📖 Module Guides

Detailed documentation for each module is available in their respective README files:

- [Auth Module](./src/modules/auth/README.md) - Authentication and authorization
- [Users Module](./src/modules/users/README.md) - User management
- [Health Tasks Module](./src/modules/health-tasks/README.md) - Health task tracking
- [Database Module](./src/database/README.md) - Database setup and migrations

## 📦 Dependency updates

This repository uses [Dependabot](https://docs.github.com/en/code-security/dependabot) (see [`.github/dependabot.yml`](./.github/dependabot.yml)):

- **Weekly** pull requests for routine npm dependency updates (non-breaking, reviewed before merge).
- **Daily** monitoring with prioritized PRs for **security patches** (labeled `security`).
- Maintainers should merge security updates promptly; routine updates can follow the normal PR review process.

## 🤝 Contributing

We welcome contributions! Please read our [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines on:

- Setting up your development environment
- Making code changes
- Creating pull requests
- Code review process
- Commit message conventions

## 📝 Commit Convention

We follow conventional commits:

```
feat: Add new feature
fix: Fix a bug
docs: Update documentation
style: Code style changes
refactor: Refactor code
perf: Performance improvements
test: Add or update tests
chore: Maintenance tasks
```

## 🔒 Security

- Never commit `.env` files with sensitive data
- Always use environment variables for secrets
- Validate all user inputs
- Follow OWASP security guidelines
- Report security issues to the maintainers

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues, questions, or suggestions:

1. Check existing [GitHub Issues](https://github.com/Stellar-Uzima/Uzima-Backend/issues)
2. Create a new issue with a clear description
3. Contact the maintainers

## 🚀 Deployment

For production deployment guidelines, see [DEPLOYMENT.md](./DEPLOYMENT.md)

---

**Happy coding! 🎉**