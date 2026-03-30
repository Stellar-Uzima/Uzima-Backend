import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from '../auth/services/users.service';
import { User } from '../entities/user.entity';
import { AdminUsersController } from './admin-user.controller';
import { AdminUsersService } from './services/admin-users.service';
import { AuditModule } from '../audit/audit.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { TasksScheduler } from '../tasks/tasks.scheduler';
import { TaskAssignmentModule } from '../tasks/assignment/task-assignment.module';
import { RewardModule } from '../rewards/reward.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    AuditModule,
    TaskAssignmentModule,
    RewardModule,
  ],
  controllers: [AdminUsersController, AdminController],
  providers: [AdminUsersService, UsersService, AdminService, TasksScheduler],
})
export class AdminModule {}
