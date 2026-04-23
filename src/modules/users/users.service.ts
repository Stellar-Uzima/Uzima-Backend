import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import {
  UpdateUserSettingsDto,
  UserSettingsResponseDto,
} from './dto/user-settings.dto';

@Injectable()
export class UsersService {
  private readonly defaultLanguage = 'en';
  private readonly defaultCountry = 'ZZ';

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) { }

  async getSettings (userId: string): Promise<UserSettingsResponseDto> {
    const user = await this.findUserOrFail(userId);
    return this.toSettingsResponse(user);
  }

  async updateSettings (
    userId: string,
    dto: UpdateUserSettingsDto,
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

  private async findUserOrFail (userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private toSettingsResponse (user: User): UserSettingsResponseDto {
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
      preferredLanguage:
        user.preferredLanguage?.trim().toLowerCase() || this.defaultLanguage,
      country: user.country?.trim().toUpperCase() || this.defaultCountry,
      phoneNumber: user.phoneNumber?.trim() || null,
    };
  }

  private normalizeNamePart (value?: string | null): string {
    return value?.trim() || '';
  }

  private normalizeFullName (value?: string | null): string {
    return value?.trim() || '';
  }

  private composeFullName (firstName?: string | null, lastName?: string | null) {
    return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ');
  }

  private splitFullName (fullName: string): {
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

  private fallbackName (user: User): string {
    const emailName = user.email?.split('@')[0]?.trim();
    const phoneName = user.phoneNumber?.trim();

    return emailName || phoneName || 'User';
  }

  // TODO: Implement user management methods
  // - create(createUserDto: CreateUserDto)
  // - findAll(pagination: PaginationDto)
  // - findOne(id: string)
  // - findByEmail(email: string)
  // - findByPhone(phone: string)
  // - update(id: string, updateUserDto: UpdateUserDto)
  // - delete(id: string)
  // - getUserStats(id: string)
}
