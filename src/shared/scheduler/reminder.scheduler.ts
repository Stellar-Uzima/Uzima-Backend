import {
  Injectable,
  Logger,
} from "@nestjs/common";

import {
  Cron,
  CronExpression,
} from "@nestjs/schedule";

import { CouponService }
  from "../../coupons/coupon.service";

import { TasksService }
  from "../../tasks/tasks.service";

import { NotificationService }
  from "../notifications/services/notification.service";

@Injectable()
export class ReminderScheduler {

  private readonly logger =
    new Logger(
      ReminderScheduler.name,
    );

  constructor(
    private readonly couponService: CouponService,

    private readonly taskService: TasksService,

    private readonly notificationService:
      NotificationService,
  ) {}

  /**
   * Runs hourly to identify
   * coupons expiring within
   * the next 24 hours.
   */
  @Cron(
    CronExpression.EVERY_HOUR,
  )
  async sendCouponExpiryReminders() {

    const coupons =
      await this.couponService.findExpiringWithinHours(
        24,
      );

    for (const coupon of coupons) {

      try {
        await this.notificationService.sendCouponExpiryReminder(
          {
            userId:
              coupon.userId,

            couponId:
              coupon.id,

            expiresAt:
              coupon.expiresAt,

            code:
              coupon.code,
          },
        );
      } catch (error) {
        this.logger.error(
          `Coupon reminder failed for user ${coupon.userId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.log(
      `Processed ${coupons.length} coupon reminders`,
    );
  }

  /**
   * Daily digest
   * at 08:00 server time.
   */
  @Cron(
    "0 8 * * *",
  )
  async sendPendingTaskDigest() {

    const users =
      await this.taskService.findUsersWithPendingTasks();

    for (const user of users) {

      const tasks = user.tasks;

      if (
        tasks.length === 0
      ) {
        continue;
      }

      try {
        await this.notificationService.sendPendingTaskDigest(
          {
            userId:
              user.id,

            tasks,
          },
        );
      } catch (error) {
        this.logger.error(
          `Task digest failed for user ${user.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.log(
      `Processed ${users.length} task digests`,
    );
  }
}