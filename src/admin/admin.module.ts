import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from 'src/auth/services/users.service';
import { User } from 'src/entities/user.entity';
import { AdminUsersController } from './admin-user.controller';
import { AdminUsersService } from './services/admin-users.service';
import { AuditModule } from 'src/audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuditModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, UsersService],
})
export class AdminModule {}
