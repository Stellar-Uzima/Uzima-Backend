# Contributor Guide - Stellar Uzima Backend

Thank you for your interest in contributing to the Stellar Uzima Backend! This guide will help you get started with the development process.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Before You Start](#before-you-start)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Review Process](#review-process)
- [Common Tasks](#common-tasks)

## 📜 Code of Conduct

We are committed to providing a welcoming and inclusive environment. All contributors must:

- Be respectful and considerate
- Provide constructive feedback
- Focus on the code, not the person
- Help each other learn and grow

Instances of unacceptable behavior can be reported to the maintainers.

## 🎯 Before You Start

### Find an Issue to Work On

1. Check the [Issues](https://github.com/Stellar-Uzima/Uzima-Backend/issues) page
2. Look for issues labeled with:
   - `good first issue` - Great for beginners
   - `help wanted` - Open for contributions
   - `enhancement` - New feature requests
   - `bug` - Bug fixes

3. Comment on the issue to let others know you're working on it
4. Ask questions if the requirements are unclear

### Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/Uzima-Backend.git
cd backend

# Add upstream remote to stay updated
git remote add upstream https://github.com/Stellar-Uzima/Uzima-Backend.git
```

## 🔧 Development Setup

### 1. Install Dependencies

```bash
# Using npm
npm install

# Using yarn
yarn install

# Using pnpm
pnpm install
```

### 2. Setup Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your local configuration
# For local development, defaults usually work fine
```

### 3. Setup Database

```bash
# Create database (adjust for your PostgreSQL setup)
createdb uzima_dev

# Run migrations
npm run migrate

# (Optional) Seed with test data
npm run seed
```

### 4. Verify Setup

```bash
# Start the development server
npm run start:dev

# Should see: "Listening on port 3000"
# Visit: http://localhost:3000
```

## 📝 Making Changes

### Create a Feature Branch

```bash
# Update main branch
git fetch upstream
git checkout main
git merge upstream/main

# Create feature branch
git checkout -b feature/your-feature-name
# or for bug fixes
git checkout -b fix/bug-description
```

### Branch Naming Convention

- `feature/short-description` - New features
- `fix/short-description` - Bug fixes
- `docs/short-description` - Documentation updates
- `refactor/short-description` - Code refactoring
- `perf/short-description` - Performance improvements

### Commit Guidelines

Use conventional commits for clear commit history:

```bash
# Examples of good commits:
git commit -m "feat: add user profile endpoint"
git commit -m "fix: resolve auth token expiration issue"
git commit -m "docs: update database setup instructions"
git commit -m "refactor: simplify user validation logic"
git commit -m "test: add tests for auth service"
```

**Commit Format:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Code style (formatting, semicolons, etc.)
- `refactor` - Code refactoring
- `perf` - Performance improvement
- `test` - Adding or updating tests
- `chore` - Maintenance tasks
- `ci` - CI/CD configuration

**Examples:**
```
feat(auth): add JWT refresh token logic

Added support for refresh tokens to extend user sessions
without requiring re-authentication.

Closes #123
```

## 📚 Coding Standards

### TypeScript

1. **Use strict mode** - Enable `strict: true` in tsconfig
2. **Type everything** - Avoid `any` type
3. **Use interfaces** - Define clear data structures
4. **Avoid mutable patterns** - Use readonly and const

```typescript
// ✅ Good
interface User {
  id: string;
  email: string;
  createdAt: Date;
}

// ❌ Avoid
const user: any = {};
```

### NestJS Patterns

1. **Module Organization**
   ```typescript
   @Module({
     imports: [TypeOrmModule.forFeature([User])],
     controllers: [UsersController],
     providers: [UsersService],
   })
   export class UsersModule {}
   ```

2. **Service Injection**
   ```typescript
   @Injectable()
   export class UsersService {
     constructor(
       @InjectRepository(User)
       private usersRepository: Repository<User>,
     ) {}
   }
   ```

3. **Controller Endpoints**
   ```typescript
   @Controller('users')
   export class UsersController {
     constructor(private usersService: UsersService) {}

     @Get(':id')
     findOne(@Param('id') id: string) {
       return this.usersService.findOne(id);
     }
   }
   ```

### Code Style Rules

```bash
# Check code style
npm run lint

# Fix style issues automatically
npm run lint:fix

# Format code
npm run format
```

**Key Rules:**
- Use 2-space indentation
- Max line length: 100 characters
- Use camelCase for variables/functions
- Use PascalCase for classes/interfaces
- Use UPPER_SNAKE_CASE for constants
- Always use semicolons
- No unused variables

### File Naming Convention

```
users.module.ts          # Modules
users.controller.ts      # Controllers
users.service.ts         # Services
user.entity.ts           # Entities
user.interface.ts        # Interfaces
create-user.dto.ts       # DTOs
users.service.spec.ts    # Tests
```

## 🧪 Testing

### Writing Tests

1. **Create test file** next to the implementation
   ```typescript
   // users.service.spec.ts
   import { Test, TestingModule } from '@nestjs/testing';
   import { UsersService } from './users.service';
   import { getRepositoryToken } from '@nestjs/typeorm';
   import { User } from './entities/user.entity';

   describe('UsersService', () => {
     let service: UsersService;
     let repository: any;

     beforeEach(async () => {
       const module: TestingModule = await Test.createTestingModule({
         providers: [
           UsersService,
           {
             provide: getRepositoryToken(User),
             useValue: {
               find: jest.fn(),
               findOne: jest.fn(),
               save: jest.fn(),
             },
           },
         ],
       }).compile();

       service = module.get<UsersService>(UsersService);
       repository = module.get(getRepositoryToken(User));
     });

     describe('findOne', () => {
       it('should return a user', async () => {
         const user = { id: '1', email: 'test@example.com' };
         repository.findOne.mockResolvedValue(user);

         const result = await service.findOne('1');

         expect(result).toEqual(user);
       });
     });
   });
   ```

2. **Run tests**
   ```bash
   npm run test              # Run all tests
   npm run test:watch      # Watch mode
   npm run test:cov        # With coverage
   ```

3. **Coverage targets**
   - Statements: 80%+
   - Branches: 75%+
   - Functions: 80%+
   - Lines: 80%+

### Testing Best Practices

- ✅ Test one thing per test
- ✅ Use descriptive test names
- ✅ Mock external dependencies
- ✅ Test both success and error cases
- ✅ Use `beforeEach` for setup
- ❌ Don't test implementation details
- ❌ Don't skip tests with `.skip`
- ❌ Don't use hardcoded values

## 📤 Submitting Changes

### Push Your Changes

```bash
# Make sure you're up to date
git fetch upstream
git rebase upstream/main

# Push to your fork
git push origin feature/your-feature-name
```

### Create a Pull Request

1. Go to the original repository
2. Click "New Pull Request"
3. Select your branch
4. Fill in the PR template with:
   - Clear description of changes
   - Link to related issues (#123)
   - Testing instructions
   - Screenshots (if UI changes)

**PR Title Format:**
```
feat: add user profile endpoint
fix: resolve auth token expiration
docs: update database setup
```

### PR Checklist

Before submitting, ensure:

- [ ] Code follows style guidelines (`npm run format`)
- [ ] Tests pass (`npm run test`)
- [ ] Tests are added for new features
- [ ] No console.log statements left
- [ ] No commented-out code
- [ ] Documentation is updated
- [ ] Commit messages follow convention
- [ ] No breaking changes (or documented)

## 🔍 Review Process

### What to Expect

1. **Automated Checks**
   - ESLint runs automatically
   - Tests must pass
   - Code coverage is checked

2. **Maintainer Review**
   - Code quality assessment
   - Architecture alignment
   - Testing completeness
   - Documentation clarity

3. **Feedback**
   - Changes may be requested
   - Be open to suggestions
   - Ask for clarification if needed

4. **Approval & Merge**
   - At least one approval required
   - All checks must pass
   - Maintainer merges to main

### Common Feedback

**"Please add tests"**
- Every feature needs tests
- Test both success and error cases

**"Simplify this logic"**
- Break into smaller functions
- Use clearer variable names
- Remove unnecessary complexity

**"Update the documentation"**
- Add JSDoc comments
- Update README if needed
- Add type definitions

## 🛠 Common Tasks

### Adding a New Module

```typescript
// 1. Create directory
// src/modules/feature-name/

// 2. Create module file
@Module({
  imports: [TypeOrmModule.forFeature([FeatureEntity])],
  controllers: [FeatureController],
  providers: [FeatureService],
})
export class FeatureModule {}

// 3. Create controller
@Controller('features')
export class FeatureController {
  constructor(private featureService: FeatureService) {}

  @Get()
  findAll() {
    return this.featureService.findAll();
  }
}

// 4. Create service
@Injectable()
export class FeatureService {
  constructor(
    @InjectRepository(FeatureEntity)
    private repository: Repository<FeatureEntity>,
  ) {}

  findAll() {
    return this.repository.find();
  }
}

// 5. Import in app.module.ts
@Module({
  imports: [FeatureModule],
})
export class AppModule {}
```

### Adding an Endpoint

```typescript
// In controller
@Post()
create(@Body() createFeatureDto: CreateFeatureDto) {
  return this.featureService.create(createFeatureDto);
}

// Create DTO
export class CreateFeatureDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
```

### Creating a Database Migration

```bash
# Generate migration
npm run migrate:generate -- -n feature_name

# Run migrations
npm run migrate

# Revert if needed
npm run migrate:revert
```

### Fixing Linting Errors

```bash
# See all errors
npm run lint

# Auto-fix common issues
npm run lint:fix

# Format all files
npm run format
```

## 🎓 Learning Resources

- [NestJS Documentation](https://docs.nestjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TypeORM Documentation](https://typeorm.io/)
- [Jest Testing Guide](https://jestjs.io/docs/getting-started)

## ❓ Questions?

- Check existing GitHub discussions
- Ask in pull request comments
- Contact maintainers

## 🙏 Thank You

Your contributions help make Stellar Uzima better for everyone!

---

**Happy contributing! 🚀**
