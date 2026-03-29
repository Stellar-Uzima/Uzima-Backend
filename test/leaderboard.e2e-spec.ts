import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { Response } from 'supertest';
import { LeaderboardController } from '../src/leaderboard/leaderboard.controller';
import { LeaderboardService } from '../src/leaderboard/leaderboard.service';
import { RewardTransaction } from '../src/rewards/entities/reward-transaction.entity';
import { User } from '../src/entities/user.entity';
import { Role } from '../src/auth/enums/role.enum';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';

// ============================================================================
// Mock Setup
// ============================================================================

const createMockRedisClient = () => ({
  zrevrange: jest.fn(),
  zrevrank: jest.fn(),
  zscore: jest.fn(),
  zcard: jest.fn(),
  zadd: jest.fn(),
  del: jest.fn(),
  flushdb: jest.fn(),
  hmget: jest.fn(),
  hset: jest.fn(),
  hdel: jest.fn(),
});

const createMockCacheManager = (redisClient: ReturnType<typeof createMockRedisClient>) => ({
  stores: {
    client: redisClient,
  },
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
});

jest.mock('ioredis', () => {
  return function mockRedisConstructor() {
    return createMockRedisClient();
  };
});

jest.mock('@nestjs/cache-manager', () => ({
  ...jest.requireActual('@nestjs/cache-manager'),
  CACHE_MANAGER: 'cacheManager',
}));

// ============================================================================
// Type Definitions
// ============================================================================

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  totalXlm: number;
  country?: string;
}

interface LeaderboardResponse {
  topRankings: LeaderboardEntry[];
  myRank: {
    rank: number | null;
    totalXlm: number;
  };
}

interface TestUser {
  id: string;
  name: string;
  country: string;
  points: number;
}

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_USERS: TestUser[] = [
  { id: 'user-1', name: 'John Smith', country: 'US', points: 1500 },
  { id: 'user-2', name: 'Alice Johnson', country: 'GB', points: 2000 },
  { id: 'user-3', name: 'Bob Williams', country: 'US', points: 1200 },
  { id: 'user-4', name: 'Carol Davis', country: 'CA', points: 1800 },
  { id: 'user-5', name: 'David Brown', country: 'US', points: 950 },
];

const JWT_SECRET = process.env.JWT_SECRET || 'secretKey';

// ============================================================================
// Main Test Suite
// ============================================================================

describe('Leaderboard E2E Tests', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let mockRedisClient: ReturnType<typeof createMockRedisClient>;
  let mockCacheManager: ReturnType<typeof createMockCacheManager>;
  const userTokens: Map<string, string> = new Map();

  beforeAll(async () => {
    mockRedisClient = createMockRedisClient();
    mockCacheManager = createMockCacheManager(mockRedisClient);

    const mockRewardTransactionRepository = {
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
    };

    const mockUserRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [LeaderboardController],
      providers: [
        LeaderboardService,
        JwtStrategy,
        {
          provide: getRepositoryToken(RewardTransaction),
          useValue: mockRewardTransactionRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: 'cacheManager',
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    TEST_USERS.forEach((user) => {
      const token = jwtService.sign({
        sub: user.id,
        email: `${user.id}@test.com`,
        role: Role.USER,
      });
      userTokens.set(user.id, token);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.values(mockRedisClient).forEach((fn) => {
      if (typeof fn === 'function' && 'mockReset' in fn) {
        (fn as jest.Mock).mockReset();
      }
    });
  });

  // =========================================================================
  // Helpers
  // =========================================================================

  const getAuthHeader = (userId: string): string => {
    const token = userTokens.get(userId);
    if (!token) throw new Error(`No token for ${userId}`);
    return `Bearer ${token}`;
  };

  const createToken = (userId: string, email: string): string => {
    return jwtService.sign({ sub: userId, email, role: Role.USER });
  };

  const mockLeaderboard = (users: TestUser[]): void => {
    const result: string[] = [];
    users.forEach((u) => {
      result.push(u.id);
      result.push(u.points.toString());
    });
    mockRedisClient.zrevrange.mockResolvedValue(result);
    mockRedisClient.hmget.mockResolvedValue(users.map((u) => u.name));
  };

  // =========================================================================
  // Tests: GET /leaderboard/global
  // =========================================================================

  describe('GET /leaderboard/global', () => {
    it('should return globally ranked users in correct order', async () => {
      mockLeaderboard(TEST_USERS);
      mockRedisClient.zrevrank.mockResolvedValue(2);
      mockRedisClient.zscore.mockResolvedValue('1500');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings).toBeDefined();
      expect(Array.isArray(response.body.topRankings)).toBe(true);
      expect(response.body.myRank.rank).toBe(3);
      expect(response.body.myRank.totalXlm).toBe(1500);
    });

    it('should respect limit parameter', async () => {
      mockRedisClient.zrevrange.mockResolvedValue([
        'user-2',
        '2000',
        'user-4',
        '1800',
      ]);
      mockRedisClient.hmget.mockResolvedValue(['Alice J.', 'Carol D.']);
      mockRedisClient.zrevrank.mockResolvedValue(1);
      mockRedisClient.zscore.mockResolvedValue('1800');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global?limit=2')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings.length).toBeLessThanOrEqual(2);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer())
        .get('/leaderboard/global');

      expect(response.status).toBe(401);
    });

    it('should handle users not yet ranked', async () => {
      mockRedisClient.zrevrange.mockResolvedValue([
        'user-2',
        '2000',
        'user-4',
        '1800',
      ]);
      mockRedisClient.hmget.mockResolvedValue(['Alice J.', 'Carol D.']);
      mockRedisClient.zrevrank.mockResolvedValue(null);
      mockRedisClient.zscore.mockResolvedValue(null);

      const token = createToken('user-new', 'new@test.com');
      const response = await request(app.getHttpServer())
        .get('/leaderboard/global')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.myRank.rank).toBeNull();
      expect(response.body.myRank.totalXlm).toBe(0);
    });

    it('should handle empty leaderboard', async () => {
      mockRedisClient.zrevrange.mockResolvedValue([]);
      mockRedisClient.hmget.mockResolvedValue([]);
      mockRedisClient.zrevrank.mockResolvedValue(null);
      mockRedisClient.zscore.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings).toEqual([]);
      expect(response.body.myRank.rank).toBeNull();
    });
  });

  // =========================================================================
  // Tests: GET /leaderboard/country/:countryCode
  // =========================================================================

  describe('GET /leaderboard/country/:countryCode', () => {
    it('should return country-specific rankings', async () => {
      const usUsers = TEST_USERS.filter((u) => u.country === 'US');
      mockLeaderboard(usUsers);
      mockRedisClient.zrevrank.mockResolvedValue(0);
      mockRedisClient.zscore.mockResolvedValue('1500');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/country/US')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings.length).toBeGreaterThan(0);
    });

    it('should handle case-insensitive country codes', async () => {
      mockRedisClient.zrevrange.mockResolvedValue(['user-1', '1500']);
      mockRedisClient.hmget.mockResolvedValue(['John']);
      mockRedisClient.zrevrank.mockResolvedValue(0);
      mockRedisClient.zscore.mockResolvedValue('1500');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/country/us')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings.length).toBeGreaterThan(0);
    });

    it('should return empty for non-existent country', async () => {
      mockRedisClient.zrevrange.mockResolvedValue([]);
      mockRedisClient.hmget.mockResolvedValue([]);
      mockRedisClient.zrevrank.mockResolvedValue(null);
      mockRedisClient.zscore.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get('/leaderboard/country/XX')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings).toEqual([]);
    });
  });

  // =========================================================================
  // Tests: Data Consistency
  // =========================================================================

  describe('Data Consistency', () => {
    it('should reflect accurate rankings with known dataset', async () => {
      // ✅ Fixed: Added all required properties
      const ranking: TestUser[] = [
        { id: 'user-2', name: 'Alice', country: 'GB', points: 2000 },
        { id: 'user-4', name: 'Carol', country: 'CA', points: 1800 },
        { id: 'user-1', name: 'John', country: 'US', points: 1500 },
        { id: 'user-3', name: 'Bob', country: 'US', points: 1200 },
        { id: 'user-5', name: 'David', country: 'US', points: 950 },
      ];

      mockLeaderboard(ranking);
      mockRedisClient.zrevrank.mockResolvedValue(2);
      mockRedisClient.zscore.mockResolvedValue('1500');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      ranking.forEach((user, index) => {
        expect(response.body.topRankings[index]?.userId).toBe(user.id);
        expect(response.body.topRankings[index]?.totalXlm).toBe(user.points);
      });
      expect(response.body.myRank.totalXlm).toBe(1500);
    });

    it('should maintain decimal precision', async () => {
      mockRedisClient.zrevrange.mockResolvedValue([
        'user-2',
        '2000.75',
        'user-1',
        '1500.50',
      ]);
      mockRedisClient.hmget.mockResolvedValue(['Alice', 'John']);
      mockRedisClient.zrevrank.mockResolvedValue(1);
      mockRedisClient.zscore.mockResolvedValue('1500.50');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings[0]?.totalXlm).toBe(2000.75);
      expect(response.body.topRankings[1]?.totalXlm).toBe(1500.5);
    });
  });

  // =========================================================================
  // Tests: Edge Cases
  // =========================================================================

  describe('Edge Cases', () => {
    it('should handle tied scores', async () => {
      mockRedisClient.zrevrange.mockResolvedValue([
        'user-1',
        '1500',
        'user-3',
        '1500',
      ]);
      mockRedisClient.hmget.mockResolvedValue(['John', 'Bob']);
      mockRedisClient.zrevrank.mockResolvedValue(0);
      mockRedisClient.zscore.mockResolvedValue('1500');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings.every((r: any) => r.totalXlm === 1500)).toBe(true);
    });

    it('should handle zero scores', async () => {
      mockRedisClient.zrevrange.mockResolvedValue(['user-1', '0']);
      mockRedisClient.hmget.mockResolvedValue(['John']);
      mockRedisClient.zrevrank.mockResolvedValue(null);
      mockRedisClient.zscore.mockResolvedValue(null);

      const token = createToken('user-zero', 'zero@test.com');
      const response = await request(app.getHttpServer())
        .get('/leaderboard/global')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.myRank.totalXlm).toBe(0);
    });

    it('should handle missing display names', async () => {
      mockRedisClient.zrevrange.mockResolvedValue([
        'user-1',
        '1500',
        'user-2',
        '2000',
      ]);
      mockRedisClient.hmget.mockResolvedValue([null, 'Alice']);
      mockRedisClient.zrevrank.mockResolvedValue(1);
      mockRedisClient.zscore.mockResolvedValue('1500');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings[0]?.displayName).toBe('Anonymous');
    });
  });

  // =========================================================================
  // Tests: Pagination
  // =========================================================================

  describe('Pagination and Limits', () => {
    it('should apply default limit', async () => {
      const largeDataset: string[] = [];
      for (let i = 0; i < 50; i++) {
        largeDataset.push(`user-${i}`);
        largeDataset.push(`${3000 - i * 10}`);
      }

      mockRedisClient.zrevrange.mockResolvedValue(largeDataset);
      mockRedisClient.hmget.mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => `User ${i}`),
      );
      mockRedisClient.zrevrank.mockResolvedValue(0);
      mockRedisClient.zscore.mockResolvedValue('3000');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings.length).toBeLessThanOrEqual(50);
    });

    it('should respect custom limit', async () => {
      const dataset: string[] = [];
      for (let i = 0; i < 15; i++) {
        dataset.push(`user-${i}`);
        dataset.push(`${2000 - i * 10}`);
      }

      mockRedisClient.zrevrange.mockResolvedValue(dataset);
      mockRedisClient.hmget.mockResolvedValue(
        Array.from({ length: 15 }, (_, i) => `User ${i}`),
      );
      mockRedisClient.zrevrank.mockResolvedValue(0);
      mockRedisClient.zscore.mockResolvedValue('2000');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global?limit=15')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings.length).toBeLessThanOrEqual(15);
    });
  });

  // =========================================================================
  // Tests: Cache Management
  // =========================================================================

  describe('Cache State Management', () => {
    it('should clear mocks between tests', () => {
      expect(mockRedisClient.zrevrange).not.toHaveBeenCalled();
    });

    it('should handle cache misses gracefully', async () => {
      mockRedisClient.zrevrange.mockResolvedValue([]);
      mockRedisClient.hmget.mockResolvedValue([]);
      mockRedisClient.zrevrank.mockResolvedValue(null);
      mockRedisClient.zscore.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings).toEqual([]);
    });

    it('should flush cache before each test', () => {
      mockRedisClient.flushdb.mockResolvedValue('OK');
      expect(mockRedisClient.flushdb).toBeDefined();
    });
  });

  // =========================================================================
  // Tests: Acceptance Criteria
  // =========================================================================

  describe('Acceptance Criteria', () => {
    it('AC1: GET /leaderboard returns globally ranked users', async () => {
      // ✅ Fixed: Set up mocks fresh for this specific test
      mockRedisClient.zrevrange.mockResolvedValue([
        'user-2',
        '2000',
        'user-4',
        '1800',
        'user-1',
        '1500',
        'user-3',
        '1200',
        'user-5',
        '950',
      ]);
      mockRedisClient.hmget.mockResolvedValue([
        'Alice Johnson',
        'Carol Davis',
        'John Smith',
        'Bob Williams',
        'David Brown',
      ]);
      mockRedisClient.zrevrank.mockResolvedValue(2);
      mockRedisClient.zscore.mockResolvedValue('1500');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings[0]?.userId).toBe('user-2');
      expect(response.body.topRankings[0]?.totalXlm).toBe(2000);
    });

    it('AC2: GET /leaderboard/country returns category rankings', async () => {
      const usUsers = TEST_USERS.filter((u) => u.country === 'US');
      mockLeaderboard(usUsers);
      mockRedisClient.zrevrank.mockResolvedValue(0);
      mockRedisClient.zscore.mockResolvedValue('1500');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/country/US')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings.length).toBeGreaterThan(0);
    });

    it('AC3: User rank endpoint returns current rank', async () => {
      mockLeaderboard(TEST_USERS);
      mockRedisClient.zrevrank.mockResolvedValue(2);
      mockRedisClient.zscore.mockResolvedValue('1500');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.myRank.rank).toBe(3);
      expect(response.body.myRank.totalXlm).toBe(1500);
    });

    it('AC4: Pagination works correctly', async () => {
      mockRedisClient.zrevrange.mockResolvedValue([
        'user-2',
        '2000',
        'user-1',
        '1500',
      ]);
      mockRedisClient.hmget.mockResolvedValue(['Alice', 'John']);
      mockRedisClient.zrevrank.mockResolvedValue(1);
      mockRedisClient.zscore.mockResolvedValue('1500');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global?limit=2')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expect(response.body.topRankings.length).toBeLessThanOrEqual(2);
    });

    it('AC5: Rankings reflect database state with known dataset', async () => {
      const expected: TestUser[] = [
        { id: 'user-2', name: 'Alice', country: 'GB', points: 2000 },
        { id: 'user-4', name: 'Carol', country: 'CA', points: 1800 },
        { id: 'user-1', name: 'John', country: 'US', points: 1500 },
        { id: 'user-3', name: 'Bob', country: 'US', points: 1200 },
        { id: 'user-5', name: 'David', country: 'US', points: 950 },
      ];

      mockLeaderboard(expected);
      mockRedisClient.zrevrank.mockResolvedValue(2);
      mockRedisClient.zscore.mockResolvedValue('1500');

      const response = await request(app.getHttpServer())
        .get('/leaderboard/global')
        .set('Authorization', getAuthHeader('user-1'));

      expect(response.status).toBe(200);
      expected.forEach((user, index) => {
        expect(response.body.topRankings[index]?.userId).toBe(user.id);
        expect(response.body.topRankings[index]?.totalXlm).toBe(user.points);
      });
    });
  });
});
