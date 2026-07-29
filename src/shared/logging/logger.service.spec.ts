import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CustomLogger, LogLevel } from './logger.service';
import * as fs from 'fs';

jest.mock('fs');

describe('CustomLogger', () => {
  let logger: CustomLogger;
  let configService: ConfigService;

  const mockConfig = {
    get: jest.fn((key: string, defaultValue: any) => {
      if (key === 'LOG_LEVEL') return LogLevel.INFO;
      if (key === 'LOG_DIR') return 'logs';
      if (key === 'NODE_ENV') return 'test';
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset mockConfig to defaults for each test
    mockConfig.get.mockImplementation((key: string, defaultValue: any) => {
      if (key === 'LOG_LEVEL') return LogLevel.INFO;
      if (key === 'LOG_DIR') return 'logs';
      if (key === 'NODE_ENV') return 'test';
      if (key === 'LOG_MAX_FILE_SIZE') return 10 * 1024 * 1024;
      if (key === 'LOG_MAX_FILES') return 5;
      return defaultValue;
    });

    // Default fs mocks
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.appendFileSync as jest.Mock).mockImplementation(() => {});
    (fs.statSync as jest.Mock).mockReturnValue({ size: 0, mtime: new Date() });
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
    (fs.renameSync as jest.Mock).mockImplementation(() => {});
    (fs.unlinkSync as jest.Mock).mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomLogger,
        {
          provide: ConfigService,
          useValue: mockConfig,
        },
      ],
    }).compile();

    logger = module.get<CustomLogger>(CustomLogger);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(logger).toBeDefined();
  });

  // ── Log directory setup ──────────────────────────────────────────

  describe('log directory setup', () => {
    it('should create log directory if it does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockClear();
      new (CustomLogger as any)(configService);
      expect(fs.mkdirSync).toHaveBeenCalledWith('logs', { recursive: true });
    });

    it('should not create log directory if it already exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.mkdirSync as jest.Mock).mockClear();
      new (CustomLogger as any)(configService);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  // ── Log-level filtering ──────────────────────────────────────────

  describe('log-level filtering', () => {
    it('should log messages with level equal to the configured level', () => {
      const shouldLogSpy = jest.spyOn(logger as any, 'shouldLog');
      logger.log('test');
      expect(shouldLogSpy).toHaveReturnedWith(true);
    });

    it('should not log messages with level lower than configured level', () => {
      const shouldLogSpy = jest.spyOn(logger as any, 'shouldLog');
      logger.debug('test');
      expect(shouldLogSpy).toHaveReturnedWith(false);
    });

    it('should allow ERROR level when configured at WARN', () => {
      mockConfig.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'LOG_LEVEL') return LogLevel.WARN;
        return defaultValue;
      });
      const shouldLog = (logger as any).shouldLog(LogLevel.ERROR);
      expect(shouldLog).toBe(true);
    });

    it('should deny INFO level when configured at ERROR', () => {
      const errorOnlyCfg = {
        get: jest.fn((key: string, defaultValue: any) => {
          if (key === 'LOG_LEVEL') return LogLevel.ERROR;
          if (key === 'LOG_DIR') return 'logs';
          return defaultValue;
        }),
      };
      const errorOnlyLogger = new CustomLogger(errorOnlyCfg as any);
      const shouldLog = (errorOnlyLogger as any).shouldLog(LogLevel.INFO);
      expect(shouldLog).toBe(false);
    });
  });

  // ── Structured output format ─────────────────────────────────────

  describe('structured output format', () => {
    it('should format log entries as valid JSON', () => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: LogLevel.INFO,
        message: 'test message',
      };
      const formatted = (logger as any).formatLogEntry(logEntry);
      expect(() => JSON.parse(formatted)).not.toThrow();
      expect(JSON.parse(formatted)).toEqual({
        timestamp: logEntry.timestamp,
        level: 'INFO',
        message: 'test message',
      });
    });

    it('should include context in formatted output when provided', () => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: LogLevel.INFO,
        message: 'test',
        context: 'MyContext',
      };
      const formatted = JSON.parse((logger as any).formatLogEntry(logEntry));
      expect(formatted.context).toBe('MyContext');
    });

    it('should include metadata in formatted output when provided', () => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: LogLevel.ERROR,
        message: 'test error',
        metadata: { userId: 'user-123', action: 'login' },
      };
      const formatted = JSON.parse((logger as any).formatLogEntry(logEntry));
      expect(formatted.metadata).toEqual({ userId: 'user-123', action: 'login' });
    });

    it('should include trace in formatted output when provided', () => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: LogLevel.ERROR,
        message: 'test error',
        trace: 'Error: something broke\\n    at Object.<anonymous>',
      };
      const formatted = JSON.parse((logger as any).formatLogEntry(logEntry));
      expect(formatted.trace).toBe('Error: something broke\\n    at Object.<anonymous>');
    });

    it('should omit optional fields when not provided', () => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: LogLevel.INFO,
        message: 'plain message',
      };
      const formatted = JSON.parse((logger as any).formatLogEntry(logEntry));
      expect(formatted.context).toBeUndefined();
      expect(formatted.metadata).toBeUndefined();
      expect(formatted.trace).toBeUndefined();
    });
  });

  // ── Logging methods ──────────────────────────────────────────────

  describe('logging methods', () => {
    let writeLogSpy: jest.SpyInstance;

    beforeEach(() => {
      writeLogSpy = jest.spyOn(logger as any, 'writeLog').mockImplementation();
    });

    afterEach(() => {
      writeLogSpy.mockRestore();
    });

    it('should call writeLog for error', () => {
      logger.error('test error');
      expect(writeLogSpy).toHaveBeenCalled();
    });

    it('should call writeLog for warn', () => {
      logger.warn('test warn');
      expect(writeLogSpy).toHaveBeenCalled();
    });

    it('should call writeLog for log (info)', () => {
      logger.log('test log');
      expect(writeLogSpy).toHaveBeenCalled();
    });

    it('should call writeLog for debug when level allows', () => {
      mockConfig.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'LOG_LEVEL') return LogLevel.DEBUG;
        return defaultValue;
      });
      logger.debug('test debug');
      expect(writeLogSpy).toHaveBeenCalled();
    });

    it('should call writeLog for verbose when level allows', () => {
      mockConfig.get.mockImplementation((key: string, defaultValue: any) => {
        if (key === 'LOG_LEVEL') return LogLevel.VERBOSE;
        return defaultValue;
      });
      logger.verbose('test verbose');
      expect(writeLogSpy).toHaveBeenCalled();
    });

    it('should pass trace, context, and metadata to error method', () => {
      const createLogEntrySpy = jest.spyOn(logger as any, 'createLogEntry');
      logger.error('test error', 'stack trace', 'TestContext', { key: 'val' });
      expect(createLogEntrySpy).toHaveBeenCalledWith(
        LogLevel.ERROR,
        'test error',
        'TestContext',
        'stack trace',
        { key: 'val' },
      );
      createLogEntrySpy.mockRestore();
    });
  });

  // ── Log file write failure handling ──────────────────────────────

  describe('log file write failure handling', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should not throw when appendFileSync fails', () => {
      (fs.appendFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Disk full');
      });

      expect(() => logger.log('test message')).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to write to log file:',
        expect.any(Error),
      );
    });

    it('should log to console as fallback when file write fails', () => {
      (fs.appendFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Disk full');
      });

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      logger.log('test fallback');

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });

  // ── Log rotation / cleanup behavior ──────────────────────────────

  describe('log rotation and cleanup', () => {
    function createLoggerWithConfig(overrides: Record<string, any>) {
      const cfg = {
        get: jest.fn((key: string, defaultValue: any) => {
          if (key in overrides) return overrides[key];
          if (key === 'LOG_LEVEL') return LogLevel.INFO;
          if (key === 'LOG_DIR') return 'logs';
          if (key === 'NODE_ENV') return 'production';
          return defaultValue;
        }),
      };
      return new CustomLogger(cfg as any);
    }

    it('should rotate log file when size exceeds maxFileSize', () => {
      const testLogger = createLoggerWithConfig({
        LOG_MAX_FILE_SIZE: 100,
        LOG_MAX_FILES: 3,
      });

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 200, mtime: new Date() });
      (fs.readdirSync as jest.Mock).mockReturnValue([]);

      testLogger.log('trigger rotation');

      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('should delete old log files when count exceeds maxFiles', () => {
      const testLogger = createLoggerWithConfig({
        LOG_MAX_FILE_SIZE: 100,
        LOG_MAX_FILES: 3,
      });

      (fs.existsSync as jest.Mock).mockImplementation(
        (p: fs.PathLike) => !p.toString().endsWith('.log') || true,
      );
      (fs.statSync as jest.Mock).mockReturnValue({ size: 200, mtime: new Date() });
      (fs.readdirSync as jest.Mock).mockReturnValue([
        'app-2026-01-01.log',
        'app-2026-01-02.log',
        'app-2026-01-03.log',
        'app-2026-01-04.log',
        'app-2026-01-05.log',
      ]);

      testLogger.log('trigger cleanup');

      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should not rotate if file is under maxFileSize', () => {
      const testLogger = createLoggerWithConfig({
        LOG_MAX_FILE_SIZE: 100,
        LOG_MAX_FILES: 3,
      });

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 50, mtime: new Date() });

      testLogger.log('no rotation needed');

      expect(fs.renameSync).not.toHaveBeenCalled();
    });

    it('should handle rotation errors gracefully', () => {
      const testLogger = createLoggerWithConfig({
        LOG_MAX_FILE_SIZE: 100,
        LOG_MAX_FILES: 3,
      });

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 200, mtime: new Date() });
      (fs.renameSync as jest.Mock).mockImplementation(() => {
        throw new Error('Rename failed');
      });

      const errorSpy = jest.spyOn(testLogger as any, 'error').mockImplementation();

      testLogger.log('rotation error');

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to rotate log file',
        expect.any(String),
      );
      errorSpy.mockRestore();
    });

    it('should handle cleanup errors gracefully', () => {
      const testLogger = createLoggerWithConfig({
        LOG_MAX_FILE_SIZE: 100,
        LOG_MAX_FILES: 3,
      });

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 200, mtime: new Date() });
      (fs.readdirSync as jest.Mock).mockImplementation(() => {
        throw new Error('Read dir failed');
      });

      const errorSpy = jest.spyOn(testLogger as any, 'error').mockImplementation();

      testLogger.log('cleanup error');

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to cleanup old logs',
        expect.any(String),
      );
      errorSpy.mockRestore();
    });
  });

  // ── Structured metadata logging ──────────────────────────────────

  describe('structured metadata logging', () => {
    let appendFileSpy: jest.SpyInstance;

    beforeEach(() => {
      appendFileSpy = jest.spyOn(fs, 'appendFileSync').mockImplementation();
    });

    afterEach(() => {
      appendFileSpy.mockRestore();
    });

    it('should write metadata as JSON in the log entry', () => {
      logger.log('action performed', 'AuthService', { userId: 'abc-123', ip: '127.0.0.1' });

      // appendFileSync(path, content, encoding) - get the content (2nd arg)
      const writtenContent = (fs.appendFileSync as jest.Mock).mock.calls[0]?.[1] as string;
      expect(writtenContent).toBeDefined();
      const parsed = JSON.parse(writtenContent.trim());
      expect(parsed.metadata).toEqual({ userId: 'abc-123', ip: '127.0.0.1' });
    });

    it('should include userId and requestId in log entry when present', () => {
      const entry = (logger as any).createLogEntry(
        LogLevel.INFO,
        'msg',
        'ctx',
        undefined,
        { userId: 'u1', requestId: 'r1' },
      );
      const formatted = JSON.parse((logger as any).formatLogEntry(entry));
      expect(formatted.metadata.userId).toBe('u1');
      expect(formatted.metadata.requestId).toBe('r1');
    });
  });

  // ── Specialized logging methods ──────────────────────────────────

  describe('specialized logging methods', () => {
    let writeLogSpy: jest.SpyInstance;

    beforeEach(() => {
      writeLogSpy = jest.spyOn(logger as any, 'writeLog').mockImplementation();
    });

    afterEach(() => {
      writeLogSpy.mockRestore();
    });

    it('logUserAction should include userId and action in metadata', () => {
      logger.logUserAction('user-1', 'login', 'AuthService', { ip: '1.2.3.4' });

      expect(writeLogSpy).toHaveBeenCalled();
      const entry = writeLogSpy.mock.calls[0][0];
      expect(entry.metadata.userId).toBe('user-1');
      expect(entry.metadata.action).toBe('login');
      expect(entry.metadata.ip).toBe('1.2.3.4');
      expect(entry.message).toContain('User action: login');
    });

    it('logApiRequest should include method and url in metadata', () => {
      logger.logApiRequest('GET', '/api/users', 'user-1', 'req-123');

      expect(writeLogSpy).toHaveBeenCalled();
      const entry = writeLogSpy.mock.calls[0][0];
      expect(entry.metadata.method).toBe('GET');
      expect(entry.metadata.url).toBe('/api/users');
      expect(entry.metadata.userId).toBe('user-1');
      expect(entry.metadata.requestId).toBe('req-123');
    });

    it('logApiError should include error stack as trace', () => {
      const error = new Error('Not Found');
      logger.logApiError('POST', '/api/data', error, 'user-2', 'req-456');

      expect(writeLogSpy).toHaveBeenCalled();
      const entry = writeLogSpy.mock.calls[0][0];
      expect(entry.trace).toBe(error.stack);
      expect(entry.level).toBe(LogLevel.ERROR);
      expect(entry.metadata.method).toBe('POST');
    });

    it('logSecurityEvent should classify high severity as ERROR', () => {
      logger.logSecurityEvent('Brute force attempt', 'high', 'attacker');

      expect(writeLogSpy).toHaveBeenCalled();
      const entry = writeLogSpy.mock.calls[0][0];
      expect(entry.level).toBe(LogLevel.ERROR);
      expect(entry.metadata.severity).toBe('high');
    });

    it('logSecurityEvent should classify medium severity as WARN', () => {
      logger.logSecurityEvent('Failed login', 'medium', 'user-3');

      expect(writeLogSpy).toHaveBeenCalled();
      const entry = writeLogSpy.mock.calls[0][0];
      expect(entry.level).toBe(LogLevel.WARN);
      expect(entry.metadata.severity).toBe('medium');
    });

    it('logSecurityEvent should classify low severity as INFO', () => {
      logger.logSecurityEvent('Password changed', 'low', 'user-4');

      expect(writeLogSpy).toHaveBeenCalled();
      const entry = writeLogSpy.mock.calls[0][0];
      expect(entry.level).toBe(LogLevel.INFO);
      expect(entry.metadata.severity).toBe('low');
    });

    it('logPerformance should classify slow operations (>5s) as WARN', () => {
      logger.logPerformance('db-query', 6000);

      expect(writeLogSpy).toHaveBeenCalled();
      const entry = writeLogSpy.mock.calls[0][0];
      expect(entry.level).toBe(LogLevel.WARN);
    });

    it('logPerformance should classify moderate operations (2-5s) as INFO', () => {
      logger.logPerformance('api-call', 3000);

      expect(writeLogSpy).toHaveBeenCalled();
      const entry = writeLogSpy.mock.calls[0][0];
      expect(entry.level).toBe(LogLevel.INFO);
    });

    it('logPerformance should classify fast operations (<2s) as DEBUG', () => {
      logger.logPerformance('cache-hit', 150);

      expect(writeLogSpy).toHaveBeenCalled();
      const entry = writeLogSpy.mock.calls[0][0];
      expect(entry.level).toBe(LogLevel.DEBUG);
    });
  });

  // ── Log statistics ───────────────────────────────────────────────

  describe('log statistics', () => {
    it('should return total file count and size', () => {
      (fs.readdirSync as jest.Mock).mockReturnValue(['app-2026-01-01.log', 'app-2026-01-02.log']);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 1024 });

      const stats = logger.getLogStats();
      expect(stats.totalFiles).toBe(2);
      expect(stats.totalSize).toBe(2048);
    });

    it('should handle errors when reading log directory', () => {
      (fs.readdirSync as jest.Mock).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const stats = logger.getLogStats();
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });
});
