import {
  Test,
} from "@nestjs/testing";

import {
  ReminderScheduler,
} from "./reminder.scheduler";

import { Injectable, Logger, Module } from "@nestjs/common";
import { CouponService } from "../../coupons/coupon.service";
import { TasksService } from "../../tasks/tasks.service";
import { NotificationService } from "../notifications/services/notification.service";
import { Repository } from "typeorm";
import { HealthTask } from "../../tasks/entities/health-task.entity";
import { DailyTaskAssignment } from "../../tasks/entities/daily-task-assignment.entity";
import {
  TaskCompletion,
  TaskCompletionStatus,
} from "../../tasks/entities/task-completion.entity";
import { QueueService } from "../queue/queue.service";
import { Coupon, CouponStatus } from "../../entities/coupon.entity";
import { Cron, ScheduleModule, SchedulerRegistry } from "@nestjs/schedule";
import { SchedulerModule } from "./scheduler.module";
import { CleanupScheduler } from "./cleanup.scheduler";
import { readFileSync } from "fs";
import { resolve } from "path";
import * as ts from "typescript";

jest.mock("../../entities/user.entity", () => ({ User: class User {} }));

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

    let logError: jest.SpyInstance;

    beforeEach(
      async () => {

        jest.clearAllMocks();
        logError = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
        couponService.findExpiringWithinHours.mockResolvedValue([]);
        taskService.findUsersWithPendingTasks.mockResolvedValue([]);

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
                  TasksService,
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

    afterEach(() => jest.restoreAllMocks());

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
        expect(notificationService.sendCouponExpiryReminder).toHaveBeenCalledWith({
          userId: "user-1",
          couponId: "1",
          code: "SAVE20",
          expiresAt: expect.any(Date),
        });
      },
    );

    it(
      "sends task digest",
      async () => {

        taskService.findUsersWithPendingTasks.mockResolvedValue(
          [
            {
              id: "user-1",
              tasks: [{ id: "task-1", title: "Review Profile" }],
            },
            { id: "user-2", tasks: [] },
          ],
        );

        await scheduler.sendPendingTaskDigest();

        expect(
          notificationService.sendPendingTaskDigest,
        ).toHaveBeenCalledTimes(
          1,
        );
        expect(notificationService.sendPendingTaskDigest).toHaveBeenCalledWith({
          userId: "user-1",
          tasks: [{ id: "task-1", title: "Review Profile" }],
        });
        expect(taskService.findIncompleteTasks).not.toHaveBeenCalled();
      },
    );
    it("handles empty batches without sending notifications", async () => {
      await scheduler.sendCouponExpiryReminders();
      await scheduler.sendPendingTaskDigest();
      expect(couponService.findExpiringWithinHours).toHaveBeenCalledWith(24);
      expect(notificationService.sendCouponExpiryReminder).not.toHaveBeenCalled();
      expect(notificationService.sendPendingTaskDigest).not.toHaveBeenCalled();
    });

    it("logs a failed coupon delivery and continues to the next user", async () => {
      couponService.findExpiringWithinHours.mockResolvedValue([
        { id: "coupon-1", userId: "user-1" },
        { id: "coupon-2", userId: "user-2" },
      ]);
      notificationService.sendCouponExpiryReminder.mockRejectedValueOnce(
        new Error("delivery failed"),
      );
      await scheduler.sendCouponExpiryReminders();
      expect(notificationService.sendCouponExpiryReminder).toHaveBeenCalledTimes(2);
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining("user-1: delivery failed"),
      );
    });

    it("logs a failed digest and continues to the next user", async () => {
      taskService.findUsersWithPendingTasks.mockResolvedValue([
        { id: "user-1", tasks: [{ id: "task-1" }] },
        { id: "user-2", tasks: [{ id: "task-2" }] },
      ]);
      notificationService.sendPendingTaskDigest.mockRejectedValueOnce(
        new Error("delivery failed"),
      );
      await scheduler.sendPendingTaskDigest();
      expect(notificationService.sendPendingTaskDigest).toHaveBeenCalledTimes(2);
      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining("user-1: delivery failed"),
      );
    });

  },
);

describe("TasksService pending assignment queries", () => {
  const query = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getOne: jest.fn(),
  };
  const assignmentRepository = { createQueryBuilder: jest.fn(() => query) };
  const manager = { getRepository: jest.fn(() => assignmentRepository) };
  let service: TasksService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-11-22T23:30:00Z"));
    service = new TasksService(
      { manager } as unknown as Repository<HealthTask>,
      {} as QueueService,
    );
  });

  afterEach(() => jest.useRealTimers());

  function expectPendingQuery() {
    expect(manager.getRepository).toHaveBeenCalledWith(DailyTaskAssignment);
    expect(query.innerJoinAndSelect).toHaveBeenCalledWith(
      "assignment.tasks",
      "task",
    );
    expect(query.where).toHaveBeenCalledWith(
      "assignment.assignedDate = :today",
      {
        today: "2026-11-22",
      },
    );
    expect(query.leftJoin).toHaveBeenCalledWith(
      TaskCompletion,
      "completion",
      expect.stringContaining(
        "completion.userId = user.id AND completion.taskId = task.id",
      ),
      {
        verified: TaskCompletionStatus.VERIFIED,
        start: new Date("2026-11-22T00:00:00Z"),
        end: new Date("2026-11-23T00:00:00Z"),
      },
    );
    const condition = query.leftJoin.mock.calls[0][2] as string;
    expect(condition).toContain(
      "(completion.status = :verified OR completion.isCompleted = true)",
    );
    expect(condition).toContain(
      "COALESCE(completion.completedAt, completion.createdAt) >= :start",
    );
    expect(condition).toContain(
      "COALESCE(completion.completedAt, completion.createdAt) < :end",
    );
    expect(query.andWhere).toHaveBeenCalledWith("completion.id IS NULL");
  }

  it("fetches today’s users and incomplete tasks together with completed tasks excluded", async () => {
    const tasks = [{ id: "pending-task" }];
    query.getMany.mockResolvedValue([{ user: { id: "user-1" }, tasks }]);
    await expect(service.findUsersWithPendingTasks()).resolves.toEqual([
      { id: "user-1", tasks },
    ]);
    expectPendingQuery();
    expect(query.getMany).toHaveBeenCalledTimes(1);
  });

  it("returns no users when there are no pending assignments today", async () => {
    query.getMany.mockResolvedValue([]);
    await expect(service.findUsersWithPendingTasks()).resolves.toEqual([]);
  });

  it("restricts incomplete tasks to the requested user and UTC day", async () => {
    const tasks = [{ id: "pending-task" }];
    query.getOne.mockResolvedValue({ tasks });
    await expect(service.findIncompleteTasks("user-1")).resolves.toEqual(tasks);
    expectPendingQuery();
    expect(query.andWhere).toHaveBeenCalledWith("user.id = :userId", {
      userId: "user-1",
    });
  });

  it("returns no tasks for missing, other-day or fully completed assignments", async () => {
    query.getOne.mockResolvedValue(null);
    await expect(service.findIncompleteTasks("user-1")).resolves.toEqual([]);
  });

  it.each(["findUsersWithPendingTasks", "findIncompleteTasks"] as const)(
    "propagates query errors from %s",
    async (method) => {
      query.getMany.mockRejectedValue(new Error("database unavailable"));
      query.getOne.mockRejectedValue(new Error("database unavailable"));
      await expect(service[method]("user-1")).rejects.toThrow(
        "database unavailable",
      );
    },
  );
});

describe("CouponService expiry window", () => {
  const query = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  let service: CouponService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-11-22T08:00:00Z"));
    service = Object.create(CouponService.prototype) as CouponService;
    Object.assign(service, {
      couponRepository: {
        createQueryBuilder: () => query,
      } as unknown as Repository<Coupon>,
    });
  });

  afterEach(() => jest.useRealTimers());

  it("selects only active, unused coupons in (now, now + hours]", async () => {
    const coupons = [{ id: "coupon-1" }];
    query.getMany.mockResolvedValue(coupons);
    await expect(service.findExpiringWithinHours(24)).resolves.toEqual(coupons);
    expect(query.where).toHaveBeenCalledWith("coupon.status = :status", {
      status: CouponStatus.ACTIVE,
    });
    expect(query.andWhere).toHaveBeenCalledWith("coupon.usedAt IS NULL");
    expect(query.andWhere).toHaveBeenCalledWith("coupon.redeemedCount = 0");
    expect(query.andWhere).toHaveBeenCalledWith("coupon.expiresAt > :now", {
      now: new Date("2026-11-22T08:00:00Z"),
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      "coupon.expiresAt <= :expiresBy",
      {
        expiresBy: new Date("2026-11-23T08:00:00Z"),
      },
    );
    expect(query.orderBy).toHaveBeenCalledWith("coupon.expiresAt", "ASC");
  });

  it("returns an empty result when no coupons match", async () => {
    query.getMany.mockResolvedValue([]);
    await expect(service.findExpiringWithinHours(1)).resolves.toEqual([]);
  });

  it.each([0, -1, NaN, Infinity])(
    "rejects invalid hour window %s",
    async (hours) => {
      await expect(service.findExpiringWithinHours(hours)).rejects.toThrow(
        "Expiry window",
      );
      expect(query.getMany).not.toHaveBeenCalled();
    },
  );

  it("surfaces database failures", async () => {
    query.getMany.mockRejectedValue(new Error("database unavailable"));
    await expect(service.findExpiringWithinHours(24)).rejects.toThrow(
      "database unavailable",
    );
  });
});

jest.mock("./cleanup.scheduler", () => ({
  CleanupScheduler: class CleanupScheduler {},
}));
jest.mock("../../modules/users/users.module", () => {
  const { Module } = jest.requireActual("@nestjs/common");
  class UsersModule {}
  Module({})(UsersModule);
  return { UsersModule };
});
jest.mock("../../tasks/tasks.module", () => {
  const { Module } = jest.requireActual("@nestjs/common");
  const { TasksService } = jest.requireActual("../../tasks/tasks.service");
  class TasksModule {}
  Module({
    providers: [{ provide: TasksService, useValue: {} }],
    exports: [TasksService],
  })(TasksModule);
  return { TasksModule };
});
jest.mock("../../coupons/coupon.module", () => {
  const { Module } = jest.requireActual("@nestjs/common");
  const { CouponService } = jest.requireActual("../../coupons/coupon.service");
  class CouponModule {}
  Module({
    providers: [{ provide: CouponService, useValue: {} }],
    exports: [CouponService],
  })(CouponModule);
  return { CouponModule };
});
jest.mock("../../notifications/notifications.module", () => {
  const { Module } = jest.requireActual("@nestjs/common");
  const { NotificationService } = jest.requireActual(
    "../notifications/services/notification.service",
  );
  class NotificationsModule {}
  Module({
    providers: [{ provide: NotificationService, useValue: {} }],
    exports: [NotificationService],
  })(NotificationsModule);
  return { NotificationsModule };
});

describe("SchedulerModule reminder registration", () => {
  it("resolves module-exported dependencies and registers both reminder crons", async () => {
    const module = await Test.createTestingModule({
      imports: [SchedulerModule],
    })
      .overrideProvider(CleanupScheduler)
      .useValue({})
      .compile();
    try {
      await module.init();
      expect(module.get(ReminderScheduler)).toBeInstanceOf(ReminderScheduler);
      expect(module.get(TasksService)).toBeDefined();
      expect(module.get(CouponService)).toBeDefined();
      expect(module.get(NotificationService)).toBeDefined();
      expect(module.get(SchedulerRegistry).getCronJobs().size).toBe(2);
    } finally {
      await module.close();
    }
  });
});

function moduleEntries(file: string, section: string): string[] {
  const path = resolve(__dirname, "../..", file);
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  let entries: string[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "Module" &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      for (const property of node.arguments[0].properties) {
        if (
          ts.isPropertyAssignment(property) &&
          property.name.getText(source) === section &&
          ts.isArrayLiteralExpression(property.initializer)
        ) {
          entries = property.initializer.elements.map((entry) => entry.getText(source));
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return entries;
}

describe("Scheduler provider ownership", () => {
  it("shares the canonical TasksScheduler with the reachable admin module", () => {
    expect(moduleEntries("app.module.ts", "imports")).toEqual(
      expect.arrayContaining(["SchedulerModule", "AdminModule"]),
    );
    const providers = ["tasks/tasks.module.ts", "modules/admin/admin.module.ts"].filter((file) =>
      moduleEntries(file, "providers").includes("TasksScheduler"),
    );
    expect(providers).toEqual(["tasks/tasks.module.ts"]);
    expect(moduleEntries("tasks/tasks.module.ts", "exports")).toContain("TasksScheduler");
    expect(moduleEntries("modules/admin/admin.module.ts", "imports")).toContain("TasksModule");
    expect(moduleEntries("shared/scheduler/scheduler.module.ts", "imports")).toContain("TasksModule");
  });

  it("does not duplicate cron discovery for identical ScheduleModule roots", async () => {
    @Injectable()
    class CronProbe {
      @Cron("0 8 * * *")
      tick() {}
    }

    @Module({ imports: [ScheduleModule.forRoot()], providers: [CronProbe] })
    class ProviderModule {}

    const module = await Test.createTestingModule({
      imports: [ProviderModule, ScheduleModule.forRoot()],
    }).compile();
    try {
      await module.init();
      expect(module.get(SchedulerRegistry).getCronJobs().size).toBe(1);
    } finally {
      await module.close();
    }
  });
});
