# Code Standards & Quality Guidelines

This document outlines the linting, formatting, and code quality standards for the Uzima Backend project.

## Linting with ESLint

ESLint is used to enforce code quality standards and catch common errors before they reach production.

### Key ESLint Rules

| Rule | Severity | Description |
|------|----------|-------------|
| `@typescript-eslint/no-explicit-any` | ⚠️ Warn | Encourages proper TypeScript typing instead of using `any` |
| `@typescript-eslint/no-unused-vars` | ❌ Error | Catches unused variables (ignores variables prefixed with `_`) |
| `@typescript-eslint/no-floating-promises` | ❌ Error | Ensures all async operations are properly awaited |
| `@typescript-eslint/await-thenable` | ❌ Error | Prevents awaiting non-promise values |
| `no-console` | ⚠️ Warn | Encourages using proper logging instead of `console.log` |
| `no-debugger` | ❌ Error | Disallows `debugger` statements in code |
| `prettier/prettier` | ❌ Error | Ensures all code follows Prettier formatting rules |

## Formatting with Prettier

Prettier automatically formats all code to ensure consistent style across the entire codebase.

### Prettier Configuration

```json
{
  "semi": true,           // Always add semicolons
  "singleQuote": true,    // Use single quotes instead of double quotes
  "trailingComma": "es5", // Add trailing commas where valid in ES5
  "printWidth": 100,      // Wrap lines at 100 characters
  "tabWidth": 2,          // Use 2 spaces for indentation
  "useTabs": false,       // Use spaces, not tabs
  "bracketSpacing": true, // Add spaces between brackets in object literals
  "arrowParens": "always",// Always include parentheses around arrow function parameters
  "endOfLine": "lf",      // Use Unix line endings
  "quoteProps": "as-needed", // Quote object properties only when needed
  "bracketSameLine": false // Put > of JSX opening element on its own line
}
```

## Available Scripts

All developers should use these npm scripts to maintain code quality:

```bash
# Lint all files and automatically fix issues
npm run lint

# Only check for linting errors (used in CI)
npm run lint:check

# Fix all linting issues explicitly
npm run lint:fix

# Format all files with Prettier
npm run format

# Check if all files are properly formatted (used in CI)
npm run format:check

# Write formatting to all files explicitly
npm run format:write

# Run both linting fixes and formatting
npm run lint:format
```

## Configuration Files

### `.eslintrc.js`
Legacy ESLint configuration that works with most editors and integrates with TypeScript.

### `eslint.config.mjs`
Modern ESLint flat configuration (new standard) that provides better TypeScript support and type checking.

### `.prettierrc`
Prettier configuration that defines all formatting rules.

### `.prettierignore`
Files and directories that should be excluded from formatting (node_modules, dist, etc.).

## Editor Integration

For the best development experience, install these extensions in your code editor:

### VS Code
- [ESLint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Prettier extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

Enable "Format On Save" in VS Code settings to automatically format files when you save them:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## CI/CD Integration

All pull requests automatically run:
1. `npm run lint:check` - Fails if there are any linting errors
2. `npm run format:check` - Fails if any files are not properly formatted
3. Build verification
4. Unit and E2E tests

This ensures that only code meeting all quality standards can be merged into the main branch.

## Pre-commit Checks

The `prepare` script in package.json runs automatically before commits to catch issues early:
```bash
npm run lint:check && npm run format:check
```

This prevents committing code that doesn't meet our quality standards.