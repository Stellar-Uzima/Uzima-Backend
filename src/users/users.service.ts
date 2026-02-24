import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { createClient, RedisClientType } from 'redis';
import { User } from '../entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserStatsDto } from './dto/user-stats.dto';
import { TaskCompletion } from './entities/task-completion.entity';
import { Coupon, CouponStatus } from './entities/coupon.entity';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);
  private redisClient: RedisClientType;
  private readonly CACHE_TTL = 300; // 5 minutes in seconds

  constructor(
    @InjectRepository(User)
    public readonly userRepository: Repository<User>,
  ) { }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
    });
  }

  /**
   * Get user profile by ID
   * Returns serialized UserResponseDto with password excluded
   */
  async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Use plainToInstance to serialize user data with @Exclude/@Expose decorators
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Update user profile
   * Uses whitelist: true to strip undefined properties
   */
  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update only provided fields (whitelist behavior is handled by DTO validation)
    Object.assign(user, updateProfileDto);

    const updatedUser = await this.userRepository.save(user);

    this.logger.log(`User profile updated: ${userId}`);

    // Return serialized response
    return plainToInstance(UserResponseDto, updatedUser, {
      excludeExtraneousValues: true,
    });
  }

  /**
   * Soft delete user account
   * Sets isActive to false and anonymizes email
   */
  async softDelete(userId: string): Promise<void> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Soft delete: set isActive to false
    user.isActive = false;

    // Anonymize email to allow re-registration with same email
    const anonymizedEmail = `deleted_${userId}_${Date.now()}@deleted.user`;
    user.email = anonymizedEmail;

    // Also anonymize phone number if exists
    if (user.phoneNumber) {
      user.phoneNumber = `deleted_${userId}_${Date.now()}`;
    }

    await this.userRepository.save(user);

    this.logger.log(`User account soft deleted: ${userId}`);
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
    });
  }

  /**
   * Find user by phone number
   */
  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { phoneNumber },
    });
  }

  /**
   * Create a new user
   */
  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  /**
   * Update last active timestamp
   */
  async updateLastActiveAt(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastActiveAt: new Date() });
  }
}
