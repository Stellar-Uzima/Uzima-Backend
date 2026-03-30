import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ListUsersDto } from '../dto/list-users.dto';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async listUsers(dto: ListUsersDto) {
    const { page = 1, limit = 20, isActive, role } = dto;

    const query = this.userRepository.createQueryBuilder('user');

    if (isActive !== undefined) {
      query.andWhere('user.isActive = :isActive', { isActive });
    }

    if (role) {
      query.andWhere('user.role = :role', { role });
    }

    query
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await query.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}