import { Module } from '@nestjs/common';
import { SettingsController } from './controllers/settings.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { UserSearchService } from './services/user-search.service';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserStatusLog])],
  controllers: [UsersController, SettingsController],
  providers: [UsersService, UserSearchService],
  exports: [UsersService, UserSearchService],
})
export class UsersModule { }
