import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { ResendEmailVerificationDto, VerifyEmailDto } from '../dto/verify-email.dto';
import { Role } from '../enums/role.enum';
import { UsersService } from './users.service';

@Injectable()
export class AuthService {
  private redisClient: RedisClientType;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private eventEmitter: EventEmitter2,
  ) {
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    this.redisClient.connect();
  }

  // Register user
  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) throw new ConflictException('Email already exists');

    const user = await this.usersService.create(dto);

    this.eventEmitter.emit('user.registered', {
      userId: user.id,
      email: user.email,
    });

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { token };
  }

  // Login user
  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches)
      throw new UnauthorizedException('Invalid credentials');

    return this.generateTokens(user.id, user.email, user.role);
  }

  // Refresh access token
  async refresh(userId: string, oldRefreshToken: string) {
    const storedToken = await this.redisClient.get(`refresh:${userId}`);
    if (!storedToken || storedToken !== oldRefreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.redisClient.del(`refresh:${userId}`);

    const user = await this.usersService.findById(userId);
    return this.generateTokens(user.id, user.email, user.role);
  }

  private async generateTokens(userId: string, email: string, role: Role) {
    const accessToken = this.jwtService.sign(
      { sub: userId, email, role },
      { expiresIn: '15m' },
    );
    const refreshToken = this.jwtService.sign(
      { sub: userId, email, role },
      { expiresIn: '7d' },
    );

    await this.redisClient.set(`refresh:${userId}`, refreshToken, {
      EX: 7 * 24 * 60 * 60,
    });

    return { accessToken, refreshToken };
  }

  // Logout
  async logout(userId: string) {
    await this.redisClient.del(`refresh:${userId}`);
  }

  // Verify email
  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.usersService.findByVerificationToken(dto.token);

    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    if (
      user.emailVerificationExpiry &&
      user.emailVerificationExpiry < new Date()
    ) {
      throw new BadRequestException('Verification token has expired');
    }

    // Clear verification token and mark email as verified
    user.emailVerificationToken = undefined;
    user.emailVerificationExpiry = undefined;
    user.isVerified = true;

    await this.usersService.save(user);

    // Emit email verified event
    this.eventEmitter.emit('user.email.verified', {
      userId: user.id,
      email: user.email,
    });

    return { message: 'Email verified successfully' };
  }

  // Resend email verification
  async resendEmailVerification(dto: ResendEmailVerificationDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email is already verified');
    }

    // Check rate limit (3 per hour)
    const rateLimitKey = `email_verify:${user.email}`;
    const currentCount = await this.redisClient.get(rateLimitKey);

    if (currentCount && parseInt(currentCount) >= 3) {
      throw new BadRequestException(
        'Too many verification requests. Please try again later.',
      );
    }

    // Generate new verification token
    const verificationToken = uuidv4();
    const expiryTime = new Date();
    expiryTime.setHours(expiryTime.getHours() + 24); // 24-hour expiry

    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpiry = expiryTime;

    await this.usersService.save(user);

    // Increment rate limit counter
    await this.redisClient.incr(rateLimitKey);
    await this.redisClient.expire(rateLimitKey, 3600); // 1 hour expiry

    // TODO: Send verification email
    // this.emailService.sendVerificationEmail(user.email, verificationToken);

    return { message: 'Verification email sent' };
  }
}
