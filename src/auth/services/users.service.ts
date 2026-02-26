import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { LinkWalletDto } from '../dto/link-wallet.dto';
import { User } from '../../entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private eventEmitter: EventEmitter2,
  ) { }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new Error('User not found');
    return user;
  }

  async create(userData: Partial<User> & { name?: string; fullName?: string; country?: string }): Promise<User> {
    if (!userData.password) {
      throw new Error('Password is required');
    }

    const hashedPassword = await bcrypt.hash(userData.password, 12);
    const fullName = (userData.fullName ?? userData.name ?? '').trim() || 'User';
    const spaceIndex = fullName.indexOf(' ');
    const firstName = spaceIndex > 0 ? fullName.slice(0, spaceIndex) : fullName;
    const lastName = spaceIndex > 0 ? fullName.slice(spaceIndex + 1) : fullName;

    const user = this.usersRepository.create({
      email: userData.email!,
      firstName,
      lastName,
      password: hashedPassword,
    });

    return this.usersRepository.save(user);
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { emailVerificationToken: token },
    });
  }

  async save(user: User): Promise<User> {
    return this.usersRepository.save(user);
  }

  async linkWallet(userId: string, dto: LinkWalletDto): Promise<User> {
    const { address } = dto;

    // Check if address is already linked to another account
    const existingUser = await this.usersRepository.findOne({
      where: { stellarWalletAddress: address },
    });
    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException(
        'This Stellar address is already linked to another account',
      );
    }

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    user.stellarWalletAddress = address;
    const updatedUser = await this.usersRepository.save(user);

    // Emit wallet linked event
    this.eventEmitter.emit('wallet.linked', { userId: user.id, address });

    return updatedUser;
  }

  async updateLastActiveAt(userId: string): Promise<void> {
    await this.usersRepository.update(userId, { lastActiveAt: new Date() });
  }

  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { phoneNumber } });
  }
}
