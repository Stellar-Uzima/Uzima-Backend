import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import {
  DATA_PROCESSING_QUEUE,
  BULK_TASK_ASSIGNMENT_JOB,
  BulkTaskAssignmentJobData,
} from '../../queue/queue.constants';
import { BulkTaskAssignmentService } from './bulk-task-assignment.service';

@Processor(DATA_PROCESSING_QUEUE)
export class BulkTaskAssignmentProcessor {
  private readonly logger = new Logger(BulkTaskAssignmentProcessor.name);

  constructor(
    private readonly bulkTaskAssignmentService: BulkTaskAssignmentService,
  ) {}

  @Process(BULK_TASK_ASSIGNMENT_JOB)
  async handleBulkAssignment(job: Job<BulkTaskAssignmentJobData>): Promise<void> {
    const { userIds, taskIds, assignedDate } = job.data;
    this.logger.log(
      `Processing bulk task assignment job ${job.id} for ${userIds.length} users`,
    );

    const result = await this.bulkTaskAssignmentService.processBulkAssignment(
      userIds,
      taskIds,
      assignedDate,
    );

    await job.progress(100);
    this.logger.log(
      `Bulk assignment job ${job.id} finished: ${result.processed} processed, ${result.errors.length} errors`,
    );
  }
}
