import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import {
  UpdateUserSettingsDto,
  UserSettingsResponseDto,
} from './dto/user-settings.dto';
import { PreferencesService } from './services/preferences.service';
import { PreferencesResponseDto } from './dto/preferences.dto';

@Injectable()
export class UsersService {
  private readonly defaultLanguage = 'en';
  private readonly defaultCountry = 'ZZ';

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserStatusLog)
    private readonly userStatusLogRepository: Repository<UserStatusLog>,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache = null as any,
    private readonly preferencesService: PreferencesService = null as any,
  ) {}

  // --- SETTINGS METHODS ---

  async getSettings(userId: string): Promise<UserSettingsResponseDto> {
    const user = await this.findUserOrFail(userId);
    return this.toSettingsResponse(user);
  }

  async updateSettings(
    userId: string,
    dto: UpdateUserSettingsDto
  ): Promise<UserSettingsResponseDto> {
    const user = await this.findUserOrFail(userId);

    if (dto.fullName !== undefined) {
      user.fullName = dto.fullName;
      const splitName = this.splitFullName(dto.fullName);
      user.firstName = splitName.firstName;
      user.lastName = splitName.lastName;
    }

    if (dto.firstName !== undefined) {
      user.firstName = dto.firstName;
    }

    if (dto.lastName !== undefined) {
      user.lastName = dto.lastName;
    }

    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      user.fullName = this.composeFullName(user.firstName, user.lastName);
    }

    if (dto.preferredLanguage !== undefined) {
      user.preferredLanguage = dto.preferredLanguage;
    }

    if (dto.country !== undefined) {
      user.country = dto.country;
    }

    if (dto.phoneNumber !== undefined) {
      user.phoneNumber = dto.phoneNumber as unknown as string;
    }

    const updatedUser = await this.userRepository.save(user);
    return this.toSettingsResponse(updatedUser);
  }

  private async findUserOrFail(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private toSettingsResponse(user: User): UserSettingsResponseDto {
    const firstName = this.normalizeNamePart(user.firstName);
    const lastName = this.normalizeNamePart(user.lastName);
    const fullName =
      this.normalizeFullName(user.fullName) ||
      this.composeFullName(firstName, lastName) ||
      this.fallbackName(user);

    return {
      fullName,
      firstName: firstName || this.splitFullName(fullName).firstName,
      lastName: lastName || this.splitFullName(fullName).lastName,
      preferredLanguage: user.preferredLanguage?.trim().toLowerCase() || this.defaultLanguage,
      country: user.country?.trim().toUpperCase() || this.defaultCountry,
      phoneNumber: user.phoneNumber?.trim() || null,
    };
  }

  private normalizeNamePart(value?: string | null): string {
    return value?.trim() || '';
  }

  private normalizeFullName(value?: string | null): string {
    return value?.trim() || '';
  }

  private composeFullName(firstName?: string | null, lastName?: string | null) {
    return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ');
  }

  private splitFullName(fullName: string): {
    firstName: string;
    lastName: string;
  } {
    const normalized = fullName.trim().replace(/\s+/g, ' ');
    const [firstName, ...rest] = normalized.split(' ');

    return {
      firstName,
      lastName: rest.join(' '),
    };
  }

  private fallbackName(user: User): string {
    const emailName = user.email?.split('@')[0]?.trim();
    const phoneName = user.phoneNumber?.trim();

    return emailName || phoneName || 'User';
  }

  // --- CORE USER METHODS ---

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    if (user.firstName && user.lastName) {
      user.fullName = `${user.firstName} ${user.lastName}`.trim();
    }
    return this.userRepository.save(user);
  }

  async save(user: User): Promise<User> {
    return this.userRepository.save(user);
  }

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

    const queryBuilder = this.userRepository.createQueryBuilder('user');

    if (role) queryBuilder.andWhere('user.role = :role', { role });
    if (isActive !== undefined) queryBuilder.andWhere('user.isActive = :isActive', { isActive });
    if (isVerified !== undefined)
      queryBuilder.andWhere('user.isVerified = :isVerified', { isVerified });

    if (createdAtFrom && createdAtTo) {
      queryBuilder.andWhere('user.createdAt BETWEEN :createdAtFrom AND :createdAtTo', {
        createdAtFrom: new Date(createdAtFrom),
        createdAtTo: new Date(createdAtTo),
      });
    }

    if (country) queryBuilder.andWhere('user.country = :country', { country });
    if (preferredLanguage)
      queryBuilder.andWhere('user.preferredLanguage = :preferredLanguage', { preferredLanguage });

    if (search) {
      queryBuilder.andWhere(
        `(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.fullName ILIKE :search)`,
        { search: `%${search}%` }
      );
    }

    const total = await queryBuilder.getCount();

    sort.forEach((sortField) => {
      const { field = 'createdAt', order = SortOrder.DESC } = sortField;
      const sortDirection = order === SortOrder.ASC ? 'ASC' : 'DESC';
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

    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const users = await queryBuilder.getMany();
    const totalPages = Math.ceil(total / limit);

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        nextPage: page < totalPages ? page + 1 : undefined,
        prevPage: page > 1 ? page - 1 : undefined,
      },
    };
  }

  async findOne(id: string, relations: string[] = []): Promise<User | null> {
    return this.userRepository.findOne({ where: { id }, relations });
  }

  async findByEmail(email: string, relations: string[] = []): Promise<User | null> {
    return this.userRepository.findOne({ where: { email }, relations });
  }

  async findByPhone(phoneNumber: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { phoneNumber } });
  }

  async getUserStats(id: string): Promise<any> {
    const user = await this.findOne(id);
    if (!user) throw new ForbiddenException('User not found');

    return {
      userId: id,
      totalTasksCompleted: 0,
      totalEarnings: 0,
      currentStreak: 0,
      referralCount: 0,
      dailyXlmEarned: user.dailyXlmEarned,
    };
  }

  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.findOne(userId);
    return user?.role === Role.ADMIN;
  }

  async changeUserStatus(
    userId: string,
    statusChangeDto: UserStatusChangeDto,
    changedBy: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<UserStatusResponseDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const changedByUser = await this.userRepository.findOne({ where: { id: changedBy } });
    if (!changedByUser) throw new NotFoundException('User making the change not found');

    if (changedByUser.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can change user status');
    }

    const previousStatus = user.status;
    const newStatus = statusChangeDto.status;

    if (previousStatus === newStatus) {
      throw new ForbiddenException('User already has this status');
    }

    user.status = newStatus;
    user.isActive = newStatus === UserStatus.ACTIVE;
    await this.userRepository.save(user);

    const statusLog = this.userStatusLogRepository.create({
      userId: user.id,
      previousStatus,
      newStatus,
      changedBy: changedByUser.id,
      reason: statusChangeDto.reason,
      notes: statusChangeDto.notes,
      ipAddress,
      userAgent,
    });

    await this.userStatusLogRepository.save(statusLog);

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

  async getUserStatusHistory(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedResponseDto<UserStatusLog>> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const offset = (page - 1) * limit;
    const [logs, total] = await this.userStatusLogRepository.findAndCount({
      where: { userId },
      relations: ['changedByUser'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: logs,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async canUserLogin(userId: string): Promise<{ canLogin: boolean; reason?: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return { canLogin: false, reason: 'User not found' };

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

    return {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ProfileResponseDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const updates: Partial<User> = {};
    const changedFields: string[] = [];

    if (updateProfileDto.firstName !== undefined) {
      const trimmedFirstName = updateProfileDto.firstName.trim();
      if (!trimmedFirstName) {
        throw new BadRequestException('First name cannot be empty');
      }
      updates.firstName = trimmedFirstName;
      changedFields.push('firstName');
    }

    if (updateProfileDto.lastName !== undefined) {
      const trimmedLastName = updateProfileDto.lastName.trim();
      if (!trimmedLastName) {
        throw new BadRequestException('Last name cannot be empty');
      }
      updates.lastName = trimmedLastName;
      changedFields.push('lastName');
    }

    if (updateProfileDto.phoneNumber !== undefined) {
      const normalizedPhone = PhoneValidationUtil.normalizePhoneNumber(
        updateProfileDto.phoneNumber,
      );
      if (!normalizedPhone) {
        throw new BadRequestException('Invalid phone format');
      }

      const existingUser = await this.userRepository.findOne({
        where: { phoneNumber: normalizedPhone },
      });
      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException('Phone number already in use');
      }

      updates.phoneNumber = normalizedPhone;
      changedFields.push('phoneNumber');
    }

    if (updateProfileDto.avatar !== undefined) {
      updates.walletAddress = updateProfileDto.avatar.trim();
      changedFields.push('avatar');
    }

    if (updateProfileDto.bio !== undefined) {
      updates.referralCode = updateProfileDto.bio?.trim();
      changedFields.push('bio');
    }

    if (updateProfileDto.preferredLanguage !== undefined) {
      updates.preferredLanguage = updateProfileDto.preferredLanguage.trim();
      changedFields.push('preferredLanguage');
    }

    if (updateProfileDto.country !== undefined) {
      updates.country = updateProfileDto.country.trim();
      changedFields.push('country');
    }

    if (updates.firstName || updates.lastName) {
      const firstName = updates.firstName || user.firstName;
      const lastName = updates.lastName || user.lastName;
      updates.fullName = `${firstName} ${lastName}`.trim();
      if (!changedFields.includes('firstName') && updateProfileDto.firstName === undefined) {
        changedFields.push('fullName');
      }
    }

    const updatedUser = await this.userRepository.save({
      ...user,
      ...updates,
      updatedAt: new Date(),
    });

    if (this.cacheManager) {
      await this.cacheManager.del(`user:profile:${userId}`);
    }

    if (changedFields.length > 0) {
      console.log(`Profile updated for user ${userId}:`, {
        changedFields,
        ipAddress,
        userAgent,
        timestamp: new Date(),
      });
    }

    return this.getProfile(updatedUser.id);
  }

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const cacheKey = `user:profile:${userId}`;
    if (this.cacheManager) {
      const cached = await this.cacheManager.get<ProfileResponseDto>(cacheKey);
      if (cached) return cached;
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const profile: ProfileResponseDto = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      avatar: user.walletAddress,
      bio: user.referralCode,
      preferredLanguage: user.preferredLanguage,
      country: user.country,
      role: user.role,
      status: user.status,
      isVerified: user.isVerified,
      lastActiveAt: user.lastActiveAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    if (this.cacheManager) {
      await this.cacheManager.set(cacheKey, profile, 300000);
    }
    return profile;
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string): Promise<PreferencesResponseDto> {
    const preferences = await this.preferencesService.getPreferences(userId);
    
    return {
      id: preferences.id,
      theme: preferences.theme,
      language: preferences.language,
      emailNotifications: preferences.notifications.email,
      pushNotifications: preferences.notifications.push,
      smsNotifications: preferences.notifications.sms,
      privacy: preferences.privacy,
      accessibility: preferences.accessibility,
      app: preferences.app,
      createdAt: preferences.createdAt,
      updatedAt: preferences.updatedAt,
    };
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(
    userId: string,
    updateData: any,
  ): Promise<PreferencesResponseDto> {
    const preferences = await this.preferencesService.updatePreferences(userId, updateData);
    
    return {
      id: preferences.id,
      theme: preferences.theme,
      language: preferences.language,
      emailNotifications: preferences.notifications.email,
      pushNotifications: preferences.notifications.push,
      smsNotifications: preferences.notifications.sms,
      privacy: preferences.privacy,
      accessibility: preferences.accessibility,
      app: preferences.app,
      createdAt: preferences.createdAt,
      updatedAt: preferences.updatedAt,
    };
  }

  /**
   * Create default preferences for new user
   */
  async createDefaultPreferences(userId: string): Promise<void> {
    await this.preferencesService.createDefaultPreferences(userId);
  }

  /**
   * Delete user preferences (called when user is deleted)
   */
  async deletePreferences(userId: string): Promise<void> {
    await this.preferencesService.deletePreferences(userId);
  }
}
