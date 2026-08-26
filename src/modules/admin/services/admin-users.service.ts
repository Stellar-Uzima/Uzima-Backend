import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisClientType, createClient } from 'redis';
import * as bcrypt from 'bcryptjs';
import { User } from '@/entities/user.entity';
import { ListUsersDto } from '../dto/list-users.dto';
import { CreateAdminDto } from '../dto/create-admin.dto';
import { Role } from '@modules/auth/enums/role.enum';
import { UserStatus } from '@modules/auth/enums/user-status.enum';
import { AuditService } from '@/audit/audit.service';
import { StreaksService } from '@/streaks/streaks.service';

/**
 * Provides admin-level user management operations including user
 * creation, role changes, suspension, reactivation, and deletion.
 */
@Injectable()
export class AdminUsersService {
  private readonly redisClient: RedisClientType;

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly auditService: AuditService,
    private readonly streaksService: StreaksService,
  ) {
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    this.redisClient.connect().catch(() => undefined);
  }

  async createAdminUser(adminId: string, dto: CreateAdminDto) {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const user = this.usersRepository.create({
      email: dto.email.trim().toLowerCase(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: hashedPassword,
      country: dto.country,
      role: Role.ADMIN,
      isActive: true,
      status: UserStatus.ACTIVE,
      isVerified: true,
    });

    const savedUser = await this.usersRepository.save(user);
    await this.auditService.logAction(adminId, `Created admin user ${savedUser.id}`);

    const { password, ...result } = savedUser as User & { password: string };
    return result;
  }

  async searchUsers(query: string) {
    if (!query || query.trim().length === 0) {
      return { data: [], total: 0 };
    }
    const qb = this.usersRepository.createQueryBuilder('user')
      .where('(user.firstName ILIKE :q OR user.lastName ILIKE :q OR user.email ILIKE :q)',
        { q: `%${query.trim()}%` })
      .andWhere('user.deletedAt IS NULL')
      .select([
        'user.id', 'user.email', 'user.firstName', 'user.lastName',
        'user.role', 'user.country', 'user.isActive',
        'user.createdAt', 'user.updatedAt',
      ])
      .take(20);
    const [users, total] = await qb.getManyAndCount();
    return { data: users, total };
  }

  async listUsers(dto: ListUsersDto) {
    const page = dto.page || 1;
    const limit = dto.limit || 20;

    const qb = this.usersRepository.createQueryBuilder('user');

    if (dto.country) {
      qb.andWhere('user.country = :country', { country: dto.country });
    }

    if (dto.role) {
      qb.andWhere('user.role = :role', { role: dto.role });
    }

    if (dto.isActive !== undefined) {
      qb.andWhere('user.isActive = :active', { active: dto.isActive });
    }

    qb.andWhere('user.deletedAt IS NULL');

    if (dto.search) {
      qb.andWhere(
        '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search)',
        { search: `%${dto.search}%` },
      );
    }

    qb.select([
      'user.id',
      'user.email',
      'user.firstName',
      'user.lastName',
      'user.role',
      'user.country',
      'user.isActive',
      'user.stellarWalletAddress',
      'user.createdAt',
      'user.updatedAt',
    ]);

    qb.skip((page - 1) * limit).take(limit);

    const [users, total] = await qb.getManyAndCount();

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserById(id: string) {
    const user = await this.usersRepository.findOne({
      where: { id },
      select: [
        'id',
        'email',
        'firstName',
        'lastName',
        'role',
        'country',
        'isActive',
        'status',
        'stellarWalletAddress',
        'createdAt',
        'updatedAt',
      ],
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    return user;
  }

  async getUserStreaks(id: string) {
    // verify user exists, which returns 404 (or throws BadRequest/NotFound depending on service)
    // Wait, the instructions say "Returns 404 if user not found".
    // getUserById throws BadRequestException in AdminUsersService. 
    // We can just use userRepo to check if user exists.
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    
    return this.streaksService.getStreakHistory(id);
  }

  async changeRole(adminId: string, userId: string, role: Role) {
    if (adminId === userId) {
      throw new ForbiddenException('Admins cannot change their own role');
    }

    const user = await this.getUserById(userId);
    user.role = role;
    const updatedUser = await this.usersRepository.save(user);
    await this.auditService.logAction(adminId, `Changed role of user ${userId} to ${role}`);
    return updatedUser;
  }

  async suspendUser(adminId: string, userId: string) {
    if (adminId === userId) {
      throw new ForbiddenException('Admins cannot suspend themselves');
    }

    const user = await this.getUserById(userId);
    user.isActive = false;
    user.status = UserStatus.SUSPENDED;
    const updatedUser = await this.usersRepository.save(user);
    await this.redisClient.del(`refresh:${userId}`);
    await this.auditService.logAction(adminId, `Suspended user ${userId}`);
    return updatedUser;
  }

  async reactivateUser(adminId: string, userId: string) {
    if (adminId === userId) {
      throw new ForbiddenException('Admins cannot reactivate themselves');
    }

    const user = await this.usersRepository.findOne({
      where: { id: userId },
      withDeleted: true,
      select: [
        'id',
        'email',
        'firstName',
        'lastName',
        'role',
        'country',
        'isActive',
        'status',
        'stellarWalletAddress',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ],
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.deletedAt) {
      await this.usersRepository.restore(userId);
    }

    user.isActive = true;
    user.status = UserStatus.ACTIVE;
    user.deletedAt = null;
    const updatedUser = await this.usersRepository.save(user);
    await this.auditService.logAction(adminId, `Reactivated user ${userId}`);
    return updatedUser;
  }

  async deleteUser(adminId: string, userId: string) {
    if (adminId === userId) {
      throw new ForbiddenException('Admins cannot delete their own account');
    }

    const user = await this.getUserById(userId);
    await this.usersRepository.softRemove(user);
    user.isActive = false;
    user.status = UserStatus.INACTIVE;
    await this.usersRepository.save(user);
    await this.usersRepository.softDelete(userId);
    await this.redisClient.del(`refresh:${userId}`);
    await this.auditService.logAction(adminId, `Soft deleted user ${userId} (${user.email})`);
    return { message: 'User deleted successfully' };
  }

  async getUserTasks(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'firstName', 'lastName', 'role'],
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      tasks: [],
    };
  }
}
