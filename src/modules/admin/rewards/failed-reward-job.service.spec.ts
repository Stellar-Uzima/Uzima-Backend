import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { FailedRewardJobService } from './failed-reward-job.service';
import { FailedRewardJob } from '@/rewards/entities/failed-reward-job.entity';
import { DeadLetterProcessor } from '@/rewards/queues/dead-letter.processor';
import { ListFailedJobsDto } from './dto/failed-reward-job.dto';

describe('FailedRewardJobService', () => {
  let service: FailedRewardJobService;
  let failedRewardJobRepository: Repository<FailedRewardJob>;
  let deadLetterProcessor: DeadLetterProcessor;

  const mockFailedJob = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    userId: 'user-123',
    xlmAmount: 100,
    taskCompletionId: 'completion-123',
    errorMessage: 'Test error',
    jobId: 'job-123',
    attemptsMade: 3,
    jobType: 'reward',
    jobData: {},
    failedAt: new Date(),
  };

  const mockRepository = {
    create: jest.fn().mockReturnValue(mockFailedJob),
    save: jest.fn().mockResolvedValue(mockFailedJob),
    findOne: jest.fn().mockResolvedValue(mockFailedJob),
    findAndCount: jest.fn().mockResolvedValue([[mockFailedJob], 1]),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };

  const mockDeadLetterProcessor = {
    replayFailedJob: jest.fn().mockResolvedValue({ jobId: 'new-job-123' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FailedRewardJobService,
        {
          provide: getRepositoryToken(FailedRewardJob),
          useValue: mockRepository,
        },
        {
          provide: DeadLetterProcessor,
          useValue: mockDeadLetterProcessor,
        },
      ],
    }).compile();

    service = module.get<FailedRewardJobService>(FailedRewardJobService);
    failedRewardJobRepository = module.get<Repository<FailedRewardJob>>(getRepositoryToken(FailedRewardJob));
    deadLetterProcessor = module.get<DeadLetterProcessor>(DeadLetterProcessor);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listFailedJobs', () => {
    it('should return paginated list of failed jobs', async () => {
      const query: ListFailedJobsDto = { page: 1, limit: 20 };
      const result = await service.listFailedJobs(query);

      expect(result.data).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(failedRewardJobRepository.findAndCount).toHaveBeenCalled();
    });
  });

  describe('replayFailedJob', () => {
    it('should replay a failed job successfully', async () => {
      const result = await service.replayFailedJob(mockFailedJob.id);

      expect(result.success).toBe(true);
      expect(result.message).toContain('re-queued successfully');
      expect(result.replayedJobId).toBe('new-job-123');
      expect(deadLetterProcessor.replayFailedJob).toHaveBeenCalledWith(mockFailedJob.id);
    });

    it('should throw NotFoundException if job not found', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.replayFailedJob('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('retryFailedJob', () => {
    it('should retry a failed job successfully', async () => {
      const result = await service.retryFailedJob(mockFailedJob.id);

      expect(result.success).toBe(true);
      expect(result.message).toContain('re-enqueued successfully');
      expect(result.replayedJobId).toBe('new-job-123');
      expect(deadLetterProcessor.replayFailedJob).toHaveBeenCalledWith(mockFailedJob.id);
    });

    it('should throw NotFoundException if job not found', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.retryFailedJob('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
