import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthEventLog } from '../../database/entities/auth-event.entity';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { RetentionJobRun } from './entities/retention-job-run.entity';
import { RetentionLegalHold } from './entities/retention-legal-hold.entity';
import { RetentionService } from './retention.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserStatusLog, AuthEventLog, RetentionJobRun, RetentionLegalHold]),
  ],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
