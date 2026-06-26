import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataExportService } from './data-export.service';
import { User } from '../../../entities/user.entity';
import { TaskCompletion } from '../../../database/entities/task-completion.entity';
import { RewardTransaction } from '../../../rewards/entities/reward-transaction.entity';
import { Notification } from '../../../notifications/entities/notification.entity';
import { ReferralRecord } from '../../../referral/entities/referral-record.entity';
import { StorageService } from '../../../shared/storage/storage.service';
import { NotificationService } from '../../../notifications/services/notification.service';
import { QueueService } from '../../../shared/queue/queue.service';
import {
  DATA_PROCESSING_QUEUE,
  USER_DATA_EXPORT_JOB,
} from '../../../queue/queue.constants';

describe('DataExportService', () => {
  let service: DataExportService;

  const mockUserRepo = { findOne: jest.fn() };
  const mockCompletionRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockRewardRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockNotificationRepo = { find: jest.fn().mockResolvedValue([]) };
  const mockReferralRepo = { find: jest.fn().mockResolvedValue([]) };

  const mockStorageService = {
    saveDataExport: jest.fn(),
    buildDataExportDownloadUrl: jest.fn().mockReturnValue('http://localhost/download'),
    resolveDataExportDownload: jest.fn(),
  };

  const mockNotificationService = {
    sendEmail: jest.fn().mockResolvedValue(true),
  };

  const mockQueueService = {
    addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataExportService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        {
          provide: getRepositoryToken(TaskCompletion),
          useValue: mockCompletionRepo,
        },
        {
          provide: getRepositoryToken(RewardTransaction),
          useValue: mockRewardRepo,
        },
        {
          provide: getRepositoryToken(Notification),
          useValue: mockNotificationRepo,
        },
        {
          provide: getRepositoryToken(ReferralRecord),
          useValue: mockReferralRepo,
        },
        { provide: StorageService, useValue: mockStorageService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: QueueService, useValue: mockQueueService },
      ],
    }).compile();

    service = module.get(DataExportService);
  });

  describe('queueExport', () => {
    it('queues export job and returns 202-style payload', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
      });

      const result = await service.queueExport('user-1');

      expect(result).toEqual({ jobId: 'job-1', status: 'queued' });
      expect(mockQueueService.addJob).toHaveBeenCalledWith(
        DATA_PROCESSING_QUEUE,
        USER_DATA_EXPORT_JOB,
        { userId: 'user-1', email: 'user@example.com' },
      );
    });

    it('throws when user not found', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      await expect(service.queueExport('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('processExport', () => {
    it('builds JSON export and emails download link', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        country: 'KE',
        preferredLanguage: 'en',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockStorageService.saveDataExport.mockResolvedValue({
        exportId: 'export-1',
        downloadToken: 'token-abc',
        expiresAt: new Date(),
        filePath: '/tmp/export.json',
      });

      await service.processExport({ userId: 'user-1' });

      expect(mockStorageService.saveDataExport).toHaveBeenCalled();
      expect(mockNotificationService.sendEmail).toHaveBeenCalledWith(
        'user-1',
        'data-export-ready',
        expect.objectContaining({
          downloadUrl: 'http://localhost/download',
          expiresInHours: 24,
        }),
      );
    });
  });
});
