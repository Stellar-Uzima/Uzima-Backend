import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../../notifications/entities/notification.entity';
import { NotificationPreference } from '../../../notifications/entities/notification-preference.entity';
import { HealthTask } from '../../../tasks/entities/health-task.entity';

export type TaskNotificationEvent = 'due_soon' | 'completed' | 'shared' | 'overdue';

export interface NotificationDeliveryRecord {
  id: string;
  userId: string;
  taskId: string;
  event: TaskNotificationEvent;
  deliveredAt: Date;
  success: boolean;
}

const DUE_SOON_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class TaskNotificationsService {
  private readonly logger = new Logger(TaskNotificationsService.name);
  private readonly deliveryLog: NotificationDeliveryRecord[] = [];
  private counter = 0;

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepo: Repository<NotificationPreference>,
  ) {}

  async notifyDueSoon(task: HealthTask, userId: string): Promise<void> {
    if (!await this.isEnabled(userId, 'due_soon')) return;

    await this.send(userId, task.id, 'due_soon', {
      title: `Task due soon: ${task.title}`,
      body: `Your task "${task.title}" is due within 24 hours.`,
    });
  }

  async notifyCompleted(task: HealthTask, userId: string): Promise<void> {
    if (!await this.isEnabled(userId, 'completed')) return;

    await this.send(userId, task.id, 'completed', {
      title: `Task completed: ${task.title}`,
      body: `Great job! You completed "${task.title}".${task.xlmReward ? ` You earned ${task.xlmReward} XLM.` : ''}`,
    });
  }

  async notifyShared(task: HealthTask, recipientId: string, sharedByName: string): Promise<void> {
    if (!await this.isEnabled(recipientId, 'shared')) return;

    await this.send(recipientId, task.id, 'shared', {
      title: `Task shared with you`,
      body: `${sharedByName} shared the task "${task.title}" with you.`,
    });
  }

  async notifyOverdue(task: HealthTask, userId: string): Promise<void> {
    if (!await this.isEnabled(userId, 'overdue')) return;

    await this.send(userId, task.id, 'overdue', {
      title: `Overdue task: ${task.title}`,
      body: `Your task "${task.title}" is overdue. Please complete it as soon as possible.`,
    });
  }

  async checkAndNotifyDueSoon(tasks: HealthTask[], userId: string): Promise<void> {
    const now = Date.now();

    for (const task of tasks) {
      const dueDate = (task.targetProfile as any)?.dueDate;
      if (!dueDate || task.status === 'completed') continue;

      const due = new Date(dueDate).getTime();
      const diff = due - now;

      if (diff > 0 && diff <= DUE_SOON_THRESHOLD_MS) {
        await this.notifyDueSoon(task, userId);
      } else if (diff < 0) {
        await this.notifyOverdue(task, userId);
      }
    }
  }

  getDeliveryLog(userId?: string): NotificationDeliveryRecord[] {
    if (userId) return this.deliveryLog.filter((r) => r.userId === userId);
    return [...this.deliveryLog];
  }

  private async isEnabled(userId: string, event: TaskNotificationEvent): Promise<boolean> {
    const pref = await this.preferenceRepo.findOne({ where: { userId } } as any);
    if (!pref) return true;

    const key = `task_${event}` as keyof typeof pref;
    return pref[key] !== false;
  }

  private async send(
    userId: string,
    taskId: string,
    event: TaskNotificationEvent,
    content: { title: string; body: string },
  ): Promise<void> {
    const alreadySent = this.deliveryLog.some(
      (r) =>
        r.userId === userId &&
        r.taskId === taskId &&
        r.event === event &&
        Date.now() - r.deliveredAt.getTime() < 60 * 60 * 1000,
    );

    if (alreadySent) return;

    try {
      await this.notificationRepo.save(
        this.notificationRepo.create({
          userId,
          type: `task_${event}`,
          title: content.title,
          body: content.body,
        }),
      );

      this.deliveryLog.push({
        id: `notif_${++this.counter}`,
        userId,
        taskId,
        event,
        deliveredAt: new Date(),
        success: true,
      });

      this.logger.log(`Notification sent: userId=${userId} event=${event} taskId=${taskId}`);
    } catch (err) {
      this.deliveryLog.push({
        id: `notif_${++this.counter}`,
        userId,
        taskId,
        event,
        deliveredAt: new Date(),
        success: false,
      });
      this.logger.error(`Failed to send notification: ${err}`);
    }
  }
}
