import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Streak } from './entities/streak.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class StreaksService {
  private readonly logger = new Logger(StreaksService.name);
  private readonly MILESTONES = [7, 14, 30, 60, 100];

  constructor(
    @InjectRepository(Streak)
    private readonly streakRepo: Repository<Streak>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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
