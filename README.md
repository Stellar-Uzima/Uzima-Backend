# Stellar Uzima Backend

A robust, scalable NestJS backend for the Stellar Uzima health and wellness platform. This repository contains the core API and services that power the Uzima ecosystem.

## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Development](#development)
- [API Documentation](#api-documentation)
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

### Prerequisites

- Node.js >= 18.x
- npm, yarn, or pnpm
- PostgreSQL 12+

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Stellar-Uzima/Uzima-Backend.git
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Setup environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run database migrations**
   ```bash
   npm run migrate
   ```

5. **Seed the database (optional)**
   ```bash
   npm run seed
   ```

6. **Start the development server**
   ```bash
   npm run start:dev
   ```

The application will be available at `http://localhost:3000`

## 💻 Development

### Available Scripts

```bash
# Development
npm run start          # Start the application
npm run start:dev     # Start with hot reload
npm run start:debug   # Start with debug mode

# Building
npm run build         # Build for production
npm run build:watch  # Build with watch mode

# Testing
npm run test          # Run unit tests
npm run test:watch   # Run tests with watch mode
npm run test:cov     # Run tests with coverage
npm run test:e2e     # Run e2e tests

# Database
npm run migrate       # Run migrations
npm run migrate:revert # Revert last migration
npm run seed         # Seed the database

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

See `.env.example` for all available environment variables:

```env
# App
NODE_ENV=development
PORT=3000
API_PREFIX=api

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_DATABASE=uzima_dev

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRATION=7d

# CORS
CORS_ORIGIN=http://localhost:3000

# Mail (optional)
MAIL_HOST=smtp.example.com
MAIL_PORT=587
MAIL_USER=your-email@example.com
MAIL_PASSWORD=your-password
```

## 📚 API Documentation

API documentation is available via Swagger at:

```
http://localhost:3000/api/docs
```

To regenerate OpenAPI documentation:

```bash
npm run swagger
```

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

## 🐳 Docker

### Build Docker Image

```bash
docker build -t uzima-backend .
```

### Run with Docker Compose

```bash
docker-compose up -d
```

## 📖 Module Guides

Detailed documentation for each module is available in their respective README files:

- [Auth Module](./src/modules/auth/README.md) - Authentication and authorization
- [Users Module](./src/modules/users/README.md) - User management
- [Health Tasks Module](./src/modules/health-tasks/README.md) - Health task tracking
- [Database Module](./src/database/README.md) - Database setup and migrations

## 🤝 Contributing

We welcome contributions! Please read our [CONTRIBUTOR_GUIDE.md](./CONTRIBUTOR_GUIDE.md) for detailed guidelines on:

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
