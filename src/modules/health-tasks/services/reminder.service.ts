import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, Between } from 'typeorm';
import { TaskReminder, ReminderStatus, ReminderType } from '../../../database/entities/task-reminder.entity';
import { NotificationService } from '../../../notifications/services/notification.service';
import { HealthTask } from '../../../entities/health-task.entity';

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    @InjectRepository(TaskReminder)
    private readonly reminderRepository: Repository<TaskReminder>,
    @InjectRepository(HealthTask)
    private readonly taskRepository: Repository<HealthTask>,
    private readonly notificationService: NotificationService
  ) {}

  async setReminder(
    taskId: string,
    userId: string,
    remindAt: Date,
    type: ReminderType = ReminderType.PUSH
  ): Promise<TaskReminder> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const reminder = this.reminderRepository.create({
      taskId,
      userId,
      remindAt,
      type,
      status: ReminderStatus.SCHEDULED,
    });

    return this.reminderRepository.save(reminder);
  }

  async cancelReminder(reminderId: string): Promise<void> {
    const reminder = await this.reminderRepository.findOne({ where: { id: reminderId } });
    if (!reminder) {
      throw new NotFoundException(`Reminder with ID ${reminderId} not found`);
    }

    reminder.status = ReminderStatus.CANCELLED;
    await this.reminderRepository.save(reminder);
  }

  async processDueReminders(): Promise<number> {
    const now = new Date();
    const dueReminders = await this.reminderRepository.find({
      where: {
        status: ReminderStatus.SCHEDULED,
        remindAt: LessThanOrEqual(now),
      },
      relations: ['task'],
    });

    this.logger.log(`Processing ${dueReminders.length} due reminders`);

    let processedCount = 0;
    for (const reminder of dueReminders) {
      try {
        await this.sendReminder(reminder);
        processedCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to send reminder ${reminder.id}: ${errorMessage}`);
        reminder.status = ReminderStatus.FAILED;
        reminder.deliveryTracking = { error: errorMessage, timestamp: new Date() };
        await this.reminderRepository.save(reminder);
      }
    }

    return processedCount;
  }

  private async sendReminder(reminder: TaskReminder): Promise<void> {
    const { task, type } = reminder;
    const userId = reminder.userId;
    const taskTitle = task?.title || 'Health Task';

    let success = false;
    const tracking: any = { sentAt: new Date() };

    switch (type) {
      case ReminderType.EMAIL:
        success = await this.notificationService.sendEmail(userId, 'task-reminder', {
          taskTitle,
          remindAt: reminder.remindAt,
        });
        break;
      case ReminderType.SMS:
        success = await this.notificationService.sendSMS(
          userId,
          `Reminder: Your health task "${taskTitle}" is due now!`
        );
        break;
      case ReminderType.PUSH:
      default:
        success = await this.notificationService.sendPush(
          userId,
          'Task Reminder',
          `Time to work on your task: ${taskTitle}`
        );
        break;
    }

    if (success) {
      reminder.status = ReminderStatus.SENT;
      reminder.deliveryTracking = { ...tracking, status: 'delivered' };
    } else {
      reminder.status = ReminderStatus.FAILED;
      reminder.deliveryTracking = { ...tracking, status: 'failed_by_notification_service' };
    }

    await this.reminderRepository.save(reminder);
  }

  async getRemindersForTask(taskId: string): Promise<TaskReminder[]> {
    return this.reminderRepository.find({
      where: { taskId },
      order: { remindAt: 'ASC' },
    });
  }

  async deleteReminder(reminderId: string): Promise<void> {
    await this.reminderRepository.delete(reminderId);
  }

  /**
   * Backfill missed reminders that were scheduled before a given cutoff time
   * but never processed (e.g., after server downtime or scheduler restart).
   *
   * This method looks for reminders with `SCHEDULED` status whose `remindAt`
   * timestamp falls between the `since` date and `now`. It processes them in
   * batches to avoid overwhelming the notification service.
   *
   * @param since - The start of the backfill window (inclusive). Defaults to
   *                24 hours ago if not provided.
   * @param batchSize - Number of reminders to process per batch (default: 50).
   * @returns An object with `total` (number of missed reminders found) and
   *          `processed` (number successfully sent).
   *
   * @example
   * // Backfill reminders missed in the last 6 hours
   * const result = await service.backfillMissedReminders(
   *   new Date(Date.now() - 6 * 60 * 60 * 1000),
   * );
   * console.log(`Backfilled ${result.processed} of ${result.total} missed reminders`);
   */
  async backfillMissedReminders(
    since?: Date,
    batchSize: number = 50,
  ): Promise<{ total: number; processed: number }> {
    const now = new Date();
    const windowStart = since || new Date(now.getTime() - 24 * 60 * 60 * 1000);

    this.logger.log(
      `Starting backfill for missed reminders from ${windowStart.toISOString()} to ${now.toISOString()}`,
    );

    // Use a database-level range query for efficiency
    const missedReminders = await this.reminderRepository.find({
      where: {
        status: ReminderStatus.SCHEDULED,
        remindAt: Between(windowStart, now),
      },
      relations: ['task'],
    });

    if (missedReminders.length === 0) {
      this.logger.log('No missed reminders found in backfill window');
      return { total: 0, processed: 0 };
    }

    this.logger.log(
      `Found ${missedReminders.length} missed reminders to backfill (batch size: ${batchSize})`,
    );

    let processedCount = 0;

    for (let i = 0; i < missedReminders.length; i += batchSize) {
      const batch = missedReminders.slice(i, i + batchSize);

      for (const reminder of batch) {
        try {
          await this.sendReminder(reminder);
          processedCount++;
        } catch (error) {
          this.logger.error(
            `Backfill: Failed to send reminder ${reminder.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          reminder.status = ReminderStatus.FAILED;
          reminder.deliveryTracking = {
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
            backfill: true,
          };
          await this.reminderRepository.save(reminder);
        }
      }

      this.logger.debug(
        `Backfill progress: ${processedCount}/${missedReminders.length} reminders processed`,
      );
    }

    this.logger.log(
      `Backfill complete. Processed: ${processedCount}/${missedReminders.length} missed reminders`,
    );

    return { total: missedReminders.length, processed: processedCount };
  }
}
