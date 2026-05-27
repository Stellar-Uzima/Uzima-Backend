import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthModule } from '@/health/health.module';
import { HealthTasksModule } from '@modules/health-tasks/health-tasks.module';
import { TaskAssignmentModule } from '@/tasks/assignment/task-assignment.module';
import { AuditModule } from '@/audit/audit.module';
import { AuthModule } from '@modules/auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminService } from './services/admin.service';
import { AdminUsersService } from './services/admin-users.service';
import { User } from '@/entities/user.entity';
import { TaskCompletion } from '@/tasks/entities/task-completion.entity';
import { RewardTransaction } from '@/rewards/entities/reward-transaction.entity';
import { TasksScheduler } from '@/tasks/tasks.scheduler';
import { RewardsScheduler } from '@/rewards/rewards.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, TaskCompletion, RewardTransaction]),
    AuditModule,
    TaskAssignmentModule,
    HealthTasksModule,
    HealthModule,
    AuthModule,
  ],
  controllers: [AdminController, AdminUsersController],
  providers: [AdminService, AdminUsersService, TasksScheduler, RewardsScheduler],
})
export class AdminModule {}
