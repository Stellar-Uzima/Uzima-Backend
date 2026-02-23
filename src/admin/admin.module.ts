import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from 'src/auth/services/users.service';
import { User } from 'src/entities/user.entity';
import { AdminUsersController } from './admin-user.controller';
import { AdminUsersService } from './services/admin-users.service';
import { AuditService } from 'src/audit/audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, UsersService, AuditService],
})
export class AdminModule {}
