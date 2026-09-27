import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';
import { UpdateMeProfileDto } from '../dto/update-me-profile.dto';

/** The subset of {@link User} a caller may change on themselves. */
const MUTABLE_PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'phoneNumber',
  'avatar',
] as const;

/**
 * Properties that must never be writable through the self-service profile
 * endpoint (#1290). Asserted at runtime as a defence-in-depth check so a future
 * DTO edit cannot quietly widen the blast radius.
 */
export const PROTECTED_PROFILE_FIELDS: ReadonlyArray<string> = [
  'id',
  'email',
  'password',
  'role',
  'status',
  'isActive',
  'isVerified',
  'walletBalance',
  'dailyXlmEarned',
  'failedLoginAttempts',
  'lockedUntil',
  'twoFactorEnabled',
  'twoFactorSecret',
  'referralCode',
  'refreshToken',
  'refreshTokenExpiry',
  'passwordResetToken',
  'passwordResetExpiry',
  'emailVerificationToken',
  'emailVerificationExpiry',
  'deletedAt',
];

/** Response returned by the self-service profile endpoints. */
export interface MeProfileResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phoneNumber: string | null;
  avatar: string | null;
  role: string;
  status: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Implements the self-service profile update API (#1290).
 *
 * Guarantees:
 *  - only the allowlisted fields in {@link MUTABLE_PROFILE_FIELDS} are written;
 *  - a phone number that already belongs to a different account is rejected
 *    with 409 rather than silently overwriting the other row;
 *  - the response is read back from the persisted row, so what the caller sees
 *    is exactly what was stored (including DB-level defaults);
 *  - `fullName` is recomputed whenever a name part changes.
 */
@Injectable()
export class MeProfileService {
  private readonly logger = new Logger(MeProfileService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getMe(userId: string): Promise<MeProfileResponse> {
    const user = await this.findUserOrFail(userId);
    return this.toResponse(user);
  }

  async updateMe(
    userId: string,
    dto: UpdateMeProfileDto,
  ): Promise<MeProfileResponse> {
    this.assertNoProtectedFields(dto);

    const user = await this.findUserOrFail(userId);
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    if (dto.firstName !== undefined) {
      if (dto.firstName.length === 0) {
        throw new BadRequestException('firstName must not be empty');
      }
      changes.firstName = { from: user.firstName, to: dto.firstName };
      user.firstName = dto.firstName;
    }

    if (dto.lastName !== undefined) {
      if (dto.lastName.length === 0) {
        throw new BadRequestException('lastName must not be empty');
      }
      changes.lastName = { from: user.lastName, to: dto.lastName };
      user.lastName = dto.lastName;
    }

    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      user.fullName = [user.firstName, user.lastName]
        .filter((part) => typeof part === 'string' && part.trim().length > 0)
        .join(' ')
        .trim();
    }

    if (dto.phoneNumber !== undefined) {
      await this.assertPhoneAvailable(dto.phoneNumber, userId);
      changes.phoneNumber = { from: user.phoneNumber, to: dto.phoneNumber };
      user.phoneNumber = dto.phoneNumber;
    }

    if (dto.avatar !== undefined) {
      changes.avatar = { from: user.avatar ?? null, to: dto.avatar };
      user.avatar = dto.avatar;
    }

    const changedFields = Object.keys(changes);
    if (changedFields.length === 0) {
      // Nothing to do. Return current state rather than writing a no-op row.
      return this.toResponse(user);
    }

    const saved = await this.userRepository.save(user);

    // Read back so the caller sees persisted values (and any DB defaults),
    // not the in-memory object we just mutated.
    const persisted = await this.userRepository.findOne({ where: { id: userId } });
    if (!persisted) {
      throw new NotFoundException('User not found');
    }

    this.logger.log(
      `Profile updated for user ${userId}: ${changedFields.join(', ')}`,
    );

    return this.toResponse(persisted);
  }

  /**
   * Rejects any attempt to set a protected property. The DTO's whitelist already
   * strips these, but a direct service call (e.g. from a future controller)
   * must not be able to escalate privileges either.
   */
  private assertNoProtectedFields(dto: UpdateMeProfileDto): void {
    const attempted = Object.keys(dto as Record<string, unknown>).filter(
      (key) => !MUTABLE_PROFILE_FIELDS.includes(key as (typeof MUTABLE_PROFILE_FIELDS)[number]),
    );

    if (attempted.length > 0) {
      throw new BadRequestException(
        `These fields cannot be changed through the profile endpoint: ${attempted.join(', ')}`,
      );
    }
  }

  private async assertPhoneAvailable(
    phoneNumber: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.userRepository.findOne({
      where: { phoneNumber },
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException('Phone number is already in use by another account');
    }
  }

  private async findUserOrFail(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private toResponse(user: User): MeProfileResponse {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName:
        user.fullName ||
        [user.firstName, user.lastName].filter(Boolean).join(' ').trim(),
      phoneNumber: user.phoneNumber ?? null,
      avatar: user.avatar ?? null,
      role: user.role,
      status: user.status,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
