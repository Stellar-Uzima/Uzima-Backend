import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { HealthProfile } from '../entities/health-profile.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { UpdateHealthProfileDto } from './dto/health-profile.dto';

@Injectable()
export class HealthProfileService {
  constructor(
    @InjectRepository(HealthProfile)
    private readonly healthProfileRepo: Repository<HealthProfile>,
  ) {}

  async createForUser(user: User): Promise<HealthProfile> {
    const profile = this.healthProfileRepo.create({
      user,
      healthGoals: [],
      preferredHealerType: 'BOTH',
      dailyTaskTarget: 3,
    });
    return this.healthProfileRepo.save(profile);
  }

  async getProfileByUserId(userId: string): Promise<HealthProfile> {
    const profile = await this.healthProfileRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!profile) throw new NotFoundException('Health profile not found');
    return profile;
  }

  async updateProfile(userId: string, dto: UpdateHealthProfileDto): Promise<HealthProfile> {
    const profile = await this.getProfileByUserId(userId);
    Object.assign(profile, dto);
    return this.healthProfileRepo.save(profile);
  }
}