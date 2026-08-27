import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { TaskAssignmentService } from './assignment/task-assignment.service';
import { RecurringTaskService } from './assignment/recurring-task.service';
import { ReminderService } from '../modules/health-tasks/services/reminder.service';
import { HealthTask } from './entities/health-task.entity';
import { TasksService } from './tasks.service';

/**
 * # Recurring Task Scheduling Behavior & Guarantees
 *
 * This scheduler manages all recurring task assignments and reminder processing.
 * It uses `@nestjs/schedule` which relies on `node-cron` internally.
 *
 * ## Cron Job Summary
 *
 * | Job                          | Schedule              | Description                                      |
 * |------------------------------|-----------------------|--------------------------------------------------|
 * | `assignDailyTasks`           | Every day at 06:00    | Assigns daily tasks to all active users          |
 * | `processReminders`           | Every minute          | Processes due reminders (SCHEDULED & past remindAt) |
 * | `generateRecurringAssignments`| Every day at 00:00    | Generates recurring (DAILY/WEEKLY/MONTHLY) assignments |
 * | `enqueueUpcomingReminders`   | Every 5 minutes       | Enqueues reminders due within the next 10 minutes |
 *
 * ## Timezone Handling
 *
 * All cron schedules operate in the **server's local timezone** as configured
 * by the runtime environment's `TZ` setting. If `TZ` is not explicitly set,
 * the server defaults to **UTC**. This means:
 *
 * - `0 0 6 * * *` (assignDailyTasks) runs at 06:00 server-local time.
 * - `0 0 0 * * *` (generateRecurringAssignments) runs at 00:00 server-local time.
 * - Weekly tasks are assigned on **Monday** (UTC weekday 1) regardless of server TZ.
 * - Monthly tasks are assigned on the **1st day of the month** (UTC).
 *
 * **Recommendation**: Set `TZ=UTC` in production for predictable behavior, and
 * document any deviation if a different timezone is used.
 *
 * ## Retry & Error Handling
 *
 * - **Per-user isolation**: If assignment fails for one user, the scheduler
 *   continues processing remaining users. Errors are logged individually.
 * - **No automatic retry**: Failed assignments within a cron run are NOT
 *   automatically retried. They are logged and counted.
 * - **Manual retry**: Use `assignDailyTasksManually()` to retry failed
 *   assignments on demand.
 * - **Reminder failures**: If a reminder fails to send, its status is set to
 *   `FAILED` with delivery tracking metadata. It will NOT be retried
 *   automatically on the next cron cycle.
 *
 * ## Downtime & Backfill Behavior
 *
 * - **Missed daily assignments**: If the server is down at 06:00, the
 *   `assignDailyTasks` cron is skipped for that day. Use
 *   `assignDailyTasksManually()` to backfill.
 * - **Missed reminders**: The `processReminders` job runs every minute and
 *   processes ALL due reminders (SCHEDULED status with `remindAt <= now`),
 *   so missed reminders during short downtime are caught up automatically
 *   on the next run. For extended downtime, use the
 *   `ReminderService.backfillMissedReminders()` method.
 * - **Missed recurring assignments**: If the midnight `generateRecurringAssignments`
 *   is missed, use `RecurringTaskService.backfillMissedAssignments()` to
 *   regenerate assignments for missed dates.
 *
 * ## Scalability Notes
 *
 * - `assignDailyTasks` processes users sequentially. For large user bases,
 *   consider batching or moving to a queue-based approach.
 * - All cron jobs are single-instance; running multiple server instances
 *   requires a distributed lock to prevent duplicate execution.
 */
@Injectable()
export class TasksScheduler implements OnApplicationBootstrap {
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

  /**
   * On application bootstrap, trigger a backfill of any missed reminders
   * and recurring assignments that may have been skipped during downtime.
   *
   * Errors during bootstrap backfill are caught and logged — they do not
   * prevent the application from starting.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      this.logger.log('Skipping startup backfill in test environment');
      return;
    }

    this.logger.log('Running startup backfill for missed reminders and assignments...');
    try {
      // Backfill missed reminders from the last 24 hours
      const reminderResult = await this.reminderService.backfillMissedReminders();
      this.logger.log(
        `Startup reminder backfill: ${reminderResult.processed}/${reminderResult.total} processed`,
      );
    } catch (error) {
      this.logger.error(
        `Startup reminder backfill failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      // Backfill missed recurring assignments for the last 7 days
      const assignmentCount = await this.recurringTaskService.backfillMissedAssignments();
      this.logger.log(
        `Startup assignment backfill: ${assignmentCount} dates processed`,
      );
    } catch (error) {
      this.logger.error(
        `Startup assignment backfill failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

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

  /**
   * Manual backfill for recurring assignments over a date range.
   *
   * Delegates to `RecurringTaskService.backfillMissedAssignments()`.
   *
   * @param since - ISO date string (e.g. '2026-07-25') for the backfill start.
   *                Defaults to 7 days ago.
   * @returns Number of dates backfilled.
   */
  async backfillRecurringAssignments(since?: string): Promise<number> {
    this.logger.log(
      `Manual backfill triggered for recurring assignments since: ${since || '7 days ago'}`,
    );
    return this.recurringTaskService.backfillMissedAssignments(since);
  }

  /**
   * Manual backfill for missed reminders.
   *
   * Delegates to `ReminderService.backfillMissedReminders()`.
   *
   * @param since - Start of the backfill window. Defaults to 24 hours ago.
   * @returns Object with `total` and `processed` counts.
   */
  async backfillMissedReminders(since?: Date): Promise<{ total: number; processed: number }> {
    this.logger.log(
      `Manual backfill triggered for reminders since: ${since?.toISOString() || '24 hours ago'}`,
    );
    return this.reminderService.backfillMissedReminders(since);
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
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  public async handleScheduledTasks(): Promise<void> {
    // Replace direct process.env reference with configService.get
    const batchSize = this.configService.get<number>('TASK_BATCH_SIZE') || 50;
    
    this.logger.log(`Executing scheduled health tasks with batch size: ${batchSize}`);
    
    // Scheduled execution logic...
  }

  
}
