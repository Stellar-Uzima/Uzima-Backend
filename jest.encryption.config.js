export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.js$': ['babel-jest', { configFile: './babel.config.json' }],
  },
  setupFilesAfterEnv: ['./src/__tests__/setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(i18next|i18next-http-middleware|i18next-fs-backend)/)',
  ],
  testMatch: ['**/__tests__/**/*encryption*.test.js', '**/__tests__/**/encryption*.test.js'],
  collectCoverageFrom: [
    'src/utils/crypto.util.js',
    'src/middleware/encryptPayload.js',
    'src/middleware/decryptPayload.ts',
    'ml-assistant-frontend/src/encryptionUtils.js',
  ],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  setupFiles: ['<rootDir>/src/__tests__/encryption-setup.js'],
};
