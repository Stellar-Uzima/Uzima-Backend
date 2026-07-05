import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } as any });
  }

  async getProfile(userId: string): Promise<any> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, data: any): Promise<any> {
    await this.usersRepository.update(userId as any, data);
    return this.findById(userId);
  }

  async registerDeviceToken(userId: string, token: string): Promise<void> {
    await this.usersRepository.update(userId as any, { deviceToken: token } as any);
  }

  async updateLastActiveAt(userId: string): Promise<void> {
    await this.usersRepository.update(userId as any, { updatedAt: new Date() } as any);
  }

  async deactivateUser(userId: string): Promise<void> {
    await this.usersRepository.update(userId as any, { isActive: false } as any);
  }

  async cleanupOldStatusLogs(retentionDays: number): Promise<number> {
    return 0;
  }
}