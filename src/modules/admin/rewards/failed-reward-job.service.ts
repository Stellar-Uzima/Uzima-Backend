
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FailedRewardJob } from '../../../rewards/entities/failed-reward-job.entity';
import { DeadLetterProcessor } from '../../../rewards/queues/dead-letter.processor';
import {
  ListFailedJobsDto,
  ListFailedJobsResponseDto,
  ReplayFailedJobResponseDto,
} from './dto/failed-reward-job.dto';

@Injectable()
export class FailedRewardJobService {
  private readonly logger = new Logger(FailedRewardJobService.name);

  constructor(
    @InjectRepository(FailedRewardJob)
    private readonly failedRewardJobRepository: Repository<FailedRewardJob>,
    private readonly deadLetterProcessor: DeadLetterProcessor,
  ) {}

  async listFailedJobs(
    query: ListFailedJobsDto,
  ): Promise<ListFailedJobsResponseDto> {
    const { page = 1, limit = 20 } = query;

    const [jobs, total] = await this.failedRewardJobRepository.findAndCount({
      order: { failedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: jobs.map((job) => ({
        id: job.id,
        userId: job.userId,
        xlmAmount: job.xlmAmount,
        taskCompletionId: job.taskCompletionId,
        errorMessage: job.errorMessage,
        jobId: job.jobId,
        attemptsMade: job.attemptsMade,
        jobType: job.jobType,
        failedAt: job.failedAt,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async replayFailedJob(
    failedJobId: string,
  ): Promise<ReplayFailedJobResponseDto> {
    return this.processFailedJob(failedJobId, 'replay');
  }

  async retryFailedJob(
    failedJobId: string,
  ): Promise<ReplayFailedJobResponseDto> {
    return this.processFailedJob(failedJobId, 'retry');
  }

  private async processFailedJob(
    failedJobId: string,
    action: 'replay' | 'retry',
  ): Promise<ReplayFailedJobResponseDto> {
    const failedJob = await this.failedRewardJobRepository.findOne({
      where: { id: failedJobId },
    });

    if (!failedJob) {
      throw new NotFoundException(
        `Failed reward job with ID ${failedJobId} not found`,
      );
    }

    try {
      const result = await this.deadLetterProcessor.replayFailedJob(
        failedJobId,
      );

      const actionLabel = action === 'replay' ? 're-queued' : 're-enqueued';

      return {
        success: true,
        message: `Failed job ${failedJobId} has been ${actionLabel} successfully.`,
        replayedJobId: result.jobId,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to ${action} job ${failedJobId}: ${errorMessage}`,
      );

      return {
        success: false,
        message: `Failed to ${action} job: ${errorMessage}`,
      };
    }
  }
}
