import {
  SlowQueryLogger,
  buildDatabaseTypeOrmOptions,
  getSlowQueryThresholdMs,
} from './database.config';

describe('database.config', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('getSlowQueryThresholdMs', () => {
    it('defaults to 1000ms', () => {
      expect(getSlowQueryThresholdMs({} as NodeJS.ProcessEnv)).toBe(1000);
    });

    it('reads SLOW_QUERY_THRESHOLD_MS from environment', () => {
      expect(getSlowQueryThresholdMs({ SLOW_QUERY_THRESHOLD_MS: '2500' })).toBe(2500);
    });

    it('falls back when value is invalid', () => {
      expect(getSlowQueryThresholdMs({ SLOW_QUERY_THRESHOLD_MS: 'invalid' })).toBe(1000);
    });
  });

  describe('buildDatabaseTypeOrmOptions', () => {
    it('disables verbose logging in production', () => {
      const options = buildDatabaseTypeOrmOptions({
        NODE_ENV: 'production',
        DB_LOGGING: 'true',
      });
      expect(options.logging).toBe(false);
      expect(options.maxQueryExecutionTime).toBe(1000);
      expect(options.logger).toBeInstanceOf(SlowQueryLogger);
    });

    it('enables verbose logging in development when DB_LOGGING=true', () => {
      const options = buildDatabaseTypeOrmOptions({
        NODE_ENV: 'development',
        DB_LOGGING: 'true',
      });
      expect(options.logging).toBe(true);
    });
  });

  describe('SlowQueryLogger', () => {
    it('logs slow queries with duration and query text', () => {
      const logger = new SlowQueryLogger(1000, true);
      const warnSpy = jest.spyOn(logger['logger'], 'warn').mockImplementation();

      logger.logQuerySlow(1500, 'SELECT * FROM users WHERE id = $1', ['uuid']);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Slow query (1500ms): SELECT * FROM users WHERE id = $1'),
      );
      warnSpy.mockRestore();
    });

    it('does not log queries below threshold', () => {
      const logger = new SlowQueryLogger(1000, true);
      const warnSpy = jest.spyOn(logger['logger'], 'warn').mockImplementation();

      logger.logQuerySlow(500, 'SELECT 1');

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
