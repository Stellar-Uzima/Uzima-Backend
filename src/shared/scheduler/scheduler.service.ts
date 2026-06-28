import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private schedulerRegistry: SchedulerRegistry) {}

  onModuleInit() {
    this.logger.log('Scheduler Service initialized');
  }

  /**
   * Adds a new cron job dynamically.
   * @param name Unique name for the job
   * @param cronExpression standard cron expression (e.g. '0 0 * * *')
   * @param callback function to execute
   */
  addCronJob(name: string, cronExpression: string, callback: () => Promise<void>) {
    const job = new CronJob(cronExpression, async () => {
      this.logger.log(`Executing scheduled job: ${name}`);
      try {
        await callback();
        this.logger.log(`Job ${name} completed successfully`);
      } catch (error: any) {
        this.logger.error(`Job ${name} failed: ${error.message}`);
      }
    });

    this.schedulerRegistry.addCronJob(name, job);
    job.start();

    this.logger.log(`Job ${name} scheduled with expression: ${cronExpression}`);
  }

  /**
   * Removes a scheduled job.
   */
  deleteJob(name: string) {
    this.schedulerRegistry.deleteCronJob(name);
    this.logger.log(`Job ${name} deleted`);
  }

  /**
   * Lists all active jobs.
   */
  getJobs() {
    const jobs = this.schedulerRegistry.getCronJobs();
    return Array.from(jobs.keys()).map(name => {
      const job = jobs.get(name);
      let nextRun;
      try {
        nextRun = job.nextDate().toISO();
      } catch (e) {
        nextRun = 'error/not scheduled';
      }
      return {
        name,
        nextRun,
        lastRun: job.lastDate(),
        isRunning: job.running,
      };
    });
  }

  /**
   * Utility to run a job immediately.
   */
  async runJobNow(name: string) {
    const job = this.schedulerRegistry.getCronJob(name);
    if (job) {
      this.logger.log(`Manually triggering job: ${name}`);
      // CronJob internal reference might vary, but we can usually access the callback
      // or just wait for the next tick if needed. 
      // For standard usage, jobs usually wrap logic that can be called directly from their service.
      job.fireOnTick();
    } else {
      throw new Error(`Job ${name} not found`);
    }
  }
}
