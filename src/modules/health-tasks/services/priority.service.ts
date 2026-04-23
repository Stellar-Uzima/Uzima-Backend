import { Injectable } from '@nestjs/common';

export enum TaskPriority {
  URGENT = 'urgent',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export type PrioritizableTask = {
  id?: string;
  title?: string;
  priority?: TaskPriority;
  dueDate?: Date | string | null;
};

@Injectable()
export class PriorityService {
  private static readonly PRIORITY_ORDER: Record<TaskPriority, number> = {
    [TaskPriority.URGENT]: 0,
    [TaskPriority.HIGH]: 1,
    [TaskPriority.MEDIUM]: 2,
    [TaskPriority.LOW]: 3,
  };

  resolvePriority(
    priority?: TaskPriority,
    dueDate?: Date | string | null,
    now: Date = new Date(),
  ): TaskPriority {
    if (priority) {
      return priority;
    }

    return this.autoPrioritize(dueDate, now);
  }

  autoPrioritize(
    dueDate?: Date | string | null,
    now: Date = new Date(),
  ): TaskPriority {
    if (!dueDate) {
      return TaskPriority.MEDIUM;
    }

    const parsedDueDate = dueDate instanceof Date ? dueDate : new Date(dueDate);
    if (Number.isNaN(parsedDueDate.getTime())) {
      return TaskPriority.MEDIUM;
    }

    const msUntilDue = parsedDueDate.getTime() - now.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const threeDaysMs = 3 * oneDayMs;
    const sevenDaysMs = 7 * oneDayMs;

    if (msUntilDue <= oneDayMs) {
      return TaskPriority.URGENT;
    }
    if (msUntilDue <= threeDaysMs) {
      return TaskPriority.HIGH;
    }
    if (msUntilDue <= sevenDaysMs) {
      return TaskPriority.MEDIUM;
    }

    return TaskPriority.LOW;
  }

  sortByPriority<T extends PrioritizableTask>(
    tasks: T[],
    now: Date = new Date(),
  ): T[] {
    return [...tasks].sort((left, right) => {
      const leftPriority = this.resolvePriority(left.priority, left.dueDate, now);
      const rightPriority = this.resolvePriority(
        right.priority,
        right.dueDate,
        now,
      );

      const byPriority =
        PriorityService.PRIORITY_ORDER[leftPriority] -
        PriorityService.PRIORITY_ORDER[rightPriority];

      if (byPriority !== 0) {
        return byPriority;
      }

      const leftDue = this.toTimestamp(left.dueDate);
      const rightDue = this.toTimestamp(right.dueDate);

      if (leftDue === null && rightDue === null) {
        return 0;
      }
      if (leftDue === null) {
        return 1;
      }
      if (rightDue === null) {
        return -1;
      }

      return leftDue - rightDue;
    });
  }

  buildOverdueAlert(
    task: PrioritizableTask,
    now: Date = new Date(),
  ): string | null {
    const dueDate = this.parseDueDate(task.dueDate);
    if (!dueDate) {
      return null;
    }

    if (dueDate.getTime() > now.getTime()) {
      return null;
    }

    const taskLabel = task.title ?? task.id ?? 'Task';
    return `Overdue alert: "${taskLabel}" was due on ${dueDate.toISOString()}.`;
  }

  private toTimestamp(value?: Date | string | null): number | null {
    const dueDate = this.parseDueDate(value);
    return dueDate ? dueDate.getTime() : null;
  }

  private parseDueDate(value?: Date | string | null): Date | null {
    if (!value) {
      return null;
    }
    const dueDate = value instanceof Date ? value : new Date(value);
    return Number.isNaN(dueDate.getTime()) ? null : dueDate;
  }
}
