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
}
