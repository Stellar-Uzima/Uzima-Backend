import { Test, TestingModule } from '@nestjs/testing';
import { UserSearchService } from './services/user-search.service';
import { UserSearchDto, UserSearchResponseDto } from './dto/user-search.dto';
import { User } from '../../entities/user.entity';
import { Role } from '../../auth/enums/role.enum';
import { UserStatus } from '../../auth/enums/user-status.enum';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('UserSearchService', () => {
  let service: UserSearchService;
  let repository: jest.Mocked<Repository<User>>;
  let queryBuilder: jest.Mocked<SelectQueryBuilder<User>>;

  const mockUsers: User[] = [
    {
      id: '1',
      email: 'john.doe@example.com',
      firstName: 'John',
      lastName: 'Doe',
      fullName: 'John Doe',
      role: Role.USER,
      status: UserStatus.ACTIVE,
      isVerified: true,
      phoneNumber: '+1234567890',
      walletAddress: 'https://example.com/avatar1.jpg',
      country: 'US',
      preferredLanguage: 'en',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      lastActiveAt: new Date('2024-01-01'),
      isActive: true,
      dailyXlmEarned: 0,
      referralCode: null,
      password: 'hashed',
      emailVerificationToken: null,
      emailVerificationExpiry: null,
      passwordResetToken: null,
      passwordResetExpiry: null,
      stellarWalletAddress: null,
    },
    {
      id: '2',
      email: 'jane.smith@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      fullName: 'Jane Smith',
      role: Role.HEALER,
      status: UserStatus.ACTIVE,
      isVerified: false,
      phoneNumber: '+1987654321',
      walletAddress: null,
      country: 'GB',
      preferredLanguage: 'en',
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
      lastActiveAt: new Date('2024-01-02'),
      isActive: true,
      dailyXlmEarned: 0,
      referralCode: null,
      password: 'hashed',
      emailVerificationToken: null,
      emailVerificationExpiry: null,
      passwordResetToken: null,
      passwordResetExpiry: null,
      stellarWalletAddress: null,
    },
    {
      id: '3',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      fullName: 'Admin User',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      isVerified: true,
      phoneNumber: null,
      walletAddress: 'https://example.com/avatar3.jpg',
      country: 'CA',
      preferredLanguage: 'fr',
      createdAt: new Date('2024-01-03'),
      updatedAt: new Date('2024-01-03'),
      lastActiveAt: new Date('2024-01-03'),
      isActive: true,
      dailyXlmEarned: 0,
      referralCode: null,
      password: 'hashed',
      emailVerificationToken: null,
      emailVerificationExpiry: null,
      passwordResetToken: null,
      passwordResetExpiry: null,
      stellarWalletAddress: null,
    },
  ];

  beforeEach(async () => {
    // Mock query builder
    queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(mockUsers.length),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(mockUsers),
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    } as any;

    // Mock repository
    repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      count: jest.fn().mockResolvedValue(mockUsers.length),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSearchService,
        {
          provide: getRepositoryToken(User),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<UserSearchService>(UserSearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchUsers', () => {
    it('should return all users when no query is provided', async () => {
      const searchDto: UserSearchDto = {};

      const result = await service.searchUsers(searchDto);

      expect(repository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(queryBuilder.getCount).toHaveBeenCalled();
      expect(queryBuilder.getMany).toHaveBeenCalled();
      
      expect(result.results).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.fuzzyUsed).toBe(false);
      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    it('should search with fuzzy matching enabled', async () => {
      const searchDto: UserSearchDto = {
        query: 'john',
        fuzzy: true,
      };

      const result = await service.searchUsers(searchDto);

      expect(result.query).toBe('john');
      expect(result.fuzzyUsed).toBe(true);
      expect(result.results).toHaveLength(3);
    });

    it('should search with exact matching', async () => {
      const searchDto: UserSearchDto = {
        query: 'john',
        fuzzy: false,
      };

      const result = await service.searchUsers(searchDto);

      expect(result.query).toBe('john');
      expect(result.fuzzyUsed).toBe(false);
      expect(result.results).toHaveLength(3);
    });

    it('should apply role filter', async () => {
      const searchDto: UserSearchDto = {
        role: Role.USER,
      };

      await service.searchUsers(searchDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.role = :role', { role: Role.USER });
    });

    it('should apply status filter', async () => {
      const searchDto: UserSearchDto = {
        status: UserStatus.INACTIVE,
      };

      await service.searchUsers(searchDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.status = :status', { 
        status: UserStatus.INACTIVE 
      });
    });

    it('should apply isVerified filter', async () => {
      const searchDto: UserSearchDto = {
        isVerified: true,
      };

      await service.searchUsers(searchDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.isVerified = :isVerified', { 
        isVerified: true 
      });
    });

    it('should apply country filter', async () => {
      const searchDto: UserSearchDto = {
        country: 'US',
      };

      await service.searchUsers(searchDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.country = :country', { country: 'US' });
    });

    it('should apply preferredLanguage filter', async () => {
      const searchDto: UserSearchDto = {
        preferredLanguage: 'en',
      };

      await service.searchUsers(searchDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('user.preferredLanguage = :preferredLanguage', { 
        preferredLanguage: 'en' 
      });
    });

    it('should apply hasPhone filter', async () => {
      const searchDto: UserSearchDto = {
        hasPhone: true,
      };

      await service.searchUsers(searchDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'user.phoneNumber IS NOT NULL AND user.phoneNumber != \'\'',
        {}
      );
    });

    it('should apply hasAvatar filter', async () => {
      const searchDto: UserSearchDto = {
        hasAvatar: true,
      };

      await service.searchUsers(searchDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'user.walletAddress IS NOT NULL AND user.walletAddress != \'\'',
        {}
      );
    });

    it('should apply pagination', async () => {
      const searchDto: UserSearchDto = {
        page: 2,
        limit: 10,
      };

      await service.searchUsers(searchDto);

      expect(queryBuilder.skip).toHaveBeenCalledWith(10); // (2-1) * 10
      expect(queryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should apply sorting', async () => {
      const searchDto: UserSearchDto = {
        sortBy: 'firstName',
        sortOrder: 'ASC',
      };

      await service.searchUsers(searchDto);

      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('user.firstName', 'ASC');
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('user.id', 'ASC'); // Secondary sort
    });

    it('should default sort by createdAt DESC', async () => {
      const searchDto: UserSearchDto = {};

      await service.searchUsers(searchDto);

      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('user.createdAt', 'DESC');
    });

    it('should handle multi-term search with fuzzy matching', async () => {
      const searchDto: UserSearchDto = {
        query: 'john doe',
        fuzzy: true,
      };

      await service.searchUsers(searchDto);

      // Should call andWhere with multi-term conditions
      expect(queryBuilder.andWhere).toHaveBeenCalled();
    });

    it('should calculate relevance scores for fuzzy search', async () => {
      const searchDto: UserSearchDto = {
        query: 'john',
        fuzzy: true,
      };

      const result = await service.searchUsers(searchDto);

      // Results should have relevance scores
      expect(result.results[0]).toHaveProperty('score');
      expect(typeof result.results[0].score).toBe('number');
      expect(result.results[0].score).toBeGreaterThanOrEqual(0);
      expect(result.results[0].score).toBeLessThanOrEqual(1);
    });

    it('should not calculate relevance scores for exact search', async () => {
      const searchDto: UserSearchDto = {
        query: 'john',
        fuzzy: false,
      };

      const result = await service.searchUsers(searchDto);

      // Results should not have relevance scores
      expect(result.results[0]).not.toHaveProperty('score');
    });

    it('should sort by relevance score for fuzzy search', async () => {
      const searchDto: UserSearchDto = {
        query: 'john',
        fuzzy: true,
      };

      const result = await service.searchUsers(searchDto);

      // Results should be sorted by score (highest first)
      const scores = result.results.map(r => r.score || 0);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i-1]).toBeGreaterThanOrEqual(scores[i]);
      }
    });

    it('should handle empty search results', async () => {
      queryBuilder.getCount.mockResolvedValue(0);
      queryBuilder.getMany.mockResolvedValue([]);

      const searchDto: UserSearchDto = { query: 'nonexistent' };

      const result = await service.searchUsers(searchDto);

      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('should validate limit constraints', async () => {
      const searchDto: UserSearchDto = {
        limit: 150, // Above max of 100
      };

      await service.searchUsers(searchDto);

      expect(queryBuilder.take).toHaveBeenCalledWith(20); // Should use default
    });
  });

  describe('getSearchSuggestions', () => {
    it('should return empty array for short partial input', async () => {
      const result = await service.getSearchSuggestions('j');

      expect(result).toEqual([]);
      expect(queryBuilder.select).not.toHaveBeenCalled();
    });

    it('should return suggestions for valid partial input', async () => {
      const mockSuggestions = ['John', 'Jane'];
      queryBuilder.getMany.mockResolvedValue(mockUsers);

      const result = await service.getSearchSuggestions('jo', 10);

      expect(queryBuilder.select).toHaveBeenCalled();
      expect(queryBuilder.limit).toHaveBeenCalledWith(30); // limit * 3
      expect(result).toContain('John');
    });

    it('should limit suggestions correctly', async () => {
      queryBuilder.getMany.mockResolvedValue(mockUsers);

      const result = await service.getSearchSuggestions('j', 5);

      expect(queryBuilder.limit).toHaveBeenCalledWith(15); // 5 * 3
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should handle limit boundaries', async () => {
      queryBuilder.getMany.mockResolvedValue(mockUsers);

      // Test minimum limit
      const result1 = await service.getSearchSuggestions('j', 0);
      expect(queryBuilder.limit).toHaveBeenCalledWith(3); // 1 * 3

      // Test maximum limit
      const result2 = await service.getSearchSuggestions('j', 100);
      expect(queryBuilder.limit).toHaveBeenCalledWith(50); // Max limit
    });
  });

  describe('getSearchStats', () => {
    it('should return search statistics', async () => {
      repository.count.mockResolvedValue(100);

      const result = await service.getSearchStats();

      expect(repository.count).toHaveBeenCalled();
      expect(result.totalUsers).toBe(100);
      expect(result.searchableFields).toEqual(['email', 'firstName', 'lastName', 'fullName']);
      expect(result.averageSearchTime).toBeUndefined();
      expect(result.popularFilters).toBeUndefined();
    });
  });

  describe('Levenshtein distance calculation', () => {
    it('should calculate correct string similarity', () => {
      const service = new UserSearchService(repository);
      
      // Test exact match
      const similarity1 = (service as any).calculateSimilarity('john', 'john');
      expect(similarity1).toBe(1);

      // Test completely different
      const similarity2 = (service as any).calculateSimilarity('john', 'xyz');
      expect(similarity2).toBeLessThan(0.5);

      // Test partial match
      const similarity3 = (service as any).calculateSimilarity('john', 'jon');
      expect(similarity3).toBeGreaterThan(0.5);
      expect(similarity3).toBeLessThan(1);
    });

    it('should calculate Levenshtein distance correctly', () => {
      const service = new UserSearchService(repository);
      
      // Test identical strings
      const distance1 = (service as any).levenshteinDistance('john', 'john');
      expect(distance1).toBe(0);

      // Test completely different strings
      const distance2 = (service as any).levenshteinDistance('john', 'xyz');
      expect(distance2).toBeGreaterThan(0);

      // Test similar strings
      const distance3 = (service as any).levenshteinDistance('john', 'jon');
      expect(distance3).toBe(1); // Only one character difference
    });

    it('should handle empty strings in similarity calculation', () => {
      const service = new UserSearchService(repository);
      
      const similarity1 = (service as any).calculateSimilarity('', '');
      expect(similarity1).toBe(1);

      const similarity2 = (service as any).calculateSimilarity('john', '');
      expect(similarity2).toBe(0);

      const similarity3 = (service as any).calculateSimilarity('', 'john');
      expect(similarity3).toBe(0);
    });
  });

  describe('Relevance scoring', () => {
    it('should give higher scores to exact matches', async () => {
      const searchDto: UserSearchDto = {
        query: 'john.doe@example.com',
        fuzzy: true,
      };

      const result = await service.searchUsers(searchDto);

      // First result should have highest score for exact email match
      expect(result.results[0].email).toBe('john.doe@example.com');
      expect(result.results[0].score).toBeCloseTo(1, 1);
    });

    it('should give higher scores to name matches', async () => {
      const searchDto: UserSearchDto = {
        query: 'John',
        fuzzy: true,
      };

      const result = await service.searchUsers(searchDto);

      // Should find John Doe with high score
      const johnResult = result.results.find(r => r.firstName === 'John');
      expect(johnResult).toBeDefined();
      expect(johnResult!.score).toBeGreaterThan(0.5);
    });

    it('should handle partial name matches', async () => {
      const searchDto: UserSearchDto = {
        query: 'Jo',
        fuzzy: true,
      };

      const result = await service.searchUsers(searchDto);

      // Should find John with partial match score
      const johnResult = result.results.find(r => r.firstName === 'John');
      expect(johnResult).toBeDefined();
      expect(johnResult!.score).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    it('should handle repository errors gracefully', async () => {
      queryBuilder.getCount.mockRejectedValue(new Error('Database error'));

      const searchDto: UserSearchDto = { query: 'test' };

      await expect(service.searchUsers(searchDto)).rejects.toThrow('Database error');
    });

    it('should handle null query gracefully', async () => {
      const searchDto: UserSearchDto = { query: null as any };

      const result = await service.searchUsers(searchDto);

      expect(result.query).toBeNull();
      expect(result.fuzzyUsed).toBe(false);
    });

    it('should handle malformed sort field', async () => {
      const searchDto: UserSearchDto = {
        sortBy: 'invalidField',
      };

      await service.searchUsers(searchDto);

      // Should default to createdAt sort
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('user.createdAt', 'DESC');
    });
  });

  describe('Performance considerations', () => {
    it('should execute search efficiently', async () => {
      const searchDto: UserSearchDto = {
        query: 'john',
        page: 1,
        limit: 20,
      };

      const startTime = Date.now();
      await service.searchUsers(searchDto);
      const endTime = Date.now();

      // Search should complete quickly (less than 100ms for mocked data)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should track execution time', async () => {
      const searchDto: UserSearchDto = { query: 'john' };

      const result = await service.searchUsers(searchDto);

      expect(result.executionTimeMs).toBeGreaterThan(0);
      expect(result.executionTimeMs).toBeLessThan(1000); // Should be under 1 second
    });

    it('should limit suggestions query efficiently', async () => {
      await service.getSearchSuggestions('john', 10);

      expect(queryBuilder.limit).toHaveBeenCalledWith(30); // limit * 3 for filtering
    });
  });

  describe('Edge cases', () => {
    it('should handle special characters in search query', async () => {
      const searchDto: UserSearchDto = {
        query: 'john@#$%',
        fuzzy: true,
      };

      const result = await service.searchUsers(searchDto);

      expect(result.query).toBe('john@#$%');
      expect(result.results).toBeDefined();
    });

    it('should handle very long search queries', async () => {
      const longQuery = 'a'.repeat(1000);
      const searchDto: UserSearchDto = {
        query: longQuery,
        fuzzy: true,
      };

      const result = await service.searchUsers(searchDto);

      expect(result.query).toBe(longQuery);
    });

    it('should handle unicode characters in search', async () => {
      const searchDto: UserSearchDto = {
        query: 'José María',
        fuzzy: true,
      };

      const result = await service.searchUsers(searchDto);

      expect(result.query).toBe('José María');
    });

    it('should handle empty string query', async () => {
      const searchDto: UserSearchDto = {
        query: '',
        fuzzy: true,
      };

      const result = await service.searchUsers(searchDto);

      expect(result.query).toBe('');
      expect(result.fuzzyUsed).toBe(false); // Empty query shouldn't use fuzzy search
    });

    it('should handle whitespace-only query', async () => {
      const searchDto: UserSearchDto = {
        query: '   ',
        fuzzy: true,
      };

      const result = await service.searchUsers(searchDto);

      expect(result.fuzzyUsed).toBe(false);
    });
  });
});
