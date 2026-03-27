// src/tasks/tasks.scheduler.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { TaskAssignmentService } from './assignment/task-assignment.service';

@Injectable()
export class TasksScheduler {
  private readonly logger = new Logger(TasksScheduler.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly taskAssignmentService: TaskAssignmentService,
  ) {}

  /**
   * Cron job: Assign daily tasks to all active users at 6:00 AM UTC
   * Runs every day at 6:00 AM UTC
   */
  @Cron('0 0 6 * * *') // 6:00 AM UTC daily
  async assignDailyTasks(): Promise<void> {
    this.logger.log('Starting daily task assignment cron job');

    try {
      // Get all active users
      const activeUsers = await this.userRepository.find({
        where: { isActive: true },
      });

      this.logger.log(`Found ${activeUsers.length} active users to assign tasks to`);

      let processedCount = 0;
      let errorCount = 0;

      // Assign tasks to each user (idempotent - skips if already assigned)
      for (const user of activeUsers) {
        try {
          await this.taskAssignmentService.getTodayAssignment(user);
          processedCount++;
        } catch (error) {
          this.logger.error(`Failed to assign tasks to user ${user.id}: ${error.message}`);
          errorCount++;
        }
      }

      this.logger.log(
        `Daily task assignment completed. Processed: ${processedCount}, Errors: ${errorCount}`,
      );
    } catch (error) {
      this.logger.error(`Daily task assignment cron job failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Manual trigger for testing - assigns daily tasks to all active users
   */
  async assignDailyTasksManually(): Promise<{ processed: number; errors: number }> {
    this.logger.log('Manually triggering daily task assignment');

    const activeUsers = await this.userRepository.find({
      where: { isActive: true },
    });

    this.logger.log(`Found ${activeUsers.length} active users to assign tasks to`);

    let processedCount = 0;
    let errorCount = 0;

    for (const user of activeUsers) {
      try {
        await this.taskAssignmentService.getTodayAssignment(user);
        processedCount++;
      } catch (error) {
        this.logger.error(`Failed to assign tasks to user ${user.id}: ${error.message}`);
        errorCount++;
      }
    }

    this.logger.log(
      `Manual task assignment completed. Processed: ${processedCount}, Errors: ${errorCount}`,
    );

    return { processed: processedCount, errors: errorCount };
  }
}