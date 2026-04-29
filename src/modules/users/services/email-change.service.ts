import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { User } from '../../../entities/user.entity';

export interface EmailChangeRequest {
  token: string;
  userId: string;
  newEmail: string;
  expiresAt: Date;
  confirmedAt: Date | null;
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class EmailChangeService {
  private readonly pending = new Map<string, EmailChangeRequest>();

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async initiateChange(userId: string, newEmail: string): Promise<{ token: string }> {
    const user = await this.findUser(userId);

    if (user.email?.toLowerCase() === newEmail.toLowerCase()) {
      throw new BadRequestException('New email must differ from the current email');
    }

    const existing = await this.userRepo.findOne({ where: { email: newEmail } });
    if (existing) {
      throw new ConflictException('Email is already in use by another account');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    this.pending.set(token, {
      token,
      userId,
      newEmail,
      expiresAt,
      confirmedAt: null,
    });

    // In production: send verification email to newEmail and notification to user.email
    return { token };
  }

  async confirmChange(token: string): Promise<User> {
    const request = this.pending.get(token);

    if (!request) {
      throw new BadRequestException('Invalid or expired email change token');
    }

    if (request.expiresAt < new Date()) {
      this.pending.delete(token);
      throw new BadRequestException('Email change token has expired');
    }

    const user = await this.findUser(request.userId);

    user.email = request.newEmail;
    user.isVerified = true;

    const saved = await this.userRepo.save(user);

    request.confirmedAt = new Date();
    this.pending.delete(token);

    return saved;
  }

  async cancelChange(userId: string): Promise<void> {
    for (const [token, req] of this.pending.entries()) {
      if (req.userId === userId) {
        this.pending.delete(token);
      }
    }
  }

  getPendingRequest(userId: string): EmailChangeRequest | null {
    return (
      Array.from(this.pending.values()).find(
        (r) => r.userId === userId && r.expiresAt > new Date(),
      ) ?? null
    );
  }

  private async findUser(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return user;
  }
}
