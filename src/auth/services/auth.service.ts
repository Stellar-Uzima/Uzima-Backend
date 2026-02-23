// src/auth/auth.service.ts
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { RegisterDto } from '../dto/register.dto';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from '../dto/login.dto';
import { RedisClientType } from 'redis';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private eventEmitter: EventEmitter2,
    private redisClient: RedisClientType,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const user = await this.usersService.create(dto);

    // Emit user.registered event
    this.eventEmitter.emit('user.registered', {
      userId: user.id,
      email: user.email,
    });

    // Sign JWT
    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { token };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches)
      throw new UnauthorizedException('Invalid credentials');

    return this.generateTokens(user.id, user.email);
  }

  private async generateTokens(userId: string, email: string) {
    const accessToken = this.jwtService.sign(
      { sub: userId, email },
      { expiresIn: '15m' },
    );
    const refreshToken = this.jwtService.sign(
      { sub: userId, email },
      { expiresIn: '7d' },
    );

    // Store refresh token in Redis with 7-day TTL
    await this.redisClient.set(`refresh:${userId}`, refreshToken, {
      EX: 7 * 24 * 60 * 60,
    });

    return { accessToken, refreshToken };
  }

  async refresh(userId: string, oldRefreshToken: string) {
    const storedToken = await this.redisClient.get(`refresh:${userId}`);
    if (!storedToken || storedToken !== oldRefreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Invalidate old token
    await this.redisClient.del(`refresh:${userId}`);

    // Issue new tokens
    return this.generateTokens(
      userId,
      (await this.usersService.findById(userId)).email,
    );
  }

  async logout(userId: string) {
    await this.redisClient.del(`refresh:${userId}`);
  }
}
