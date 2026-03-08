import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from '../auth/services/users.service';
import { User } from '../entities/user.entity';
import { AdminUsersController } from './admin-user.controller';
import { AdminUsersService } from './services/admin-users.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuditModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, UsersService],
})
export class AdminModule {}
