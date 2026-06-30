import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { HealthProfile } from '../entities/health-profile.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { UpdateHealthProfileDto } from './dto/health-profile.dto';
import { HealthProfileCompletionDto } from './dto/health-profile-completion.dto';

const OPTIONAL_PROFILE_FIELDS = [
  'healthGoals',
  'chronicConditions',
  'preferredHealerType',
  'dailyTaskTarget',
] as const;

type OptionalProfileField = (typeof OPTIONAL_PROFILE_FIELDS)[number];

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

  async updateProfile(
    userId: string,
    dto: UpdateHealthProfileDto,
  ): Promise<HealthProfile> {
    const profile = await this.getProfileByUserId(userId);
    Object.assign(profile, dto);
    return this.healthProfileRepo.save(profile);
  }

  getCompletionScore(userId: string): Promise<HealthProfileCompletionDto> {
    return this.getProfileByUserId(userId).then((profile) =>
      this.calculateCompletion(profile),
    );
  }

  calculateCompletion(profile: HealthProfile): HealthProfileCompletionDto {
    const missingFields: OptionalProfileField[] = [];

    for (const field of OPTIONAL_PROFILE_FIELDS) {
      if (!this.isFieldFilled(profile, field)) {
        missingFields.push(field);
      }
    }

    const filledCount = OPTIONAL_PROFILE_FIELDS.length - missingFields.length;
    const score = Math.round(
      (filledCount / OPTIONAL_PROFILE_FIELDS.length) * 100,
    );

    return { score, missingFields };
  }

  private isFieldFilled(
    profile: HealthProfile,
    field: OptionalProfileField,
  ): boolean {
    const value = profile[field];

    if (field === 'healthGoals') {
      return Array.isArray(value) && value.length > 0;
    }

    if (field === 'dailyTaskTarget') {
      return typeof value === 'number' && value > 0;
    }

    if (field === 'preferredHealerType') {
      return typeof value === 'string' && value.trim().length > 0;
    }

    return value !== null && value !== undefined && String(value).trim() !== '';
  }
}
