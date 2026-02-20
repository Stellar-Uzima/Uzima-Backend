/** @type {import('jest').Config} */
export default {
  transform: {
    '^.+\\.js$': [
      'babel-jest',
      {
        configFile: './babel.config.json',
      },
    ],
  },
  testEnvironment: 'node',
  transformIgnorePatterns: [
    'node_modules/(?!(i18next|i18next-http-middleware|i18next-fs-backend|papaparse)/)',
  ],
  testMatch: ['**/src/__tests__/csvImport.unit.test.js'],
};
