import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { HealthTask } from '../../../tasks/entities/health-task.entity';
import { SearchHistory } from '../../../database/entities/search-history.entity';
import { PaginatedResult } from '../../../common/pagination/paginated-result';
import { SearchTasksDto, SortOrder, TaskSortField } from '../dto/search-tasks.dto';

type SortOrderSql = 'ASC' | 'DESC';

@Injectable()
export class TaskSearchService {
  constructor(
    @InjectRepository(HealthTask)
    private readonly taskRepository: Repository<HealthTask>,
    @InjectRepository(SearchHistory)
    private readonly historyRepository: Repository<SearchHistory>
  ) {}

  /**
   * Search the tasks owned by `userId` (#1502).
   *
   * - Scope: every query is restricted to `task.createdBy = userId`, so a
   *   caller can never see another user's tasks, whatever filters are sent.
   * - Combining: all supplied filters are ANDed together.
   * - Ordering: always ends with `id DESC`, so ties in the requested sort
   *   column produce a stable, repeatable page order.
   * - Pagination: offset-based, 1-based pages, wrapped in the shared
   *   `PaginatedResult` envelope (`{ data, meta }`).
   */
  async searchTasks(dto: SearchTasksDto, userId: string): Promise<PaginatedResult<HealthTask>> {
    const page = dto.page && dto.page > 0 ? dto.page : 1;
    const limit = dto.limit && dto.limit > 0 ? dto.limit : 20;
    const sortBy = dto.sortBy ?? TaskSortField.CREATED_AT;
    const sortOrder = (
      (dto.sortOrder ?? SortOrder.DESC).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
    ) as SortOrderSql;

    const qb = this.taskRepository
      .createQueryBuilder('task')
      .where('task.createdBy = :userId', { userId })
      .andWhere('task.deletedAt IS NULL');

    this.applyFilters(qb, dto);

    qb.select([
      'task.id',
      'task.title',
      'task.description',
      'task.category',
      'task.status',
      'task.xlmReward',
      'task.isActive',
      'task.createdAt',
    ]);

    // `sortBy` is an enum-validated column name, never raw client input.
    qb.orderBy(`task.${sortBy}`, sortOrder)
      .addOrderBy('task.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [results, total] = await qb.getManyAndCount();

    if (this.hasFilters(dto)) {
      await this.recordSearch(dto, userId);
    }

    return PaginatedResult.of(results, total, { page, limit });
  }

  async getSearchHistory(userId: string): Promise<SearchHistory[]> {
    return this.historyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
  }

  private applyFilters(qb: SelectQueryBuilder<HealthTask>, dto: SearchTasksDto): void {
    if (dto.query) {
      qb.andWhere('(task.title ILIKE :query OR task.description ILIKE :query)', {
        query: `%${dto.query}%`,
      });
    }

    if (dto.status) {
      qb.andWhere('task.status = :status', { status: dto.status });
    }

    if (dto.category) {
      qb.andWhere('task.category = :category', { category: dto.category });
    }

    if (dto.startDate) {
      qb.andWhere('task.createdAt >= :startDate', {
        startDate: new Date(dto.startDate),
      });
    }

    if (dto.endDate) {
      qb.andWhere('task.createdAt <= :endDate', {
        endDate: new Date(dto.endDate),
      });
    }
  }

  private hasFilters(dto: SearchTasksDto): boolean {
    return Boolean(dto.query || dto.status || dto.category || dto.startDate || dto.endDate);
  }

  private async recordSearch(dto: SearchTasksDto, userId: string): Promise<void> {
    await this.historyRepository.save({
      query: dto.query ?? '',
      filters: {
        status: dto.status,
        category: dto.category,
        startDate: dto.startDate,
        endDate: dto.endDate,
        sortBy: dto.sortBy,
        sortOrder: dto.sortOrder,
      },
      userId,
    });
  }
}
