import { Repository, SelectQueryBuilder } from 'typeorm';
import { UserSearchService } from './user-search.service';
import { UserSearchDto } from '../dto/user-search.dto';
import { User } from '../../../entities/user.entity';
import { Role } from '../../../auth/enums/role.enum';
import { UserStatus } from '../../../auth/enums/user-status.enum';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('UserSearchService', () => {
  let service: UserSearchService;
  let repository: jest.Mocked<Repository<User>>;
  let queryBuilder: jest.Mocked<SelectQueryBuilder<User>>;

  const users: User[] = [
    {
      id: '1',
      email: 'verified@example.com',
      firstName: 'Verified',
      lastName: 'User',
      fullName: 'Verified User',
      role: Role.USER,
      status: UserStatus.ACTIVE,
      isVerified: true,
      phoneNumber: '+1234567890',
      walletAddress: null,
      country: 'US',
      preferredLanguage: 'en',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      lastActiveAt: new Date('2024-01-01T00:00:00.000Z'),
      isActive: true,
      dailyXlmEarned: 0,
      referralCode: null,
      password: 'secret',
      emailVerificationToken: null,
      emailVerificationExpiry: null,
      passwordResetToken: null,
      passwordResetExpiry: null,
      stellarWalletAddress: null,
    },
  ];

  beforeEach(() => {
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(users.length),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(users),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    } as any;

    repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      count: jest.fn().mockResolvedValue(users.length),
    } as any;

    service = new UserSearchService(repository);
  });

  it('should return paginated results including metadata', async () => {
    const searchDto: UserSearchDto = {
      page: 1,
      limit: 10,
    };

    const result = await service.searchUsers(searchDto);

    expect(repository.createQueryBuilder).toHaveBeenCalledWith('user');
    expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(queryBuilder.take).toHaveBeenCalledWith(10);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.total).toBe(users.length);
    expect(result.results).toHaveLength(1);
  });

  it('should apply isVerified filter', async () => {
    const searchDto: UserSearchDto = {
      isVerified: true,
    };

    await service.searchUsers(searchDto);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.isVerified = :isVerified', {
      isVerified: true,
    });
  });

  it('should apply createdAt date range filters', async () => {
    const searchDto: UserSearchDto = {
      createdAtFrom: '2024-01-01T00:00:00.000Z',
      createdAtTo: '2024-12-31T23:59:59.999Z',
    };

    await service.searchUsers(searchDto);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.createdAt >= :createdAtFrom', {
      createdAtFrom: new Date('2024-01-01T00:00:00.000Z'),
    });
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.createdAt <= :createdAtTo', {
      createdAtTo: new Date('2024-12-31T23:59:59.999Z'),
    });
  });

  it('should support paging into later pages', async () => {
    const searchDto: UserSearchDto = {
      page: 3,
      limit: 5,
    };

    await service.searchUsers(searchDto);

    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
    expect(queryBuilder.take).toHaveBeenCalledWith(5);
  });
});
