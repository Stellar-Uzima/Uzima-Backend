import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskActivity } from '../../../database/entities/task-activity.entity';

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
