import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { TaskCompletion } from '../../../database/entities/task-completion.entity';
import { HealthTask } from '../../../entities/health-task.entity';
import { User } from '../../../entities/user.entity';

export interface CompletionMetrics {
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  currentStreak: number;
  longestStreak: number;
  averageCompletionTime: number; // in days
}

export interface MarkCompleteDto {
  taskId: string;
  completionPercentage?: number;
  notes?: string;
}

export interface MarkIncompleteDto {
  taskId: string;
  notes?: string;
}

@Injectable()
export class CompletionService {
  constructor(
    @InjectRepository(TaskCompletion)
    private readonly completionRepo: Repository<TaskCompletion>,
    @InjectRepository(HealthTask)
    private readonly taskRepo: Repository<HealthTask>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async markTaskComplete(
    userId: string,
    dto: MarkCompleteDto,
  ): Promise<TaskCompletion> {
    const { taskId, completionPercentage = 100, notes } = dto;

    // Validate task exists
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    // Validate user exists
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    // Validate completion percentage
    if (completionPercentage < 0 || completionPercentage > 100) {
      throw new BadRequestException('Completion percentage must be between 0 and 100');
    }

    const completedAt = completionPercentage === 100 ? new Date() : null;

    // Create completion record
    const completion = this.completionRepo.create({
      userId,
      taskId,
      isCompleted: completionPercentage === 100,
      completionPercentage,
      completedAt,
      notes,
    });

    return await this.completionRepo.save(completion);
  }

  async markTaskIncomplete(
    userId: string,
    dto: MarkIncompleteDto,
  ): Promise<TaskCompletion> {
    const { taskId, notes } = dto;

    // Validate task exists
    const task = await this.taskRepo.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    // Validate user exists
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    // Create incomplete record
    const completion = this.completionRepo.create({
      userId,
      taskId,
      isCompleted: false,
      completionPercentage: 0,
      completedAt: null,
      notes,
    });

    return await this.completionRepo.save(completion);
  }

  async getCompletionHistory(
    userId: string,
    taskId: string,
  ): Promise<TaskCompletion[]> {
    return await this.completionRepo.find({
      where: { userId, taskId },
      order: { createdAt: 'DESC' },
      relations: ['task'],
    });
  }

  async getCompletionMetrics(userId: string): Promise<CompletionMetrics> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['healthTasks'],
    });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const totalTasks = user.healthTasks?.length || 0;

    // Get all completions for user
    const completions = await this.completionRepo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    const completedTasks = completions.filter(c => c.isCompleted).length;
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    // Calculate streaks
    const { currentStreak, longestStreak } = this.calculateStreaks(completions);

    // Calculate average completion time (simplified - days between creation and completion)
    const completionTimes = completions
      .filter(c => c.isCompleted && c.completedAt)
      .map(c => {
        // This is simplified - in reality, we'd need task creation date
        return 1; // placeholder
      });

    const averageCompletionTime = completionTimes.length > 0
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      : 0;

    return {
      totalTasks,
      completedTasks,
      completionRate,
      currentStreak,
      longestStreak,
      averageCompletionTime,
    };
  }

  private calculateStreaks(completions: TaskCompletion[]): { currentStreak: number; longestStreak: number } {
    if (completions.length === 0) return { currentStreak: 0, longestStreak: 0 };

    // Group by date
    const dailyCompletions = new Map<string, boolean>();
    completions.forEach(c => {
      if (c.isCompleted && c.completedAt) {
        const date = c.completedAt.toISOString().split('T')[0];
        dailyCompletions.set(date, true);
      }
    });

    const dates = Array.from(dailyCompletions.keys()).sort();

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    for (let i = 0; i < dates.length; i++) {
      const currentDate = new Date(dates[i]);
      const prevDate = i > 0 ? new Date(dates[i - 1]) : null;

      if (!prevDate || (currentDate.getTime() - prevDate.getTime()) === 24 * 60 * 60 * 1000) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }

    longestStreak = Math.max(longestStreak, tempStreak);

    // Calculate current streak (assuming today is the last date)
    const today = new Date().toISOString().split('T')[0];
    if (dates.includes(today)) {
      currentStreak = tempStreak;
    } else {
      // Check if yesterday was completed
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      currentStreak = dates.includes(yesterday) ? tempStreak : 0;
    }

    return { currentStreak, longestStreak };
  }

  async getTaskCompletionStats(taskId: string): Promise<{
    totalAttempts: number;
    totalCompletions: number;
    averageCompletionPercentage: number;
    completionRate: number;
  }> {
    const completions = await this.completionRepo.find({
      where: { taskId },
    });

    const totalAttempts = completions.length;
    const totalCompletions = completions.filter(c => c.isCompleted).length;
    const completionRate = totalAttempts > 0 ? (totalCompletions / totalAttempts) * 100 : 0;

    const averageCompletionPercentage = totalAttempts > 0
      ? completions.reduce((sum, c) => sum + c.completionPercentage, 0) / totalAttempts
      : 0;

    return {
      totalAttempts,
      totalCompletions,
      averageCompletionPercentage,
      completionRate,
    };
  }
}