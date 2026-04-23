import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, Not, IsNull } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { User } from '../../entities/user.entity';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { UserFilterDto } from './dto/user-filter.dto';
import { UserStatusChangeDto, UserStatusResponseDto } from './dto/user-status-change.dto';
import { UpdateProfileDto, ProfileResponseDto } from '../../common/dtos/update-profile.dto';
import {
  PaginatedResponseDto,
  PaginationMetaDto,
  SortOrder,
} from '../../common/dtos/pagination.dto';
import { Role } from '../../auth/enums/role.enum';
import { UserStatus } from '../../auth/enums/user-status.enum';
import { PhoneValidationUtil } from '../../common/utils/phone-validation.util';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserStatusLog)
    private readonly userStatusLogRepository: Repository<UserStatusLog>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Create a new user
   */
  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    if (user.firstName && user.lastName) {
      user.fullName = `${user.firstName} ${user.lastName}`.trim();
    }
    return this.userRepository.save(user);
  }

  /**
   * Save/Update user
   */
  async save(user: User): Promise<User> {
    return this.userRepository.save(user);
  }

  /**
   * List users with pagination, filtering, and sorting
   * @param filterDto - Filter and pagination options
   * @returns Paginated list of users
   */
  async listUsers(filterDto: UserFilterDto): Promise<PaginatedResponseDto<User>> {
    const {
      page = 1,
      limit = 10,
      sort = [{ field: 'createdAt', order: SortOrder.DESC }],
      search,
      role,
      isActive,
      isVerified,
      createdAtFrom,
      createdAtTo,
      lastActiveFrom,
      lastActiveTo,
      country,
      preferredLanguage,
      walletAddress,
      stellarWalletAddress,
      referralCode,
      minDailyXlmEarned,
      maxDailyXlmEarned,
      phoneNumber,
      hasPasswordResetToken,
      hasEmailVerificationToken,
    } = filterDto;

    // Build query
    const queryBuilder = this.userRepository.createQueryBuilder('user');

    // Apply filters
    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive });
    }

    if (isVerified !== undefined) {
      queryBuilder.andWhere('user.isVerified = :isVerified', { isVerified });
    }

    if (createdAtFrom && createdAtTo) {
      queryBuilder.andWhere('user.createdAt BETWEEN :createdAtFrom AND :createdAtTo', {
        createdAtFrom: new Date(createdAtFrom),
        createdAtTo: new Date(createdAtTo),
      });
    } else if (createdAtFrom) {
      queryBuilder.andWhere('user.createdAt >= :createdAtFrom', {
        createdAtFrom: new Date(createdAtFrom),
      });
    } else if (createdAtTo) {
      queryBuilder.andWhere('user.createdAt <= :createdAtTo', {
        createdAtTo: new Date(createdAtTo),
      });
    }

    if (lastActiveFrom && lastActiveTo) {
      queryBuilder.andWhere('user.lastActiveAt BETWEEN :lastActiveFrom AND :lastActiveTo', {
        lastActiveFrom: new Date(lastActiveFrom),
        lastActiveTo: new Date(lastActiveTo),
      });
    } else if (lastActiveFrom) {
      queryBuilder.andWhere('user.lastActiveAt >= :lastActiveFrom', {
        lastActiveFrom: new Date(lastActiveFrom),
      });
    } else if (lastActiveTo) {
      queryBuilder.andWhere('user.lastActiveAt <= :lastActiveTo', {
        lastActiveTo: new Date(lastActiveTo),
      });
    }

    if (country) {
      queryBuilder.andWhere('user.country = :country', { country });
    }

    if (preferredLanguage) {
      queryBuilder.andWhere('user.preferredLanguage = :preferredLanguage', { preferredLanguage });
    }

    if (walletAddress) {
      queryBuilder.andWhere('user.walletAddress ILIKE :walletAddress', {
        walletAddress: `%${walletAddress}%`,
      });
    }

    if (stellarWalletAddress) {
      queryBuilder.andWhere('user.stellarWalletAddress ILIKE :stellarWalletAddress', {
        stellarWalletAddress: `%${stellarWalletAddress}%`,
      });
    }

    if (referralCode) {
      queryBuilder.andWhere('user.referralCode ILIKE :referralCode', {
        referralCode: `%${referralCode}%`,
      });
    }

    if (minDailyXlmEarned !== undefined) {
      queryBuilder.andWhere('user.dailyXlmEarned >= :minDailyXlmEarned', { minDailyXlmEarned });
    }

    if (maxDailyXlmEarned !== undefined) {
      queryBuilder.andWhere('user.dailyXlmEarned <= :maxDailyXlmEarned', { maxDailyXlmEarned });
    }

    if (phoneNumber) {
      queryBuilder.andWhere('user.phoneNumber ILIKE :phoneNumber', {
        phoneNumber: `%${phoneNumber}%`,
      });
    }

    if (hasPasswordResetToken !== undefined) {
      if (hasPasswordResetToken) {
        queryBuilder.andWhere('user.passwordResetToken IS NOT NULL');
      } else {
        queryBuilder.andWhere('user.passwordResetToken IS NULL');
      }
    }

    if (hasEmailVerificationToken !== undefined) {
      if (hasEmailVerificationToken) {
        queryBuilder.andWhere('user.emailVerificationToken IS NOT NULL');
      } else {
        queryBuilder.andWhere('user.emailVerificationToken IS NULL');
      }
    }

    // Apply search filter (email, firstName, lastName, fullName)
    if (search) {
      queryBuilder.andWhere(
        `(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.fullName ILIKE :search)`,
        { search: `%${search}%` }
      );
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply sorting
    sort.forEach((sortField, index) => {
      const { field = 'createdAt', order = SortOrder.DESC } = sortField;
      const sortDirection = order === SortOrder.ASC ? 'ASC' : 'DESC';

      // Validate sort field to prevent SQL injection
      const validFields = [
        'id',
        'email',
        'firstName',
        'lastName',
        'role',
        'isActive',
        'isVerified',
        'createdAt',
        'updatedAt',
        'lastActiveAt',
        'country',
        'preferredLanguage',
        'dailyXlmEarned',
      ];

      if (validFields.includes(field)) {
        queryBuilder.addOrderBy(`user.${field}`, sortDirection);
      }
    });

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    // Execute query
    const users = await queryBuilder.getMany();

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const meta: PaginationMetaDto = {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      nextPage: page < totalPages ? page + 1 : undefined,
      prevPage: page > 1 ? page - 1 : undefined,
    };

    return {
      data: users,
      meta,
    };
  }

  /**
   * Get user by ID
   */
  async findOne(id: string, relations: string[] = []): Promise<User> {
    return this.userRepository.findOne({ where: { id }, relations });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string, relations: string[] = []): Promise<User> {
    return this.userRepository.findOne({ where: { email }, relations });
  }

  /**
   * Find user by phone number
   */
  async findByPhone(phoneNumber: string): Promise<User> {
    return this.userRepository.findOne({ where: { phoneNumber } });
  }

  /**
   * Get user statistics
   */
  async getUserStats(id: string): Promise<any> {
    const user = await this.findOne(id);
    if (!user) {
      throw new ForbiddenException('User not found');
    }

    // TODO: Implement user stats calculation
    return {
      userId: id,
      totalTasksCompleted: 0,
      totalEarnings: 0,
      currentStreak: 0,
      referralCount: 0,
      dailyXlmEarned: user.dailyXlmEarned,
    };
  }

  /**
   * Check if user has admin role
   */
  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.findOne(userId);
    return user?.role === Role.ADMIN;
  }

  /**
   * Change user status with logging
   * @param userId - User ID to change status for
   * @param statusChangeDto - Status change details
   * @param changedBy - User ID making the change
   * @param ipAddress - IP address of the user making the change
   * @param userAgent - User agent string
   * @returns Status change response
   */
  async changeUserStatus(
    userId: string,
    statusChangeDto: UserStatusChangeDto,
    changedBy: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<UserStatusResponseDto> {
    // Find the user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Find the user making the change
    const changedByUser = await this.userRepository.findOne({ where: { id: changedBy } });
    if (!changedByUser) {
      throw new NotFoundException('User making the change not found');
    }

    // Check if the user making the change has admin role
    if (changedByUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can change user status');
    }

    // Prevent changing status of other admins unless you're a super admin (add this logic if needed)
    if (user.role === Role.ADMIN && user.id !== changedBy) {
      throw new ForbiddenException('Cannot change status of other admin users');
    }

    const previousStatus = user.status;
    const newStatus = statusChangeDto.status;

    // Check if status is actually changing
    if (previousStatus === newStatus) {
      throw new ForbiddenException('User already has this status');
    }

    // Update user status
    user.status = newStatus;
    user.isActive = newStatus === UserStatus.ACTIVE; // Keep isActive in sync
    await this.userRepository.save(user);

    // Create status change log
    const statusLog = this.userStatusLogRepository.create({
      userId: user.id,
      user: user,
      previousStatus,
      newStatus,
      changedBy: changedByUser.id,
      changedByUser: changedByUser,
      changedByRole: changedByUser.role,
      reason: statusChangeDto.reason,
      notes: statusChangeDto.notes,
      ipAddress,
      userAgent,
    });

    await this.userStatusLogRepository.save(statusLog);

    // Return response
    return {
      userId: user.id,
      previousStatus,
      newStatus,
      changedAt: statusLog.createdAt,
      changedBy: changedByUser.id,
      changedByRole: changedByUser.role,
      reason: statusChangeDto.reason,
      notes: statusChangeDto.notes,
    };
  }

  /**
   * Get user status history
   * @param userId - User ID to get status history for
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 20)
   * @returns Paginated status history
   */
  async getUserStatusHistory(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedResponseDto<UserStatusLog>> {
    // Check if user exists
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const offset = (page - 1) * limit;

    const [logs, total] = await this.userStatusLogRepository.findAndCount({
      where: { userId },
      relations: ['changedByUser'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);
    const meta: PaginationMetaDto = {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      nextPage: page < totalPages ? page + 1 : undefined,
      prevPage: page > 1 ? page - 1 : undefined,
    };

    return {
      data: logs,
      meta,
    };
  }

  /**
   * Check if user can login based on status
   * @param userId - User ID to check
   * @returns Login eligibility
   */
  async canUserLogin(userId: string): Promise<{ canLogin: boolean; reason?: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return { canLogin: false, reason: 'User not found' };
    }

    switch (user.status) {
      case UserStatus.ACTIVE:
        return { canLogin: true };
      case UserStatus.INACTIVE:
        return { canLogin: false, reason: 'Account is inactive' };
      case UserStatus.SUSPENDED:
        return { canLogin: false, reason: 'Account is suspended' };
      default:
        return { canLogin: false, reason: 'Account status unknown' };
    }
  }

  /**
   * Get users by status
   * @param status - User status to filter by
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 20)
   * @returns Paginated users with specified status
   */
  async getUsersByStatus(
    status: UserStatus,
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedResponseDto<User>> {
    const offset = (page - 1) * limit;

    const [users, total] = await this.userRepository.findAndCount({
      where: { status },
      order: { updatedAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);
    const meta: PaginationMetaDto = {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      nextPage: page < totalPages ? page + 1 : undefined,
      prevPage: page > 1 ? page - 1 : undefined,
    };

    return {
      data: users,
      meta,
    };
  }

  /**
   * Update user profile
   * @param userId - User ID to update
   * @param updateProfileDto - Profile update data
   * @param ipAddress - IP address of the user making the update
   * @param userAgent - User agent string
   * @returns Updated user profile
   */
  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ProfileResponseDto> {
    // Find the user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Store original values for logging
    const originalValues = {
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      country: user.country,
      preferredLanguage: user.preferredLanguage,
    };

    // Validate and update fields
    const updates: Partial<User> = {};

    // Update firstName
    if (updateProfileDto.firstName !== undefined) {
      if (!updateProfileDto.firstName.trim()) {
        throw new BadRequestException('First name cannot be empty');
      }
      updates.firstName = updateProfileDto.firstName.trim();
    }

    // Update lastName
    if (updateProfileDto.lastName !== undefined) {
      if (!updateProfileDto.lastName.trim()) {
        throw new BadRequestException('Last name cannot be empty');
      }
      updates.lastName = updateProfileDto.lastName.trim();
    }

    // Update phoneNumber with validation
    if (updateProfileDto.phoneNumber !== undefined) {
      const normalizedPhone = PhoneValidationUtil.normalizePhoneNumber(
        updateProfileDto.phoneNumber
      );
      if (!normalizedPhone) {
        throw new BadRequestException(
          'Invalid phone number format. Please use international format (e.g., +1234567890)'
        );
      }

      // Check if phone number is already taken by another user
      const existingUserWithPhone = await this.userRepository.findOne({
        where: { phoneNumber: normalizedPhone },
      });
      if (existingUserWithPhone && existingUserWithPhone.id !== userId) {
        throw new BadRequestException('Phone number is already in use by another account');
      }

      updates.phoneNumber = normalizedPhone;
    }

    // Update avatar URL
    if (updateProfileDto.avatar !== undefined) {
      updates.walletAddress = updateProfileDto.avatar; // Assuming avatar is stored in walletAddress field
    }

    // Update bio
    if (updateProfileDto.bio !== undefined) {
      updates.referralCode = updateProfileDto.bio; // Assuming bio is stored in referralCode field
    }

    // Update preferredLanguage
    if (updateProfileDto.preferredLanguage !== undefined) {
      updates.preferredLanguage = updateProfileDto.preferredLanguage;
    }

    // Update country
    if (updateProfileDto.country !== undefined) {
      updates.country = updateProfileDto.country;
    }

    // Update fullName if firstName or lastName changed
    if (updates.firstName !== undefined || updates.lastName !== undefined) {
      const newFirstName = updates.firstName !== undefined ? updates.firstName : user.firstName;
      const newLastName = updates.lastName !== undefined ? updates.lastName : user.lastName;
      updates.fullName = `${newFirstName} ${newLastName}`.trim();
    }

    // Update lastActiveAt
    updates.lastActiveAt = new Date();

    // Apply updates
    const updatedUser = await this.userRepository.save({
      ...user,
      ...updates,
      updatedAt: new Date(),
    });

    // Log profile changes (you might want to create a separate audit log table for this)
    const changedFields = Object.keys(updates).filter(
      (key) => updates[key] !== undefined && updates[key] !== originalValues[key]
    );
    if (changedFields.length > 0) {
      // This is a simplified logging - in production, you'd want a proper audit log
      console.log(`Profile updated for user ${userId}:`, {
        changedFields,
        ipAddress,
        userAgent,
        timestamp: new Date(),
      });
    }

    // Invalidate cached profile
    const cacheKey = `user:profile:${userId}`;
    await this.cacheManager.del(cacheKey);

    // Return profile response
    return {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      fullName: updatedUser.fullName,
      phoneNumber: updatedUser.phoneNumber,
      avatar: updatedUser.walletAddress, // Assuming avatar is stored in walletAddress
      bio: updatedUser.referralCode, // Assuming bio is stored in referralCode
      preferredLanguage: updatedUser.preferredLanguage,
      country: updatedUser.country,
      role: updatedUser.role,
      status: updatedUser.status,
      isVerified: updatedUser.isVerified,
      lastActiveAt: updatedUser.lastActiveAt,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };
  }

  /**
   * Get user profile for response (cached for 5 minutes)
   * @param userId - User ID
   * @returns User profile data
   */
  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const cacheKey = `user:profile:${userId}`;

    // Try to get from cache first
    const cachedProfile = await this.cacheManager.get<ProfileResponseDto>(cacheKey);
    if (cachedProfile) {
      return cachedProfile;
    }

    // Fetch from database if not cached
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profile: ProfileResponseDto = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      avatar: user.walletAddress, // Assuming avatar is stored in walletAddress
      bio: user.referralCode, // Assuming bio is stored in referralCode
      preferredLanguage: user.preferredLanguage,
      country: user.country,
      role: user.role,
      status: user.status,
      isVerified: user.isVerified,
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    // Cache the profile for 5 minutes (300 seconds)
    await this.cacheManager.set(cacheKey, profile, 300000);

    return profile;
  }
}
