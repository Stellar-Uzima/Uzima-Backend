import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DailyTaskAssignment } from '../entities/daily-task-assignment.entity';
import { HealthTask } from '../entities/health-task.entity';
import { User } from '../../entities/user.entity';
import { TaskAssignmentService } from './task-assignment.service';

export const MAX_BULK_ASSIGN_USERS = 1000;

export interface BulkAssignResult {
  processed: number;
  errors: Array<{ userId: string; message: string }>;
}

@Injectable()
export class BulkTaskAssignmentService {
  private readonly logger = new Logger(BulkTaskAssignmentService.name);

  constructor(
    @InjectRepository(DailyTaskAssignment)
    private readonly assignmentRepo: Repository<DailyTaskAssignment>,
    @InjectRepository(HealthTask)
    private readonly taskRepo: Repository<HealthTask>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly taskAssignmentService: TaskAssignmentService,
  ) {}

  validateBulkAssignPayload(userIds: string[], taskIds: string[]): void {
    if (!userIds?.length || !taskIds?.length) {
      throw new BadRequestException('userIds and taskIds are required');
    }

    if (userIds.length > MAX_BULK_ASSIGN_USERS) {
      throw new BadRequestException(
        `Cannot assign tasks to more than ${MAX_BULK_ASSIGN_USERS} users at once`,
      );
    }
  }

  async processBulkAssignment(
    userIds: string[],
    taskIds: string[],
    assignedDate?: string,
  ): Promise<BulkAssignResult> {
    const date = assignedDate ?? this.getToday();
    const tasks = await this.taskRepo.find({
      where: { id: In(taskIds), isActive: true },
    });

    if (tasks.length !== taskIds.length) {
      throw new BadRequestException('One or more task IDs are invalid or inactive');
    }

    const users = await this.userRepo.find({
      where: { id: In(userIds), isActive: true },
    });
    const userMap = new Map(users.map((user) => [user.id, user]));

    const result: BulkAssignResult = { processed: 0, errors: [] };

    for (const userId of userIds) {
      const user = userMap.get(userId);
      if (!user) {
        result.errors.push({ userId, message: 'User not found or inactive' });
        continue;
      }

      try {
        await this.assignTasksToUser(user, tasks, date);
        result.processed += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Assignment failed';
        this.logger.error(`Bulk assign failed for user ${userId}: ${message}`);
        result.errors.push({ userId, message });
      }
    }

    return result;
  }

  private async assignTasksToUser(
    user: User,
    tasks: HealthTask[],
    assignedDate: string,
  ): Promise<void> {
    let assignment = await this.assignmentRepo.findOne({
      where: { user: { id: user.id }, assignedDate },
      relations: ['tasks'],
    });

    if (!assignment) {
      assignment = this.assignmentRepo.create({
        user,
        assignedDate,
        tasks: [...tasks],
      });
    } else {
      const existingIds = new Set(assignment.tasks.map((task) => task.id));
      const merged = [
        ...assignment.tasks,
        ...tasks.filter((task) => !existingIds.has(task.id)),
      ];
      assignment.tasks = merged;
    }

    await this.assignmentRepo.save(assignment);
    await this.taskAssignmentService.invalidateCache(user.id, assignedDate);
  }

  private getToday(): string {
    return new Date().toISOString().split('T')[0];
  }
}
