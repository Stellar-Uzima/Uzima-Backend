import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { AuditLog } from '../../audit/entities/audit-log.entity';
import { UserStatusLog } from '../../entities/user-status-log.entity';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    @InjectRepository(AuditLog) private readonly auditLogs: Repository<AuditLog>,
    @InjectRepository(UserStatusLog) private readonly statusLogs: Repository<UserStatusLog>,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  purgeExpiredRecords(): Promise<{ auditLogs: number; statusLogs: number }> {
    return this.purge();
  }

  async purge(): Promise<{ auditLogs: number; statusLogs: number }> {
    const statusDays = this.config.get<number>('STATUS_LOG_RETENTION_DAYS', 90);
    const statusCutoff = new Date(Date.now() - Number(statusDays) * 86400000);
    const auditResult = await this.auditLogs
      .createQueryBuilder()
      .delete()
      .from(AuditLog)
      .where('retention_expires_at <= :now', { now: new Date() })
      .andWhere('is_compliance_event = false')
      .execute();
    const statusResult = await this.statusLogs.delete({ createdAt: LessThan(statusCutoff) });
    const result = { auditLogs: auditResult.affected || 0, statusLogs: statusResult.affected || 0 };
    this.logger.log(`Retention cleanup removed ${result.auditLogs} audit logs and ${result.statusLogs} status logs`);
    return result;
  }
}
