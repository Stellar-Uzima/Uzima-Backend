import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadgeService } from './badge.service';
import { BadgeController } from './badge.controller';
import { Badge } from '../../database/entities/badge.entity';
import { UserBadge } from '../../database/entities/user-badge.entity';
import { User } from '../../database/entities/user.entity';
import { Streak } from '../../streaks/entities/streak.entity';
import { TaskCompletion } from '../../task-completion/entities/task-completion.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Badge, UserBadge, User, Streak, TaskCompletion])],
  controllers: [BadgeController],
  providers: [BadgeService],
  exports: [BadgeService, TypeOrmModule],
})
export class BadgeModule implements OnModuleInit {
  constructor(private readonly badgeService: BadgeService) {}

  async onModuleInit() {
    // Initialize default badges on module startup
    await this.badgeService.initializeBadges();
  }
}
