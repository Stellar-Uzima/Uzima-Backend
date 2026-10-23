import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
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
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    delete: jest.fn(),
  };

  const mockDeadLetterProcessor = {
    replayFailedJob: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRepository.create.mockReturnValue(mockFailedJob);
    mockRepository.save.mockResolvedValue(mockFailedJob);
    mockRepository.findOne.mockResolvedValue(mockFailedJob);
    mockRepository.findAndCount.mockResolvedValue([[mockFailedJob], 1]);
    mockRepository.delete.mockResolvedValue({ affected: 1 });
    mockDeadLetterProcessor.replayFailedJob.mockResolvedValue({ jobId: 'new-job-123' });

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
    it('should return paginated list of failed jobs with correct metadata', async () => {
      const query: ListFailedJobsDto = { page: 1, limit: 20 };
      const result = await service.listFailedJobs(query);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(mockFailedJob.id);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should calculate totalPages correctly across multiple pages', async () => {
      mockRepository.findAndCount.mockResolvedValueOnce([[mockFailedJob], 45]);
      const result = await service.listFailedJobs({ page: 2, limit: 20 });

      expect(result.total).toBe(45);
      expect(result.totalPages).toBe(3);
      expect(result.page).toBe(2);
    });

    it('should return empty data when no failed jobs exist', async () => {
      mockRepository.findAndCount.mockResolvedValueOnce([[], 0]);
      const result = await service.listFailedJobs({ page: 1, limit: 20 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('should propagate persistence failures from the repository', async () => {
      mockRepository.findAndCount.mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(service.listFailedJobs({ page: 1, limit: 20 })).rejects.toThrow('DB connection lost');
    });
  });

  describe('replayFailedJob', () => {
    it('should replay a failed job and return the new job id', async () => {
      const result = await service.replayFailedJob(mockFailedJob.id);

      expect(result.success).toBe(true);
      expect(result.message).toContain('re-queued successfully');
      expect(result.replayedJobId).toBe('new-job-123');
      expect(deadLetterProcessor.replayFailedJob).toHaveBeenCalledWith(mockFailedJob.id);
    });

    it('should throw NotFoundException and not replay when job does not exist', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.replayFailedJob('non-existent-id')).rejects.toThrow(NotFoundException);
      expect(deadLetterProcessor.replayFailedJob).not.toHaveBeenCalled();
    });

    it('should surface failure when the dead letter processor rejects the replay', async () => {
      mockDeadLetterProcessor.replayFailedJob.mockRejectedValueOnce(new Error('Queue unavailable'));

      await expect(service.replayFailedJob(mockFailedJob.id)).rejects.toThrow('Queue unavailable');
    });
  });

  describe('retryFailedJob', () => {
    it('should retry a failed job and return the new job id', async () => {
      const result = await service.retryFailedJob(mockFailedJob.id);

      expect(result.success).toBe(true);
      expect(result.message).toContain('re-enqueued successfully');
      expect(result.replayedJobId).toBe('new-job-123');
      expect(deadLetterProcessor.replayFailedJob).toHaveBeenCalledWith(mockFailedJob.id);
    });

    it('should throw NotFoundException and not retry when job does not exist', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.retryFailedJob('non-existent-id')).rejects.toThrow(NotFoundException);
      expect(deadLetterProcessor.replayFailedJob).not.toHaveBeenCalled();
    });

    it('should surface failure when the dead letter processor rejects the retry', async () => {
      mockDeadLetterProcessor.replayFailedJob.mockRejectedValueOnce(new Error('Queue unavailable'));

      await expect(service.retryFailedJob(mockFailedJob.id)).rejects.toThrow('Queue unavailable');
    });
  });
});
