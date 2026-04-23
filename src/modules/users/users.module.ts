import { Module } from '@nestjs/common';
import { SettingsController } from './controllers/settings.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController, SettingsController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule { }
