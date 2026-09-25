import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditLog } from './entities/audit-log.entity';
import { AuthEventLog } from '../database/entities/auth-event.entity';
import { AuthEventAuditService } from './services/auth-event-audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, AuthEventLog])],
  controllers: [AuditController],
  providers: [AuditService, AuthEventAuditService],
  exports: [AuditService, AuthEventAuditService],
})
export class AuditModule {}
