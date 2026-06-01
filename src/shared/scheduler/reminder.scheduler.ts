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

import { TaskService }
  from "../../tasks/task.service";

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

    private readonly taskService: TaskService,

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

      const tasks =
        await this.taskService.findIncompleteTasks(
          user.id,
        );

      if (
        tasks.length === 0
      ) {
        continue;
      }

      await this.notificationService.sendPendingTaskDigest(
        {
          userId:
            user.id,

          tasks,
        },
      );
    }

    this.logger.log(
      `Processed ${users.length} task digests`,
    );
  }
}