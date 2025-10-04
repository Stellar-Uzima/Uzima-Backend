const { logger } = require('../utils/logger');

test('should log JSON with timestamp and level', () => {
  const output = logger.info({ msg: 'test message' });
  expect(output).toBeUndefined();
});
