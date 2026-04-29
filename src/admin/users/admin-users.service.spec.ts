import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminUsersService } from './admin-users.service';
import { User } from '../../users/entities/user.entity';

const mockQueryBuilder = {
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn(),
};

const mockUserRepository = {
  createQueryBuilder: jest.fn(() => mockQueryBuilder),
};

describe('AdminUsersService', () => {
  let service: AdminUsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<AdminUsersService>(AdminUsersService);
    jest.clearAllMocks();
  });

  it('should return paginated users', async () => {
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[{ id: '1' }], 1]);
    const result = await service.listUsers({ page: 1, limit: 20 });
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('should filter by isActive when provided', async () => {
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
    await service.listUsers({ page: 1, limit: 20, isActive: false });
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'user.isActive = :isActive',
      { isActive: false },
    );
  });

  it('should filter by role when provided', async () => {
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
    await service.listUsers({ page: 1, limit: 20, role: 'HEALER' });
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'user.role = :role',
      { role: 'HEALER' },
    );
  });
});