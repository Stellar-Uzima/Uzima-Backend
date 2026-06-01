import {
  Test,
} from "@nestjs/testing";

import {
  ReminderScheduler,
} from "./reminder.scheduler";

describe(
  "ReminderScheduler",
  () => {

    let scheduler:
      ReminderScheduler;

    const couponService = {
      findExpiringWithinHours:
        jest.fn(),
    };

    const taskService = {
      findUsersWithPendingTasks:
        jest.fn(),

      findIncompleteTasks:
        jest.fn(),
    };

    const notificationService = {
      sendCouponExpiryReminder:
        jest.fn(),

      sendPendingTaskDigest:
        jest.fn(),
    };

    beforeEach(
      async () => {

        const module =
          await Test.createTestingModule({
            providers: [
              ReminderScheduler,
              {
                provide:
                  CouponService,
                useValue:
                  couponService,
              },
              {
                provide:
                  TaskService,
                useValue:
                  taskService,
              },
              {
                provide:
                  NotificationService,
                useValue:
                  notificationService,
              },
            ],
          }).compile();

        scheduler =
          module.get(
            ReminderScheduler,
          );
      },
    );

    it(
      "sends coupon reminders",
      async () => {

        couponService.findExpiringWithinHours.mockResolvedValue(
          [
            {
              id: "1",
              userId:
                "user-1",
              code:
                "SAVE20",
              expiresAt:
                new Date(),
            },
          ],
        );

        await scheduler.sendCouponExpiryReminders();

        expect(
          notificationService.sendCouponExpiryReminder,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "sends task digest",
      async () => {

        taskService.findUsersWithPendingTasks.mockResolvedValue(
          [
            {
              id: "user-1",
            },
          ],
        );

        taskService.findIncompleteTasks.mockResolvedValue(
          [
            {
              id: "task-1",
              title:
                "Review Profile",
            },
          ],
        );

        await scheduler.sendPendingTaskDigest();

        expect(
          notificationService.sendPendingTaskDigest,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);