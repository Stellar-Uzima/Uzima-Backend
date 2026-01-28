// Environment setup for encryption tests
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';

// Mock performance API for Node.js environment
global.performance = {
  now: () => Date.now(),
};

// Global test utilities
global.generateTestRecord = (overrides = {}) => ({
  patientName: 'Test Patient',
  diagnosis: 'Test diagnosis for encryption',
  treatment: 'Test treatment plan',
  history: 'Test medical history',
  txHash: 'test-tx-hash',
  clientUUID: 'test-client-uuid',
  syncTimestamp: new Date().toISOString(),
  ...overrides,
});

global.generateRandomString = (length = 10) => {
  return Math.random()
    .toString(36)
    .substring(2, length + 2);
};

global.PHI_FIELDS = ['diagnosis', 'treatment', 'history'];
global.NON_PHI_FIELDS = ['patientName', 'txHash', 'clientUUID', 'syncTimestamp'];
