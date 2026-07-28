import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { TaskAssignmentService } from './assignment/task-assignment.service';
import { RecurringTaskService } from './assignment/recurring-task.service';
import { ReminderService } from '../modules/health-tasks/services/reminder.service';
import { HealthTask } from './entities/health-task.entity';
import { TasksService } from './tasks.service';

@Injectable()
export class TasksScheduler {
  private readonly logger = new Logger(TasksScheduler.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(HealthTask)
    private readonly healthTaskRepository: Repository<HealthTask>,
    private readonly taskAssignmentService: TaskAssignmentService,
    private readonly reminderService: ReminderService,
    private readonly recurringTaskService: RecurringTaskService,
    private readonly tasksService: TasksService,
  ) {}

  @Cron('0 0 6 * * *')
  async assignDailyTasks(): Promise<void> {
    this.logger.log('Starting daily task assignment cron job');
    try {
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
          this.logger.error(
            `Failed to assign tasks to user ${user.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          errorCount++;
        }
      }

      this.logger.log(
        `Daily task assignment completed. Processed: ${processedCount}, Errors: ${errorCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Daily task assignment cron job failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processReminders(): Promise<void> {
    this.logger.debug('Starting task reminder processing cron job');
    try {
      const count = await this.reminderService.processDueReminders();
      if (count > 0) {
        this.logger.log(`Processed ${count} task reminders`);
      }
    } catch (error) {
      this.logger.error(
        `Task reminder processing failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  @Cron('0 0 0 * * *')
  async generateRecurringAssignments(): Promise<void> {
    this.logger.log('Running recurring task generation at midnight');
    const today = new Date().toISOString().split('T')[0];
    await this.recurringTaskService.generateAssignmentsForDate(today);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async enqueueUpcomingReminders(): Promise<void> {
    this.logger.debug('Starting upcoming-reminder enqueue cron job');
    try {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + 10 * 60 * 1000);

      const upcoming = await this.healthTaskRepository.find({
        where: { reminderTime: Between(now, windowEnd) },
      });

      if (upcoming.length === 0) return;

      this.logger.log(`Found ${upcoming.length} upcoming reminders to enqueue`);

      let enqueuedCount = 0;
      let errorCount = 0;

      for (const task of upcoming) {
        try {
          await this.tasksService.scheduleReminderJob(task);
          enqueuedCount++;
        } catch (error) {
          this.logger.error(
            `Failed to enqueue reminder for task ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          errorCount++;
        }
      }

      this.logger.log(
        `Upcoming reminders processed. Enqueued: ${enqueuedCount}, Errors: ${errorCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Upcoming reminders cron job failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

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
        this.logger.error(
          `Failed to assign tasks to user ${user.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        errorCount++;
      }
    }

    this.logger.log(
      `Manual task assignment completed. Processed: ${processedCount}, Errors: ${errorCount}`,
    );

    return { processed: processedCount, errors: errorCount };
  }
}