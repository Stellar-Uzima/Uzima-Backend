```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { LinkWalletDto } from '../dto/link-wallet.dto';
import { User } from '../../../entities/user.entity';
import { UserStatus } from '../enums/user-status.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private eventEmitter: EventEmitter2
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    // Normalize the email to ensure case-insensitive and whitespace-tolerant lookup.
    const normalized = email.trim().toLowerCase();

    // Include sensitive fields required for authentication, which may be excluded by default.
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .addSelect('user.twoFactorSecret')
      .where('LOWER(user.email) = :normalized', { normalized })
      .getOne();
  }

  async findById(id: string): Promise<User> {
    // Fetch the user by ID and explicitly include the two-factor secret when needed.
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.twoFactorSecret')
      .where('user.id = :id', { id })
      .getOne();

    // Throw an error if no user exists with the provided ID.
    if (!user) throw new Error('User not found');

    return user;
  }

  async getProfile(userId: string): Promise<Omit<User, 'password'>> {
    // Retrieve the user's information using their ID.
    const user = await this.findById(userId);

    // Exclude the password before returning the profile data.
    const { password, ...profile } = user as User & { password?: string };
    return profile;
  }

  async create(
    userData: Partial<User> & {
      name?: string;
      fullName?: string;
      country?: string;
    }
  ): Promise<User> {
    // Require at least one supported authentication identifier or credential.
    if (!userData.password && !userData.phoneNumber) {
      throw new Error('Password or phone number is required');
    }

    // Hash the password before storing it to prevent plaintext password storage.
    const hashedPassword = userData.password ? await bcrypt.hash(userData.password, 12) : null;

    // Resolve the user's full name from the available fields, defaulting to "User".
    const fullName = (userData.fullName ?? userData.name ?? '').trim() || 'User';

    // Split the full name into first and last names using the first space.
    const spaceIndex = fullName.indexOf(' ');
    const firstName = spaceIndex > 0 ? fullName.slice(0, spaceIndex) : fullName;
    const lastName = spaceIndex > 0 ? fullName.slice(spaceIndex + 1) : fullName;

    // Normalize the email when provided so email lookups remain consistent.
    const email =
      userData.email != null && userData.email !== ''
        ? userData.email.trim().toLowerCase()
        : userData.email;

    // Create a new user entity with the normalized details and hashed password.
    const user = this.usersRepository.create({
      email,
      phoneNumber: userData.phoneNumber,
      firstName,
      lastName,
      password: hashedPassword,
    });

    // Persist the new user record and return the saved entity.
    return this.usersRepository.save(user);
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    // Find the account associated with the supplied email verification token.
    return this.usersRepository.findOne({
      where: { emailVerificationToken: token },
    });
  }

  async save(user: User): Promise<User> {
    // Save changes made to a user entity.
    return this.usersRepository.save(user);
  }

  async linkWallet(userId: string, dto: LinkWalletDto): Promise<User> {
    // Extract the Stellar wallet address from the request DTO.
    const { address } = dto;

    // Check whether the wallet address is already linked to another account.
    const existingUser = await this.usersRepository.findOne({
      where: { stellarWalletAddress: address },
    });
    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException('This Stellar address is already linked to another account');
    }

    // Ensure the account being updated exists.
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    // Associate the wallet address with the user's account.
    user.stellarWalletAddress = address;
    const updatedUser = await this.usersRepository.save(user);

    // Notify subscribed listeners that a wallet has been linked.
    this.eventEmitter.emit('wallet.linked', { userId: user.id, address });

    return updatedUser;
  }

  async updateLastActiveAt(userId: string): Promise<void> {
    // Update the timestamp indicating the user's most recent activity.
    await this.usersRepository.update(userId, { lastActiveAt: new Date() });
  }

  /**
   * Track the last successful login timestamp.
   * @param userId - ID of the user whose login timestamp should be updated.
   */
  async updateLastLogin(userId: string): Promise<void> {
    // Record the current time as the user's most recent login.
    await this.usersRepository.update(userId, { lastLoginAt: new Date() });
  }

  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    // Find a user account using its registered phone number.
    return this.usersRepository.findOne({ where: { phoneNumber } });
  }

  /**
   * Determine whether a user is eligible to log in based on their account status.
   * @param userId - ID of the user to check.
   * @returns An object indicating login eligibility and, if denied, the reason.
   */
  async canUserLogin(userId: string): Promise<{ canLogin: boolean; reason?: string }> {
    // Retrieve the user's account status.
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    // Deny login when the account cannot be found.
    if (!user) {
      return { canLogin: false, reason: 'User not found' };
    }

    // Prefer the status field; fall back to isActive for older records.
    const userStatus = user.status || (user.isActive ? UserStatus.ACTIVE : UserStatus.INACTIVE);

    // Apply the login policy associated with the user's current status.
    switch (userStatus) {
      case UserStatus.ACTIVE:
        return { canLogin: true };
      case UserStatus.INACTIVE:
        return { canLogin: false, reason: 'Account is inactive' };
      case UserStatus.SUSPENDED:
        return { canLogin: false, reason: 'Account is suspended' };
      default:
        // Deny access when the account status is missing or unrecognized.
        return { canLogin: false, reason: 'Account status unknown' };
    }
  }

  /**
   * Fetch the profile data used in the authenticated user's response payload.
   * @param id - ID of the user whose profile should be retrieved.
   */
  async getProfile(id: string): Promise<User> {
    // Reuse the existing lookup logic to retrieve the user's profile.
    return this.findById(id);
  }
}
```;
