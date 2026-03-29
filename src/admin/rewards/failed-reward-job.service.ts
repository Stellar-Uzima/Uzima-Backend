import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FailedRewardJob } from '../../rewards/entities/failed-reward-job.entity';
import { DeadLetterProcessor } from '../../rewards/queues/dead-letter.processor';
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

  /**
   * Get paginated list of failed reward jobs for admin review.
   */
  async listFailedJobs(
    query: ListFailedJobsDto,
  ): Promise<ListFailedJobsResponseDto> {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [jobs, total] = await this.failedRewardJobRepository.findAndCount({
      order: { failedAt: 'DESC' },
      skip,
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

  /**
   * Replay a specific failed job by re-queuing it.
   */
  async replayFailedJob(
    failedJobId: string,
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
      const { jobId } = await this.deadLetterProcessor.replayFailedJob(
        failedJobId,
      );

      return {
        success: true,
        message: `Failed job ${failedJobId} has been re-queued successfully.`,
        replayedJobId: jobId,
      };
    } catch (error) {
      this.logger.error(`Failed to replay job ${failedJobId}: ${error}`);
      return {
        success: false,
        message: `Failed to replay job: ${error.message || String(error)}`,
      };
    }
  }
}
