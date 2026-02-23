import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisClientType, createClient } from 'redis';
import { User } from 'src/auth/entities/user.entity';
import { ListUsersDto } from '../dto/list-users.dto';
import { Role } from 'src/auth/enums/role.enum';
import { AuditService } from 'src/audit/audit.service';

@Injectable()
export class AdminUsersService {
  private redisClient: RedisClientType;

  constructor(
    @InjectRepository(User) private usersRepository: Repository<User>,
    private auditService: AuditService,
  ) {
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    this.redisClient.connect();
  }

  // List users with filters
  async listUsers(dto: ListUsersDto) {
    const page = dto.page ? parseInt(dto.page) : 1;
    const limit = dto.limit ? parseInt(dto.limit) : 20;

    const qb = this.usersRepository.createQueryBuilder('user');

    if (dto.country)
      qb.andWhere('user.country = :country', { country: dto.country });
    if (dto.role) qb.andWhere('user.role = :role', { role: dto.role });
    if (dto.isActive !== undefined) {
      const active = dto.isActive === 'true';
      qb.andWhere('user.isActive = :active', { active });
    }
    if (dto.search) {
      qb.andWhere('(user.name ILIKE :search OR user.email ILIKE :search)', {
        search: `%${dto.search}%`,
      });
    }

    qb.skip((page - 1) * limit).take(limit);

    const [users, total] = await qb.getManyAndCount();
    return { users, total, page, limit };
  }

  async getUserById(id: string) {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new BadRequestException('User not found');
    return user;
  }

  async changeRole(adminId: string, userId: string, role: Role) {
    if (adminId === userId)
      throw new ForbiddenException('Admins cannot change their own role');

    const user = await this.getUserById(userId);
    user.role = role;
    const updatedUser = await this.usersRepository.save(user);

    await this.auditService.logAction(
      adminId,
      `Changed role of user ${userId} to ${role}`,
    );
    return updatedUser;
  }

  async suspendUser(adminId: string, userId: string) {
    if (adminId === userId)
      throw new ForbiddenException('Admins cannot suspend themselves');

    const user = await this.getUserById(userId);
    user.isActive = false;
    const updatedUser = await this.usersRepository.save(user);

    // Invalidate refresh tokens in Redis
    await this.redisClient.del(`refresh:${userId}`);

    await this.auditService.logAction(adminId, `Suspended user ${userId}`);
    return updatedUser;
  }
}
