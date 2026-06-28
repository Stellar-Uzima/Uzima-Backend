/**
 * Example Refactored Service Implementation
 * 
 * This file shows how to refactor a real service to use the TransactionService.
 * You can use this as a template for refactoring existing services.
 * 
 * Service: UserService
 * Usage: User creation, updates with related entities, profile management
 */

import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import {
  TransactionService,
  InjectTransaction,
} from '../../database/services/transaction.service';

// Assuming these entities exist in your application
class User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
}

class UserProfile {
  id: string;
  userId: string;
  bio?: string;
  avatarUrl?: string;
}

class UserPreferences {
  id: string;
  userId: string;
  notificationsEnabled: boolean;
  theme: string;
}

interface CreateUserDto {
  email: string;
  firstName: string;
  lastName: string;
  bio?: string;
  theme?: string;
}

interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatarUrl?: string;
}

/**
 * REFACTORED UserService with Transactions
 * 
 * Key improvements:
 * - Atomic user creation with profile and preferences
 * - Automatic rollback on any error
 * - Proper isolation to prevent race conditions
 * - Timeout protection for long operations
 */
@Injectable()
export class RefactoredUserService {
  private readonly logger = new Logger(RefactoredUserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profileRepository: Repository<UserProfile>,
    @InjectRepository(UserPreferences)
    private readonly preferencesRepository: Repository<UserPreferences>,
    @InjectTransaction()
    private readonly transactionService: TransactionService,
  ) {}

  /**
   * Create a new user with profile and preferences in a single transaction
   * 
   * This ensures that:
   * 1. Either all three entities are created, or none are
   * 2. No orphaned records are left behind
   * 3. Email uniqueness is enforced at transaction level
   * 
   * @param createUserDto - User creation data
   * @returns Created user with profile and preferences
   * @throws ConflictException if email already exists
   * @throws BadRequestException if validation fails
   */
  async createUserWithProfile(
    createUserDto: CreateUserDto,
  ): Promise<{ user: User; profile: UserProfile; preferences: UserPreferences }> {
    const contextId = `createUser:${createUserDto.email}:${Date.now()}`;

    this.logger.log(
      `Creating user with email: ${createUserDto.email}, contextId: ${contextId}`,
    );

    try {
      return await this.transactionService.execute(
        contextId,
        async (queryRunner: QueryRunner) => {
          // Step 1: Check if user already exists
          const existingUser = await queryRunner.manager.findOne(User, {
            where: { email: createUserDto.email },
          });

          if (existingUser) {
            throw new ConflictException(
              `User with email ${createUserDto.email} already exists`,
            );
          }

          // Step 2: Create user
          const user = this.userRepository.create({
            email: createUserDto.email,
            firstName: createUserDto.firstName,
            lastName: createUserDto.lastName,
            createdAt: new Date(),
          });

          const savedUser = await queryRunner.manager.save(user);
          this.logger.debug(`User created: ${savedUser.id}`);

          // Step 3: Create user profile
          const profile = this.profileRepository.create({
            userId: savedUser.id,
            bio: createUserDto.bio,
          });

          const savedProfile = await queryRunner.manager.save(profile);
          this.logger.debug(`Profile created for user: ${savedUser.id}`);

          // Step 4: Create user preferences with defaults
          const preferences = this.preferencesRepository.create({
            userId: savedUser.id,
            notificationsEnabled: true,
            theme: createUserDto.theme || 'light',
          });

          const savedPreferences = await queryRunner.manager.save(preferences);
          this.logger.debug(`Preferences created for user: ${savedUser.id}`);

          return {
            user: savedUser,
            profile: savedProfile,
            preferences: savedPreferences,
          };
        },
        {
          timeout: 10000, // 10 seconds for user creation
          isolationLevel: 'SERIALIZABLE', // Highest isolation to prevent race conditions
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to create user: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * Update user with profile information
   * 
   * Demonstrates updating related entities within a single transaction
   * 
   * @param userId - User ID to update
   * @param updateUserDto - Update data
   * @returns Updated user with profile
   * @throws NotFoundException if user not found
   */
  async updateUserWithProfile(
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<{ user: User; profile: UserProfile }> {
    const contextId = `updateUser:${userId}:${Date.now()}`;

    this.logger.log(
      `Updating user: ${userId}, contextId: ${contextId}`,
    );

    return this.transactionService.execute(
      contextId,
      async (queryRunner: QueryRunner) => {
        // Step 1: Find and update user
        const user = await queryRunner.manager.findOne(User, {
          where: { id: userId },
        });

        if (!user) {
          throw new NotFoundException(`User not found: ${userId}`);
        }

        if (updateUserDto.firstName) {
          user.firstName = updateUserDto.firstName;
        }
        if (updateUserDto.lastName) {
          user.lastName = updateUserDto.lastName;
        }

        const updatedUser = await queryRunner.manager.save(user);
        this.logger.debug(`User updated: ${userId}`);

        // Step 2: Update profile
        const profile = await queryRunner.manager.findOne(UserProfile, {
          where: { userId },
        });

        if (profile) {
          if (updateUserDto.bio !== undefined) {
            profile.bio = updateUserDto.bio;
          }
          if (updateUserDto.avatarUrl !== undefined) {
            profile.avatarUrl = updateUserDto.avatarUrl;
          }

          const updatedProfile = await queryRunner.manager.save(profile);
          this.logger.debug(`Profile updated for user: ${userId}`);

          return { user: updatedUser, profile: updatedProfile };
        }

        return { user: updatedUser, profile };
      },
      {
        timeout: 5000,
        isolationLevel: 'READ COMMITTED',
      },
    );
  }

  /**
   * Bulk create users - demonstrates batch transaction handling
   * 
   * Creates multiple users efficiently in a single transaction.
   * Minimal performance impact compared to individual transactions.
   * 
   * @param userDataArray - Array of user creation data
   * @returns Created users
   * @throws Error if any user creation fails (entire batch rolls back)
   */
  async bulkCreateUsers(userDataArray: CreateUserDto[]): Promise<User[]> {
    const contextId = `bulkCreateUsers:${userDataArray.length}:${Date.now()}`;

    this.logger.log(
      `Bulk creating ${userDataArray.length} users, contextId: ${contextId}`,
    );

    return this.transactionService.execute(
      contextId,
      async (queryRunner: QueryRunner) => {
        const createdUsers: User[] = [];

        for (let i = 0; i < userDataArray.length; i++) {
          const userData = userDataArray[i];

          // Check timeout at intervals
          if (i % 10 === 0) {
            if (this.transactionService.isTransactionTimedOut(contextId)) {
              throw new Error('Bulk create timeout exceeded');
            }
          }

          // Check for duplicates within transaction
          const existing = await queryRunner.manager.findOne(User, {
            where: { email: userData.email },
          });

          if (existing) {
            this.logger.warn(
              `Skipping duplicate user: ${userData.email}`,
            );
            continue;
          }

          const user = this.userRepository.create({
            ...userData,
            createdAt: new Date(),
          });

          const savedUser = await queryRunner.manager.save(user);
          createdUsers.push(savedUser);
        }

        this.logger.log(`Successfully bulk created ${createdUsers.length} users`);
        return createdUsers;
      },
      {
        timeout: 30000, // 30 seconds for bulk operation
        isolationLevel: 'READ COMMITTED',
      },
    );
  }

  /**
   * Transfer user data to another user (merge accounts)
   * 
   * Complex operation showing nested transaction handling
   * 
   * @param sourceUserId - User to merge from
   * @param targetUserId - User to merge into
   * @throws NotFoundException if users not found
   */
  async mergeUserAccounts(
    sourceUserId: string,
    targetUserId: string,
  ): Promise<void> {
    const contextId = `mergeUsers:${sourceUserId}:${targetUserId}:${Date.now()}`;

    this.logger.log(
      `Merging user ${sourceUserId} into ${targetUserId}, contextId: ${contextId}`,
    );

    await this.transactionService.execute(
      contextId,
      async (queryRunner: QueryRunner) => {
        // Step 1: Verify both users exist
        const sourceUser = await queryRunner.manager.findOne(User, {
          where: { id: sourceUserId },
        });
        const targetUser = await queryRunner.manager.findOne(User, {
          where: { id: targetUserId },
        });

        if (!sourceUser || !targetUser) {
          throw new NotFoundException('One or both users not found');
        }

        // Step 2: Move profile data
        const sourceProfile = await queryRunner.manager.findOne(
          UserProfile,
          { where: { userId: sourceUserId } },
        );

        if (sourceProfile) {
          const targetProfile = await queryRunner.manager.findOne(
            UserProfile,
            { where: { userId: targetUserId } },
          );

          if (targetProfile && sourceProfile.bio) {
            // Merge bio if target doesn't have one
            if (!targetProfile.bio) {
              targetProfile.bio = sourceProfile.bio;
            }
            await queryRunner.manager.save(targetProfile);
          }

          // Delete source profile
          await queryRunner.manager.remove(sourceProfile);
        }

        // Step 3: Merge preferences (take target preferences, or source if better)
        const sourcePrefs = await queryRunner.manager.findOne(
          UserPreferences,
          { where: { userId: sourceUserId } },
        );
        const targetPrefs = await queryRunner.manager.findOne(
          UserPreferences,
          { where: { userId: targetUserId } },
        );

        if (sourcePrefs) {
          await queryRunner.manager.remove(sourcePrefs);
        }

        // Step 4: Delete source user
        await queryRunner.manager.remove(sourceUser);

        this.logger.log(
          `Successfully merged user ${sourceUserId} into ${targetUserId}`,
        );
      },
      {
        timeout: 15000,
        isolationLevel: 'SERIALIZABLE',
      },
    );
  }

  /**
   * Get user with all related data
   * Returns user, profile, and preferences
   */
  async getUserComplete(userId: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    const profile = await this.profileRepository.findOne({
      where: { userId },
    });

    const preferences = await this.preferencesRepository.findOne({
      where: { userId },
    });

    return {
      user,
      profile,
      preferences,
    };
  }
}

export { RefactoredUserService, CreateUserDto, UpdateUserDto };
