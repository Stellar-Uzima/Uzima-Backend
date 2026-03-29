import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Streak } from './entities/streak.entity';
import { User } from '../entities/user.entity';
import { TaskCompletion } from '../tasks/entities/task-completion.entity';

@Injectable()
export class StreaksService {
  private readonly logger = new Logger(StreaksService.name);
  private readonly MILESTONES = [7, 14, 30, 60, 100];

  constructor(
    @InjectRepository(Streak)
    private readonly streakRepo: Repository<Streak>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(TaskCompletion)
    private readonly taskCompletionRepo: Repository<TaskCompletion>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('user.registered')
  async handleUserRegistered(event: {
    userId: string;
    email: string;
    phoneNumber?: string;
  }) {
    this.logger.log(`Creating default streak for user: ${event.userId}`);
    const user = await this.userRepo.findOne({
      where: { id: event.userId },
    });

    if (!user) {
      this.logger.error(`User not found for streak creation: ${event.userId}`);
      return;
    }

    const streak = this.streakRepo.create({
      user,
      currentStreak: 0,
      longestStreak: 0,
    });
    await this.streakRepo.save(streak);
  }

  async getCurrentStreak(userId: string) {
    const streak = await this.streakRepo.findOne({
      where: { user: { id: userId } },
    });

    if (!streak) {
      throw new NotFoundException('Streak not found for user');
    }

    return {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      lastCompletedDate: streak.lastCompletedDate,
    };
  }

  async getStreakHistory(userId: string, weeks = 4) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const today = new Date();
    const daysToInclude = weeks * 7;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - daysToInclude + 1);

    const completions = await this.taskCompletionRepo
      .createQueryBuilder('c')
      .where('c.userId = :userId', { userId })
      .andWhere('c.completedAt >= :startDate', {
        startDate: startDate.toISOString(),
      })
      .andWhere('c.completedAt <= :endDate', { endDate: today.toISOString() })
      .getMany();

    const completionDays = new Set(
      completions.map((c) => c.completedAt.toISOString().slice(0, 10)),
    );

    const history = [] as Array<Array<{ date: string; completed: boolean }>>;

    for (let week = 0; week < weeks; week++) {
      const weekDates = [] as Array<{ date: string; completed: boolean }>;
      for (let d = 0; d < 7; d++) {
        const current = new Date(startDate);
        current.setDate(startDate.getDate() + week * 7 + d);

        const isoDate = current.toISOString().slice(0, 10);
        const completed = completionDays.has(isoDate);
        weekDates.push({ date: isoDate, completed });
      }
      history.push(weekDates);
    }

    return {
      startDate: startDate.toISOString().slice(0, 10),
      endDate: today.toISOString().slice(0, 10),
      weeks: history,
    };
  }

  @OnEvent('task.completed')
  async handleTaskCompleted(event: {
    completionId: string;
    userId: string;
    taskId: string;
    xlmAmount: number;
  }) {
    this.logger.log(
      `Updating streak for user ${event.userId} post task ${event.taskId} completion`,
    );
    const streak = await this.streakRepo.findOne({
      where: { user: { id: event.userId } },
      relations: ['user'],
    });

    if (!streak) {
      this.logger.error(`Streak not found for user: ${event.userId}`);
      return;
    }

    const todayDateStr = this.getLocalDateString(new Date());

    // If no lastCompletedDate, this is the very first task ever
    if (!streak.lastCompletedDate) {
      streak.currentStreak = 1;
      streak.longestStreak = 1;
      streak.lastCompletedDate = todayDateStr;
      await this.streakRepo.save(streak);
      return;
    }

    // A streak continues if they completed a task yesterday
    // If they completed a task today already, we don't increment
    if (streak.lastCompletedDate === todayDateStr) {
      this.logger.log(`User ${event.userId} already completed a task today.`);
      return;
    }

    const lastDate = new Date(streak.lastCompletedDate);
    const todayDate = new Date(todayDateStr);

    // Get difference in days (UTC based string output)
    const diffTime = Math.abs(todayDate.getTime() - lastDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      // Completed yesterday, streak increments
      streak.currentStreak += 1;
      if (streak.currentStreak > streak.longestStreak) {
        streak.longestStreak = streak.currentStreak;
      }

      // Check for milestones
      if (this.MILESTONES.includes(streak.currentStreak)) {
        this.emitMilestoneEvent(event.userId, streak.currentStreak);
      }
    } else if (diffDays > 1) {
      // Missed a day, streak resets
      this.logger.log(
        `User ${event.userId} missed a day. Streak resetting from ${streak.currentStreak} to 1.`,
      );
      streak.currentStreak = 1;
    }

    // Always update last completed date
    streak.lastCompletedDate = todayDateStr;

    await this.streakRepo.save(streak);
  }

  private emitMilestoneEvent(userId: string, milestoneDays: number) {
    this.logger.log(
      `Emitting milestone event for user ${userId} at ${milestoneDays} days.`,
    );
    this.eventEmitter.emit('streak.milestone', {
      userId,
      milestoneDays,
    });
    // Also emit reward event for existing milestone reward handling
    this.eventEmitter.emit('reward.milestone', {
      userId,
      milestoneReached: milestoneDays,
    });
  }

  // Utility to convert Date to YYYY-MM-DD string according to local server timezone
  // Note: Depending on requirements, explicit timezone manipulation library like dat-fns-tz or moment might be preferred
  private getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
