import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class CleanupScheduler {
  private readonly logger = new Logger(CleanupScheduler.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleStatusLogsCleanup() {
    this.logger.log('Starting user status logs cleanup job...');
    try {
      const retentionDays = this.configService.get<number>(
        'STATUS_LOG_RETENTION_DAYS',
        90,
      );
      
      const deletedCount = await this.usersService.cleanupOldStatusLogs(
        Number(retentionDays),
      );
      
      this.logger.log(
        `Cleanup job completed successfully. Deleted ${deletedCount} old records.`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to cleanup user status logs: ${error.message}`);
    }
  }
}
