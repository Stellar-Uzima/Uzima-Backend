// src/tasks/assignment/task-assignment.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { DailyTaskAssignment } from '../entities/daily-task-assignment.entity';
import { HealthTask } from '../entities/health-task.entity';
import { TaskCompletion } from '../entities/task-completion.entity';
import { User } from '../../users/entities/user.entity';

const TASKS_PER_DAY = 5;
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const COMPLETION_LOOKBACK_DAYS = 7;

@Injectable()
export class TaskAssignmentService {
  private readonly logger = new Logger(TaskAssignmentService.name);

  constructor(
    @InjectRepository(DailyTaskAssignment)
    private readonly assignmentRepo: Repository<DailyTaskAssignment>,

    @InjectRepository(HealthTask)
    private readonly taskRepo: Repository<HealthTask>,

    @InjectRepository(TaskCompletion)
    private readonly completionRepo: Repository<TaskCompletion>,

    @InjectRedis()
    private readonly redis: Redis,

    private readonly dataSource: DataSource,
  ) {}

  // ─── Public: Get or Create Today's Assignment ─────────────────────────

  async getTodayAssignment(user: User): Promise<DailyTaskAssignment> {
    const today = this.getToday();
    const cacheKey = this.buildCacheKey(user.id, today);

    // 1. Check Redis cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for user ${user.id} on ${today}`);
      return JSON.parse(cached);
    }

    // 2. Check DB for existing assignment
    let assignment = await this.assignmentRepo.findOne({
      where: { user: { id: user.id }, assignedDate: today },
      relations: ['tasks'],
    });

    // 3. Create lazily if not found
    if (!assignment) {
      this.logger.debug(`Creating new assignment for user ${user.id} on ${today}`);
      assignment = await this.createAssignment(user, today);
    }

    // 4. Cache and return
    await this.redis.set(cacheKey, JSON.stringify(assignment), 'EX', CACHE_TTL_SECONDS);
    return assignment;
  }

  // ─── Private: Create Assignment ───────────────────────────────────────

  private async createAssignment(user: User, today: string): Promise<DailyTaskAssignment> {
    const tasks = await this.selectTasksForUser(user, today);

    const assignment = this.assignmentRepo.create({
      user,
      assignedDate: today,
      tasks,
    });

    return this.assignmentRepo.save(assignment);
  }

  // ─── Private: Select Personalized Tasks ──────────────────────────────

  private async selectTasksForUser(user: User, today: string): Promise<HealthTask[]> {
    const sevenDaysAgo = this.getDateDaysAgo(COMPLETION_LOOKBACK_DAYS);

    // Subquery: task IDs completed by this user in the last 7 days
    const recentlyCompletedSubQuery = this.dataSource
      .createQueryBuilder()
      .select('tc.taskId')
      .from(TaskCompletion, 'tc')
      .where('tc.userId = :userId', { userId: user.id })
      .andWhere('tc.completedDate >= :sevenDaysAgo', { sevenDaysAgo })
      .getQuery();

    // Main query: active tasks matching user's profile, excluding recently completed
    const tasks = await this.taskRepo
      .createQueryBuilder('task')
      .where('task.isActive = true')
      .andWhere(`task.id NOT IN (${recentlyCompletedSubQuery})`)
      .setParameter('userId', user.id)
      .setParameter('sevenDaysAgo', sevenDaysAgo)
      .orderBy('RANDOM()') // randomize daily selection
      .take(TASKS_PER_DAY)
      .getMany();

    return tasks;
  }

  // ─── Cache Invalidation ───────────────────────────────────────────────

  async invalidateCache(userId: string, date?: string): Promise<void> {
    const key = this.buildCacheKey(userId, date ?? this.getToday());
    await this.redis.del(key);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private getToday(): string {
    return new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
  }

  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  private buildCacheKey(userId: string, date: string): string {
    return `task_assignment:${userId}:${date}`;
  }
}