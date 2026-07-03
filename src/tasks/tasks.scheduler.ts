import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { TaskAssignmentService } from './assignment/task-assignment.service';
import { RecurringTaskService } from './assignment/recurring-task.service';
import { ReminderService } from '../modules/health-tasks/services/reminder.service';
import { HealthTask } from './entities/health-task.entity';
import { TasksService } from './tasks.service';

@Injectable()
export class TasksScheduler {
  private readonly logger = new Logger(TasksScheduler.name);

  constructor(
    private readonly userRepository: Repository<User>,
    private readonly taskAssignmentService: TaskAssignmentService,
    private readonly reminderService: ReminderService,
    private readonly recurringTaskService: RecurringTaskService,
  ) {}

  @Cron('0 0 6 * * *')
  async assignDailyTasks(): Promise<void> {
    this.logger.log('Starting daily task assignment cron job');
    try {
      const activeUsers = await this.userRepository.find({ where: { isActive: true } });
      this.logger.log(`Found ${activeUsers.length} active users to assign tasks to`);
      let processedCount = 0;
      let errorCount = 0;
      for (const user of activeUsers) {
        try {
          await this.taskAssignmentService.getTodayAssignment(user);
          processedCount++;
        } catch (error: any) {
          this.logger.error(`Failed to assign tasks to user ${user.id}: ${error.message}`);
          errorCount++;
        }
      }
      this.logger.log(`Daily task assignment completed. Processed: ${processedCount}, Errors: ${errorCount}`);
    } catch (error: any) {
      this.logger.error(`Daily task assignment cron job failed: ${error.message}`, error.stack);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processReminders(): Promise<void> {
    this.logger.debug('Starting task reminder processing cron job');
    try {
      const count = await this.reminderService.processDueReminders();
      if (count > 0) {
        this.logger.log(`Processed ${count} task reminders`);
      }
    } catch (error: any) {
      this.logger.error(`Task reminder processing failed: ${error.message}`, error.stack);
    }
  }

  @Cron('0 0 0 * * *')
  async generateRecurringAssignments(): Promise<void> {
    this.logger.log('Running recurring task generation at midnight');
    const today = new Date().toISOString().split('T')[0];
    await this.recurringTaskService.generateAssignmentsForDate(today);
  }

  async assignDailyTasksManually(): Promise<{ processed: number; errors: number }> {
    this.logger.log('Manually triggering daily task assignment');
    const activeUsers = await this.userRepository.find({ where: { isActive: true } });
    this.logger.log(`Found ${activeUsers.length} active users to assign tasks to`);
    let processedCount = 0;
    let errorCount = 0;
    for (const user of activeUsers) {
      try {
        await this.taskAssignmentService.getTodayAssignment(user);
        processedCount++;
      } catch (error: any) {
        this.logger.error(`Failed to assign tasks to user ${user.id}: ${error.message}`);
        errorCount++;
      }
    }
    this.logger.log(`Manual task assignment completed. Processed: ${processedCount}, Errors: ${errorCount}`);
    return { processed: processedCount, errors: errorCount };
  }
}