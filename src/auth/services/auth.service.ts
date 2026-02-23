import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createClient, RedisClientType } from 'redis';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { Role } from '../enums/role.enum';

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
}
