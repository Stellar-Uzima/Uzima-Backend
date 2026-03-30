import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreaksService } from './streaks.service';
import { Streak } from './entities/streak.entity';
import { User } from '../entities/user.entity';
import { TaskCompletion } from '../tasks/entities/task-completion.entity';
import { StreaksController } from './streaks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Streak, User, TaskCompletion])],
  controllers: [StreaksController],
  providers: [StreaksService],
  exports: [StreaksService],
})
export class StreaksModule {}
