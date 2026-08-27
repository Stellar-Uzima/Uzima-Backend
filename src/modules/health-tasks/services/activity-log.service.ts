import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskActivity } from '../../../database/entities/task-activity.entity';

/**
 * Records and retrieves activity log entries for health tasks.
 * Each change to a task (creation, edit, completion, etc.) is persisted as a
 * {@link TaskActivity} record so users and admins can audit the task history.
 */
@Injectable()
export class ActivityLogService {
  constructor(
    @InjectRepository(TaskActivity)
    private readonly activityRepository: Repository<TaskActivity>,
  ) {}

  async logTaskChange(
    taskId: string,
    changedBy: string,
    changeType: string,
    details: Record<string, unknown>,
  ): Promise<TaskActivity> {
    const entry = this.activityRepository.create({
      taskId,
      changedBy,
      changeType,
      details,
    });

    return this.activityRepository.save(entry);
  }

  async getActivityHistory(
    taskId: string,
    limit = 50,
    offset = 0,
  ): Promise<TaskActivity[]> {
    return this.activityRepository.find({
      where: { taskId },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });
  }
}
