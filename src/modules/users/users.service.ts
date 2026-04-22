import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like, Not, IsNull } from 'typeorm';
import { User } from '../../entities/user.entity';
import { UserStatusLog } from '../../entities/user-status-log.entity';
import { UserFilterDto } from './dto/user-filter.dto';
import { UserStatusChangeDto, UserStatusResponseDto } from './dto/user-status-change.dto';
import {
  PaginatedResponseDto,
  PaginationMetaDto,
  SortOrder,
} from '../../common/dtos/pagination.dto';
import { Role } from '../../auth/enums/role.enum';
import { UserStatus } from '../../auth/enums/user-status.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserStatusLog)
    private readonly userStatusLogRepository: Repository<UserStatusLog>
  ) {}

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
  async findOne(id: string): Promise<User> {
    return this.userRepository.findOne({ where: { id } });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User> {
    return this.userRepository.findOne({ where: { email } });
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
}
