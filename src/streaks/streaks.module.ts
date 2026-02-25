import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreaksService } from './streaks.service';
import { Streak } from './entities/streak.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Streak, User])],
  providers: [StreaksService],
  exports: [StreaksService],
})
export class StreaksModule {}
