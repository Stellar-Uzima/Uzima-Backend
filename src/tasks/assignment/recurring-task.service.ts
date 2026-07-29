import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Recurrence, HealthTask } from '../entities/health-task.entity';
import { DailyTaskAssignment } from '../entities/daily-task-assignment.entity';
import { User } from '../../entities/user.entity';

/**
 * Service responsible for generating recurring task assignments.
 * It creates daily task assignments for tasks that have a recurrence pattern.
 */
@Injectable()
export class RecurringTaskService {
  private readonly logger = new Logger(RecurringTaskService.name);

  constructor(
    @InjectRepository(HealthTask)
    private readonly healthTaskRepo: Repository<HealthTask>,
    @InjectRepository(DailyTaskAssignment)
    private readonly assignmentRepo: Repository<DailyTaskAssignment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Generate assignments for all users for a given date.
   * Handles DAILY, WEEKLY, and MONTHLY recurrence patterns.
   */
  async generateAssignmentsForDate(date: string): Promise<void> {
    this.logger.log(`Generating recurring assignments for ${date}`);

    const recurringTasks = await this.healthTaskRepo.find({
      where: {
        isActive: true,
        recurrence: Not(Recurrence.NONE),
      },
    });

    if (recurringTasks.length === 0) {
      this.logger.debug('No recurring tasks found');
      return;
    }

    const activeUsers = await this.userRepo.find({ where: { isActive: true } });

    for (const user of activeUsers) {
      await this.ensureAssignments(user, date, recurringTasks);
    }
  }

  /**
   * Ensure a DailyTaskAssignment exists for the user/date and includes applicable tasks.
   */
  private async ensureAssignments(
    user: User,
    date: string,
    tasks: HealthTask[],
  ): Promise<void> {
    let assignment = await this.assignmentRepo.findOne({
      where: { user: { id: user.id }, assignedDate: date },
      relations: ['tasks'],
    });

    const applicableTasks = tasks.filter((task) => this.shouldAssign(task, date));
    if (applicableTasks.length === 0) {
      return; // nothing to assign
    }

    if (!assignment) {
      assignment = this.assignmentRepo.create({
        user,
        assignedDate: date,
        tasks: applicableTasks,
      });
      await this.assignmentRepo.save(assignment);
      this.logger.debug(`Created assignment for user ${user.id} on ${date}`);
    } else {
      // Add any missing tasks to existing assignment
      const existingIds = new Set(assignment.tasks.map((t) => t.id));
      const newTasks = applicableTasks.filter((t) => !existingIds.has(t.id));
      if (newTasks.length > 0) {
        assignment.tasks = [...assignment.tasks, ...newTasks];
        await this.assignmentRepo.save(assignment);
        this.logger.debug(
          `Updated assignment for user ${user.id} on ${date} with ${newTasks.length} new tasks`,
        );
      }
    }
  }

  /**
   * Determine whether a task should be assigned on the given date based on its recurrence.
   */
  private shouldAssign(task: HealthTask, date: string): boolean {
    const utcDate = new Date(date + 'T00:00:00Z');
    switch (task.recurrence) {
      case Recurrence.DAILY:
        return true;
      case Recurrence.WEEKLY:
        // Assign on Monday (UTC) for weekly tasks
        return utcDate.getUTCDay() === 1;
      case Recurrence.MONTHLY:
        // Assign on the first day of month
        return utcDate.getUTCDate() === 1;
      default:
        return false;
    }
  }

  /**
   * Backfill missed recurring assignments for a range of dates.
   *
   * This is useful after server downtime or scheduler restarts where the
   * nightly `generateRecurringAssignments` cron may have been skipped.
   *
   * @param since - Start date (ISO string, e.g. '2026-07-25') for the backfill.
   *                Defaults to 7 days ago if not provided.
   * @returns The number of dates that were backfilled.
   *
   * @example
   * // Backfill the last 3 days
   * const count = await service.backfillMissedAssignments('2026-07-26');
   */
  async backfillMissedAssignments(since?: string): Promise<number> {
    const daysToBackfill = 7;
    const today = new Date();
    let startDate: Date;

    if (since) {
      startDate = new Date(since + 'T00:00:00Z');
    } else {
      startDate = new Date(today);
      startDate.setUTCDate(startDate.getUTCDate() - daysToBackfill);
    }

    this.logger.log(
      `Starting backfill for recurring assignments from ${startDate.toISOString().split('T')[0]} to ${today.toISOString().split('T')[0]}`,
    );

    let backfilledCount = 0;
    const current = new Date(startDate);

    while (current <= today) {
      const dateStr = current.toISOString().split('T')[0];

      try {
        await this.generateAssignmentsForDate(dateStr);
        backfilledCount++;
      } catch (error) {
        this.logger.error(
          `Backfill failed for date ${dateStr}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Advance by one day
      current.setUTCDate(current.getUTCDate() + 1);
    }

    this.logger.log(
      `Backfill complete. Processed ${backfilledCount} dates.`,
    );

    return backfilledCount;
  }
}
