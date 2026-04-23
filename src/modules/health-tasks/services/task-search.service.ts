import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthTask } from '../../../tasks/entities/health-task.entity';
import { SearchHistory } from '../../../database/entities/search-history.entity';
import { SearchTasksDto } from '../dto/search-tasks.dto';

@Injectable()
export class TaskSearchService {
  constructor(
    @InjectRepository(HealthTask)
    private readonly taskRepository: Repository<HealthTask>,
    @InjectRepository(SearchHistory)
    private readonly historyRepository: Repository<SearchHistory>,
  ) {}

  async searchTasks(dto: SearchTasksDto, userId: string) {
    const { query, page = 1, limit = 10, ...filters } = dto;
    const qb = this.taskRepository.createQueryBuilder('task');

    if (query) {
      // Full-text search (simple ILIKE for demonstration)
      qb.andWhere(
        '(task.title ILIKE :query OR task.description ILIKE :query)',
        { query: `%${query}%` },
      );
    }

    if (filters.category) {
      qb.andWhere('task.category = :category', { category: filters.category });
    }

    if (filters.status) {
      qb.andWhere('task.status = :status', { status: filters.status });
    }

    if (filters.minReward !== undefined) {
      qb.andWhere('task.xlmReward >= :minReward', { minReward: filters.minReward });
    }

    if (filters.maxReward !== undefined) {
      qb.andWhere('task.xlmReward <= :maxReward', { maxReward: filters.maxReward });
    }

    if ((filters as any).createdBy) {
      qb.andWhere('task.createdBy = :createdBy', { createdBy: (filters as any).createdBy });
    }

    if ((filters as any).isActive !== undefined) {
      qb.andWhere('task.isActive = :isActive', { isActive: (filters as any).isActive });
    }

    // Sorting
    qb.orderBy('task.createdAt', 'DESC');

    // Pagination (#512)
    qb.skip((page - 1) * limit);
    qb.take(limit);

    // Optimization (#512): Field projection
    qb.select([
      'task.id',
      'task.title',
      'task.description',
      'task.category',
      'task.status',
      'task.xlmReward',
      'task.createdAt',
    ]);

    const [results, total] = await qb.getManyAndCount();

    // Save search history
    if (query || Object.keys(filters).length > 0) {
      await this.historyRepository.save({
        query: query || '',
        filters: filters as any,
        userId,
      });
    }

    return {
      data: results,
      total,
      page,
      limit,
    };
  }

  async getSearchHistory(userId: string): Promise<SearchHistory[]> {
    return this.historyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
  }
}
