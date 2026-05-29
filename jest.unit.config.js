const base = require('./jest.config.js');

module.exports = {
  ...base,
  setupFilesAfterEnv: ['<rootDir>/../test/jest.env.ts'],
};
