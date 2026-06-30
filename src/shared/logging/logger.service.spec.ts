
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CustomLogger, LogLevel } from './logger.service';
import * as fs from 'fs';

jest.mock('fs');

describe('CustomLogger', () => {
  let logger: CustomLogger;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomLogger,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: any) => {
              if (key === 'LOG_LEVEL') return LogLevel.INFO;
              if (key === 'LOG_DIR') return 'logs';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    logger = module.get<CustomLogger>(CustomLogger);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(logger).toBeDefined();
  });

  describe('log-level filtering', () => {
    it('should log messages with level equal to or higher than the configured level', () => {
      const shouldLogSpy = jest.spyOn(logger as any, 'shouldLog');
      logger.log('test');
      expect(shouldLogSpy).toHaveReturnedWith(true);
    });

    it('should not log messages with level lower than the configured level', () => {
      const shouldLogSpy = jest.spyOn(logger as any, 'shouldLog');
      logger.debug('test');
      expect(shouldLogSpy).toHaveReturnedWith(false);
    });
  });

  describe('structured output format', () => {
    it('should format log entries as JSON', () => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: LogLevel.INFO,
        message: 'test message',
      };
      const formatted = (logger as any).formatLogEntry(logEntry);
      expect(JSON.parse(formatted)).toEqual({
        timestamp: logEntry.timestamp,
        level: 'INFO',
        message: 'test message',
      });
    });
  });

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

    it('should call writeLog for log', () => {
      logger.log('test log');
      expect(writeLogSpy).toHaveBeenCalled();
    });

    it('should call writeLog for debug', () => {
      (configService.get as jest.Mock).mockReturnValueOnce(LogLevel.DEBUG);
      logger.debug('test debug');
      expect(writeLogSpy).toHaveBeenCalled();
    });

    it('should call writeLog for verbose', () => {
      (configService.get as jest.Mock).mockReturnValueOnce(LogLevel.VERBOSE);
      logger.verbose('test verbose');
      expect(writeLogSpy).toHaveBeenCalled();
    });
  });
});