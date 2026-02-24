import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { getRedisUrl, redisConfig } from '../../config/redis.config';
import { DailyTaskAssignment } from '../entities/daily-task-assignment.entity';
import { HealthTask } from '../entities/health-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';

@Injectable()
export class TaskAssignmentService implements OnModuleDestroy {
  private readonly logger = new Logger(TaskAssignmentService.name);
  private readonly redis: Redis;

  constructor(
    @InjectRepository(DailyTaskAssignment)
    private readonly dailyTaskAssignmentRepository: Repository<DailyTaskAssignment>,
    @InjectRepository(HealthTask)
    private readonly healthTaskRepository: Repository<HealthTask>,
    @InjectRepository(TaskCompletion)
    private readonly taskCompletionRepository: Repository<TaskCompletion>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    const config = redisConfig(configService);
    this.redis = new Redis(getRedisUrl(config), {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 500,
      retryStrategy: () => null,
    });

    this.redis.on('error', (error: Error) => {
      this.logger.warn(
        `Redis unavailable for task assignments: ${error.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  async getTodayTasksForUser(userId: string): Promise<HealthTask[]> {
    const today = this.getTodayDateString();
    const cacheKey = this.getCacheKey(userId, today);

    const cachedTasks = await this.getCachedTasks(cacheKey);
    if (cachedTasks) {
      this.logger.debug(`Cache hit for ${cacheKey}`);
      return cachedTasks;
    }

    this.logger.debug(`Cache miss for ${cacheKey}`);

    const existingAssignment = await this.findAssignmentForDate(userId, today);
    if (existingAssignment) {
      const tasks = existingAssignment.tasks ?? [];
      await this.setCachedTasks(cacheKey, tasks);
      this.logger.debug(
        `Using existing daily assignment for user ${userId} on ${today}`,
      );
      return tasks;
    }

    const tasks = await this.createTodayAssignment(userId, today);
    await this.setCachedTasks(cacheKey, tasks);

    return tasks;
  }

  private async createTodayAssignment(
    userId: string,
    assignedDate: string,
  ): Promise<HealthTask[]> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const assignmentRepository = manager.getRepository(DailyTaskAssignment);

        const existingAssignment = await assignmentRepository.findOne({
          where: {
            user: { id: userId },
            assignedDate,
          },
          relations: {
            tasks: true,
          },
        });

        if (existingAssignment) {
          return existingAssignment.tasks ?? [];
        }

        const selectedTasks = await this.selectEligibleTasks(manager, userId);

        const assignment = assignmentRepository.create({
          user: { id: userId } as User,
          assignedDate,
          tasks: selectedTasks,
        });

        await assignmentRepository.save(assignment);

        this.logger.log(
          `Created daily task assignment for user ${userId} on ${assignedDate} with ${selectedTasks.length} task(s)`,
        );

        return selectedTasks;
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        this.logger.debug(
          `Concurrent assignment detected for user ${userId} on ${assignedDate}; re-fetching existing assignment`,
        );

        const assignment = await this.findAssignmentForDate(
          userId,
          assignedDate,
        );
        return assignment?.tasks ?? [];
      }

      throw error;
    }
  }

  private async selectEligibleTasks(
    manager: EntityManager,
    userId: string,
  ): Promise<HealthTask[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return manager
      .getRepository(HealthTask)
      .createQueryBuilder('task')
      .where((queryBuilder) => {
        const completionSubquery = queryBuilder
          .subQuery()
          .select('1')
          .from(TaskCompletion, 'completion')
          .where('completion.taskId = task.id')
          .andWhere('completion.userId = :userId')
          .andWhere('completion.completedAt >= :sevenDaysAgo')
          .getQuery();

        return `NOT EXISTS ${completionSubquery}`;
      })
      .setParameters({ userId, sevenDaysAgo })
      .orderBy('task.createdAt', 'ASC')
      .addOrderBy('task.id', 'ASC')
      .getMany();
  }

  private async findAssignmentForDate(
    userId: string,
    assignedDate: string,
  ): Promise<DailyTaskAssignment | null> {
    return this.dailyTaskAssignmentRepository.findOne({
      where: {
        user: { id: userId },
        assignedDate,
      },
      relations: {
        tasks: true,
      },
    });
  }

  private getCacheKey(userId: string, assignedDate: string): string {
    return `daily_tasks:${userId}:${assignedDate}`;
  }

  private async getCachedTasks(cacheKey: string): Promise<HealthTask[] | null> {
    try {
      const cachedValue = await this.redis.get(cacheKey);

      if (!cachedValue) {
        return null;
      }

      const parsed = JSON.parse(cachedValue) as unknown;
      if (!Array.isArray(parsed)) {
        return null;
      }

      return parsed as HealthTask[];
    } catch (error) {
      this.logger.warn(
        `Failed reading daily tasks cache for key ${cacheKey}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async setCachedTasks(
    cacheKey: string,
    tasks: HealthTask[],
  ): Promise<void> {
    const ttlSeconds = this.getSecondsUntilEndOfDay();

    try {
      await this.redis.set(cacheKey, JSON.stringify(tasks), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(
        `Failed writing daily tasks cache for key ${cacheKey}: ${(error as Error).message}`,
      );
    }
  }

  private getTodayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private getSecondsUntilEndOfDay(): number {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const seconds = Math.ceil((endOfDay.getTime() - now.getTime()) / 1000);
    return Math.max(1, seconds);
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    const databaseError = error as {
      code?: string;
      driverError?: { code?: string };
    };

    return (
      databaseError?.code === '23505' ||
      databaseError?.driverError?.code === '23505'
    );
  }
}
