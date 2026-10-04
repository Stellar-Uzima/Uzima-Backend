import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../audit/entities/audit-log.entity';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { RetentionService } from './retention.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, UserStatusLog])],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
