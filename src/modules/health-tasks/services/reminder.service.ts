import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
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
    private readonly notificationService: NotificationService,
  ) {}

  async setReminder(
    taskId: string,
    userId: string,
    remindAt: Date,
    type: ReminderType = ReminderType.PUSH,
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
        this.logger.error(`Failed to send reminder ${reminder.id}: ${error.message}`);
        reminder.status = ReminderStatus.FAILED;
        reminder.deliveryTracking = { error: error.message, timestamp: new Date() };
        await this.reminderRepository.save(reminder);
      }
    }

    return processedCount;
  }

  private async sendReminder(reminder: TaskReminder): Promise<void> {
    const { user, task, type } = reminder;
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
          `Reminder: Your health task "${taskTitle}" is due now!`,
        );
        break;
      case ReminderType.PUSH:
      default:
        success = await this.notificationService.sendPush(
          userId,
          'Task Reminder',
          `Time to work on your task: ${taskTitle}`,
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
}
