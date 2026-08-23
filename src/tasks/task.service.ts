import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskCompletion } from './entities/task-completion.entity';

export interface PendingTaskSummary {
  id: string;
  title: string;
}

/**
 * Read-side helper over task completions used by reminder schedulers to
 * build "pending tasks" digests.
 */
@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(TaskCompletion)
    private readonly taskCompletionRepository: Repository<TaskCompletion>,
  ) {}

  /** Distinct users that have at least one incomplete task completion. */
  async findUsersWithPendingTasks(): Promise<{ id: string }[]> {
    return this.taskCompletionRepository
      .createQueryBuilder('completion')
      .select('DISTINCT completion.userId', 'id')
      .where('completion.isCompleted = :isCompleted', { isCompleted: false })
      .andWhere('completion.deletedAt IS NULL')
      .getRawMany<{ id: string }>();
  }

  /** Incomplete tasks (with titles) for a given user. */
  async findIncompleteTasks(userId: string): Promise<PendingTaskSummary[]> {
    return this.taskCompletionRepository
      .createQueryBuilder('completion')
      .innerJoin('completion.task', 'task')
      .select('task.id', 'id')
      .addSelect('task.title', 'title')
      .where('completion.userId = :userId', { userId })
      .andWhere('completion.isCompleted = :isCompleted', { isCompleted: false })
      .andWhere('completion.deletedAt IS NULL')
      .getRawMany<{ id: string; title: string }>();
  }
}
