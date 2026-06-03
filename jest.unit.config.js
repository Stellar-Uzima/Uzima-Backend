/** Unit tests only — no PostgreSQL global setup */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testMatch: [
    '<rootDir>/modules/users/services/activity-feed.service.spec.ts',
    '<rootDir>/leaderboard/leaderboard.service.spec.ts',
    '<rootDir>/users/health-profile/health-profile.service.spec.ts',
    '<rootDir>/tasks/assignment/bulk-task-assignment.service.spec.ts',
    '<rootDir>/modules/admin/admin-tasks.controller.spec.ts',
    '<rootDir>/shared/queue/queue.service.spec.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  testTimeout: 30000,
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
      diagnostics: false,
      isolatedModules: true,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
    '^@common/(.*)$': '<rootDir>/common/$1',
  },
};
