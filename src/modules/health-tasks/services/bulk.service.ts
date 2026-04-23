import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { HealthTask, TaskCategory } from '../../../tasks/entities/health-task.entity';

export interface BulkResult {
  affected: number;
  ids: string[];
}

export interface BulkReminderInput {
  taskId: string;
  remindAt: Date;
  message: string;
}

const MAX_BULK_SIZE = 100;

@Injectable()
export class BulkTaskService {
  constructor(
    @InjectRepository(HealthTask)
    private readonly taskRepo: Repository<HealthTask>,
  ) {}

  async bulkUpdateStatus(ids: string[], status: string): Promise<BulkResult> {
    this.validateIds(ids);

    const result = await this.taskRepo
      .createQueryBuilder()
      .update(HealthTask)
      .set({ status })
      .whereInIds(ids)
      .execute();

    return { affected: result.affected ?? 0, ids };
  }

  async bulkDelete(ids: string[]): Promise<BulkResult> {
    this.validateIds(ids);

    const tasks = await this.taskRepo.find({ where: { id: In(ids) } });
    await this.taskRepo.remove(tasks);

    return { affected: tasks.length, ids: tasks.map((t) => t.id) };
  }

  async bulkAssignCategory(ids: string[], category: TaskCategory): Promise<BulkResult> {
    this.validateIds(ids);

    if (!Object.values(TaskCategory).includes(category)) {
      throw new BadRequestException(`Invalid category: ${category}`);
    }

    const result = await this.taskRepo
      .createQueryBuilder()
      .update(HealthTask)
      .set({ category })
      .whereInIds(ids)
      .execute();

    return { affected: result.affected ?? 0, ids };
  }

  async bulkSetActive(ids: string[], isActive: boolean): Promise<BulkResult> {
    this.validateIds(ids);

    const result = await this.taskRepo
      .createQueryBuilder()
      .update(HealthTask)
      .set({ isActive })
      .whereInIds(ids)
      .execute();

    return { affected: result.affected ?? 0, ids };
  }

  bulkSetReminders(reminders: BulkReminderInput[]): { scheduled: number } {
    if (!reminders.length) {
      throw new BadRequestException('Reminders list cannot be empty');
    }

    if (reminders.length > MAX_BULK_SIZE) {
      throw new BadRequestException(`Cannot schedule more than ${MAX_BULK_SIZE} reminders at once`);
    }

    // In production: persist to a reminders table and schedule jobs
    return { scheduled: reminders.length };
  }

  private validateIds(ids: string[]): void {
    if (!ids.length) {
      throw new BadRequestException('Task IDs list cannot be empty');
    }
    if (ids.length > MAX_BULK_SIZE) {
      throw new BadRequestException(`Bulk operations are limited to ${MAX_BULK_SIZE} tasks at once`);
    }
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      throw new BadRequestException('Duplicate task IDs are not allowed');
    }
  }
}
