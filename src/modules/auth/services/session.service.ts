import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from '../../../database/entities/session.entity';
import { UsersService } from './users.service';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private readonly repo: Repository<Session>,
    private readonly usersService: UsersService,
  ) {}

  async createSession(userId: string, tokenId: string, meta?: { device?: string; ip?: string; userAgent?: string }) {
    const user = await this.usersService.findById(userId);
    const session = this.repo.create({
      tokenId,
      user,
      device: meta?.device,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      isActive: true,
    });
    return this.repo.save(session);
  }

  async listUserSessions(userId: string) {
    return this.repo.find({ where: { user: { id: userId }, isActive: true }, relations: ['user'] });
  }

  async revokeSession(tokenId: string) {
    const session = await this.repo.findOne({ where: { tokenId } });
    if (!session) return false;
    session.isActive = false;
    await this.repo.save(session);
    return true;
  }

  async revokeAllSessions(userId: string) {
    const sessions = await this.repo.find({ where: { user: { id: userId }, isActive: true } });
    if (sessions.length === 0) return 0;
    for (const s of sessions) {
      s.isActive = false;
    }
    await this.repo.save(sessions);
    return sessions.length;
  }

  async touchSession(tokenId: string) {
    await this.repo.update({ tokenId }, { lastActiveAt: new Date() });
  }
}
