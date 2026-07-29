import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

// Mock the UsersService module before importing cleanup scheduler
const mockCleanupOldStatusLogs = jest.fn().mockResolvedValue(0);
jest.mock('../../modules/users/users.service', () => ({
  UsersService: jest.fn().mockImplementation(() => ({
    cleanupOldStatusLogs: mockCleanupOldStatusLogs,
  })),
}));

import { CleanupScheduler } from './cleanup.scheduler';
import { UsersService } from '../../modules/users/users.service';

describe('CleanupScheduler', () => {
  let scheduler: CleanupScheduler;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockCleanupOldStatusLogs.mockReset();
    mockCleanupOldStatusLogs.mockResolvedValue(0);

    mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CleanupScheduler,
        {
          provide: UsersService,
          useValue: { cleanupOldStatusLogs: mockCleanupOldStatusLogs },
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    scheduler = module.get<CleanupScheduler>(CleanupScheduler);
  });

  describe('handleStatusLogsCleanup', () => {
    it('should use the default retention period (90 days) when no env var is set', async () => {
      mockConfigService.get.mockReturnValueOnce(90);

      await scheduler.handleStatusLogsCleanup();

      expect(mockConfigService.get).toHaveBeenCalledWith(
        'STATUS_LOG_RETENTION_DAYS',
        90,
      );
      expect(mockCleanupOldStatusLogs).toHaveBeenCalledWith(90);
    });

    it('should use the configured retention period from env var', async () => {
      mockConfigService.get.mockReturnValueOnce(30);

      await scheduler.handleStatusLogsCleanup();

      expect(mockConfigService.get).toHaveBeenCalledWith(
        'STATUS_LOG_RETENTION_DAYS',
        90,
      );
      expect(mockCleanupOldStatusLogs).toHaveBeenCalledWith(30);
    });

    it('should coerce the retention value to a number', async () => {
      mockConfigService.get.mockReturnValueOnce('60');

      await scheduler.handleStatusLogsCleanup();

      expect(mockCleanupOldStatusLogs).toHaveBeenCalledWith(60);
    });

    it('should log the number of deleted records on success', async () => {
      mockConfigService.get.mockReturnValueOnce(90);
      mockCleanupOldStatusLogs.mockResolvedValueOnce(42);
      const logSpy = jest.spyOn(scheduler['logger'], 'log');

      await scheduler.handleStatusLogsCleanup();

      expect(logSpy).toHaveBeenCalledWith(
        'Cleanup job completed successfully. Deleted 42 old records.',
      );
    });

    it('should log and swallow errors from the users service', async () => {
      mockConfigService.get.mockReturnValueOnce(90);
      mockCleanupOldStatusLogs.mockRejectedValueOnce(
        new Error('DB connection lost'),
      );
      const errorSpy = jest.spyOn(scheduler['logger'], 'error');

      // Should not throw
      await scheduler.handleStatusLogsCleanup();

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to cleanup user status logs: DB connection lost',
      );
    });

    it('should handle non-Error rejections gracefully', async () => {
      mockConfigService.get.mockReturnValueOnce(90);
      mockCleanupOldStatusLogs.mockRejectedValueOnce('string rejection');
      const errorSpy = jest.spyOn(scheduler['logger'], 'error');

      await scheduler.handleStatusLogsCleanup();

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to cleanup user status logs: string rejection',
      );
    });

    it('should use the default of 90 when config returns the ConfigService default', async () => {
      // When the config key isn't set, ConfigService.get() returns the
      // supplied default value (90). The scheduler then passes this to cleanup.
      mockConfigService.get.mockReturnValueOnce(90);

      await scheduler.handleStatusLogsCleanup();

      expect(mockCleanupOldStatusLogs).toHaveBeenCalledWith(90);
    });
  });
});
