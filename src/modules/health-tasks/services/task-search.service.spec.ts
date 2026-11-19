import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TaskSearchService } from './task-search.service';
import { HealthTask, TaskCategory } from '../../../tasks/entities/health-task.entity';
import { SearchHistory } from '../../../database/entities/search-history.entity';
import { TaskStatus } from '../../../tasks/enums/task-status.enum';
import { SearchTasksDto, SortOrder, TaskSortField } from '../dto/search-tasks.dto';

describe('TaskSearchService (#1502)', () => {
  let service: TaskSearchService;

  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  };

  const taskRepo = { createQueryBuilder: jest.fn(() => qb) };
  const historyRepo = { save: jest.fn().mockResolvedValue({}), find: jest.fn() };

  const dto = (overrides: Partial<SearchTasksDto> = {}) =>
    Object.assign(new SearchTasksDto(), overrides);

  /** All `andWhere` SQL fragments, joined for easy assertions. */
  const whereSql = () =>
    qb.andWhere.mock.calls.map((call: unknown[]) => String(call[0])).join(' | ');

  beforeEach(async () => {
    jest.clearAllMocks();
    qb.getManyAndCount.mockResolvedValue([[], 0]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskSearchService,
        { provide: getRepositoryToken(HealthTask), useValue: taskRepo },
        { provide: getRepositoryToken(SearchHistory), useValue: historyRepo },
      ],
    }).compile();

    service = module.get(TaskSearchService);
  });

  it('always scopes the query to the authenticated user', async () => {
    await service.searchTasks(dto(), 'user-1');
    await service.searchTasks(dto({ category: TaskCategory.SLEEP }), 'user-1');

    expect(qb.where).toHaveBeenCalledWith('task.createdBy = :userId', {
      userId: 'user-1',
    });
    expect(qb.where).toHaveBeenCalledTimes(2);
  });

  it('combines every supplied filter with AND', async () => {
    await service.searchTasks(
      dto({
        query: 'water',
        status: TaskStatus.ACTIVE,
        category: TaskCategory.FITNESS,
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-02-01T00:00:00.000Z',
      }),
      'user-1',
    );

    const sql = whereSql();
    expect(sql).toContain('task.title ILIKE :query');
    expect(sql).toContain('task.status = :status');
    expect(sql).toContain('task.category = :category');
    expect(sql).toContain('task.createdAt >= :startDate');
    expect(sql).toContain('task.createdAt <= :endDate');

    const params = qb.andWhere.mock.calls.map((call: unknown[]) => call[1]);
    expect(params).toContainEqual({ query: '%water%' });
    expect(params).toContainEqual({ status: TaskStatus.ACTIVE });
    expect(params).toContainEqual({ category: TaskCategory.FITNESS });
  });

  it('applies no filter predicates when only pagination is supplied', async () => {
    await service.searchTasks(dto({ page: 2, limit: 5 }), 'user-1');

    // Only the soft-delete guard is applied, no user-supplied filter.
    expect(whereSql()).toBe('task.deletedAt IS NULL');
  });

  it('defaults to newest first with an id tiebreaker for stable paging', async () => {
    await service.searchTasks(dto(), 'user-1');

    expect(qb.orderBy).toHaveBeenCalledWith('task.createdAt', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('task.id', 'DESC');
  });

  it('honours a whitelisted sort field and direction', async () => {
    await service.searchTasks(
      dto({ sortBy: TaskSortField.TITLE, sortOrder: SortOrder.ASC }),
      'user-1',
    );

    expect(qb.orderBy).toHaveBeenCalledWith('task.title', 'ASC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('task.id', 'DESC');
  });

  it('translates page and limit into skip and take', async () => {
    await service.searchTasks(dto({ page: 3, limit: 25 }), 'user-1');

    expect(qb.skip).toHaveBeenCalledWith(50);
    expect(qb.take).toHaveBeenCalledWith(25);
  });

  it('returns the shared pagination envelope with total pages', async () => {
    qb.getManyAndCount.mockResolvedValue([[{ id: 't1' }, { id: 't2' }], 42]);

    const result = await service.searchTasks(dto({ page: 2, limit: 2 }), 'user-1');

    expect(result.data).toHaveLength(2);
    expect(result.meta).toMatchObject({
      page: 2,
      limit: 2,
      total: 42,
      totalPages: 21,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  });

  it('records a search only when at least one filter is present', async () => {
    await service.searchTasks(dto({ page: 1 }), 'user-1');
    expect(historyRepo.save).not.toHaveBeenCalled();

    await service.searchTasks(dto({ category: TaskCategory.MENTAL }), 'user-1');
    expect(historyRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
    );
  });
});
