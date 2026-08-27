module.exports = {
  // ESLint Configuration for Uzima Backend
  // See: https://eslint.org/docs/latest/use/configure/
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
    ecmaVersion: 2021,
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended', // Integrates Prettier with ESLint
  ],
  root: true,
  env: {
    node: true,
    jest: true,
    es2021: true,
  },
  // Files to ignore during linting
  ignorePatterns: [
    '.eslintrc.js',
    'eslint.config.mjs',
    'dist/**',
    'node_modules/**',
    '**/*.js',
    '**/*.d.ts'
  ],
  rules: {
    // TypeScript specific rules
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn', // Warn when 'any' type is used
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_'
    }],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    
    // General ESLint rules
    'no-console': 'warn', // Warn about console.log statements
    'no-debugger': 'error', // Disallow debugger statements
    'prettier/prettier': 'error', // Ensure Prettier rules are enforced
  },
};