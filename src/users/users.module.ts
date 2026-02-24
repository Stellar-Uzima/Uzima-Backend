import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from '../entities/user.entity';
import { TaskCompletion } from './entities/task-completion.entity';
import { Coupon } from './entities/coupon.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, TaskCompletion, Coupon])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
