import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserStatsDto } from './dto/user-stats.dto';
import { TaskCompletion } from '../tasks/entities/task-completion.entity';
import { Coupon, CouponStatus } from '../entities/coupon.entity';
import { HealthProfile } from './entities/health-profile.entity';
import { UserStatusLog } from '../entities/user-status-log.entity';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(TaskCompletion)
    private taskCompletionRepository: Repository<TaskCompletion>,
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
    @InjectRepository(HealthProfile)
    private healthProfileRepository: Repository<HealthProfile>,
    @InjectRepository(UserStatusLog)
    private userStatusLogRepository: Repository<UserStatusLog>,
  ) {}

  async onModuleInit() {
    this.logger.log('UsersService initialized');
  }

  // ... rest of your service methods
}