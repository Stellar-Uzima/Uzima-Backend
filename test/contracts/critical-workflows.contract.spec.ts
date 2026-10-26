import { INestApplication, UnauthorizedException, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CustomValidationPipe } from '../../src/common/pipes/validation.pipe';
import { StandardizedExceptionFilter } from '../../src/common/filters/standardized-exception.filter';
import { TransformInterceptor } from '../../src/common/interceptors/transform.interceptor';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';

// Only service modules are doubled. Controllers, decorators, DTOs, validation,
// exception formatting and response serialization are production implementations.
const services: Record<string, Record<string, jest.Mock>> = {};
function stub(path: string, name: string, methods: string[] = []) {
  const token = class {};
  const value = Object.fromEntries(methods.map((method) => [method, jest.fn()]));
  services[name] = value;
  jest.doMock(path, () => ({ [name]: token }));
  return { provide: token, useValue: value };
}
// Infrastructure collaborators are replaced when exercising real service methods.
// This prevents Redis connections and unrelated module graphs from booting.
for (const [path, name] of [
  ['../../src/stellar/stellar.service', 'StellarService'],
  ['../../src/stellar/xlm-price.service', 'XlmPriceService'],
  ['../../src/modules/health-tasks/services/activity-log.service', 'ActivityLogService'],
  ['../../src/modules/auth/services/users.service', 'UsersService'],
  ['../../src/otp/otp.service', 'OtpService'],
  ['../../src/modules/auth/services/email-verification.service', 'EmailVerificationService'],
  ['../../src/modules/auth/services/session.service', 'SessionService'],
  ['../../src/database/services/transaction.service', 'TransactionService'],
  ['../../src/referral/referral.service', 'ReferralService'],
  ['../../src/notifications/services/notification.service', 'NotificationService'],
  ['../../src/modules/auth/services/password-policy.service', 'PasswordPolicyService'],
  ['../../src/modules/auth/services/account-lockout.service', 'AccountLockoutService'],
]) {
  jest.doMock(path, () => ({ [name]: class {} }));
}
jest.mock('../../src/audit/audit.service', () => ({
  AuditService: class {},
  AuditAction: { LOGIN: 'LOGIN' },
  AuditResource: { USER: 'USER' },
}));

const providers = [
  stub('../../src/modules/auth/services/auth.service', 'AuthService', ['register', 'login']),
  stub('../../src/modules/wallet/wallet.service', 'WalletService', [
    'getWalletSummary',
    'linkWallet',
  ]),
  stub('../../src/modules/wallet/savings.service', 'SavingsService', [
    'createGoal',
    'contribute',
    'getGoals',
    'getGoalById',
    'deleteGoal',
  ]),
  stub('../../src/modules/wallet/wallet-transaction.service', 'WalletTransactionService', [
    'topUp',
  ]),
  stub('../../src/rewards/reward.service', 'RewardService', [
    'getRewardHistory',
    'getRewardSummary',
  ]),
  stub('../../src/modules/health-tasks/health-tasks.service', 'HealthTasksService', [
    'create',
    'findOne',
    'getUserTasks',
  ]),
  ...['Archive', 'Completion', 'Analytics', 'TaskSearch', 'Attachments', 'Duplication'].map(
    (name) =>
      stub(
        `../../src/modules/health-tasks/services/${({ TaskSearch: 'task-search' } as Record<string, string>)[name] || name.toLowerCase()}.service`,
        `${name}Service`
      )
  ),
  stub('../../src/shared/analytics/task-analytics.service', 'TaskAnalyticsService'),
];
// Rate limiting is outside the contract boundary and would make this suite time dependent.
jest.mock('../../src/common/guards/rate-limit.guard', () => ({
  RateLimitGuard: class {
    canActivate() {
      return true;
    }
  },
}));
// DTO enums live beside ORM entities; avoid bootstrapping their relation graph.
jest.mock('../../src/entities/user.entity', () => ({ User: class {} }));
jest.mock('../../src/shared/cache/cache.service', () => ({
  CACHE_TTL: { SHORT: 60, DEFAULT: 3600 },
}));

const { AuthController } = require('../../src/modules/auth/auth.controller');
const { WalletController } = require('../../src/modules/wallet/wallet.controller');
const { SavingsWalletController } = require('../../src/modules/wallet/savings-wallet.controller');
const { RewardController } = require('../../src/rewards/reward.controller');
const { HealthTasksController } = require('../../src/modules/health-tasks/health-tasks.controller');

const date = '2026-01-01T00:00:00.000Z';
const userId = '123e4567-e89b-42d3-a456-426614174000';
const address = `G${'A'.repeat(55)}`;
const credentials = { email: 'jane@example.com', password: 'StrongP@ssw0rd!' };
const registration = { ...credentials, firstName: 'Jane', lastName: 'Doe', country: 'NG' };
const authResult = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  accessTokenId: 'token-id',
  user: { id: userId, email: credentials.email },
};
const goal = {
  id: userId,
  title: 'Care',
  targetAmount: 100,
  currentAmount: 0,
  progressPercentage: 0,
  status: 'ACTIVE',
  createdAt: new Date(date),
  updatedAt: new Date(date),
};

function success(body: any, data: unknown) {
  expect(body).toEqual({ success: true, data, timestamp: expect.any(String) });
  expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
}
function failure(body: any, status: number, code: string, path: string, method = 'POST') {
  expect(body).toEqual({
    error: expect.objectContaining({
      code,
      statusCode: status,
      message: expect.any(String),
      path,
      method,
      timestamp: expect.any(String),
    }),
  });
}

describe('Critical API contracts', () => {
  let app: INestApplication;
  let server: any;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        AuthController,
        WalletController,
        SavingsWalletController,
        RewardController,
        HealthTasksController,
      ],
      providers,
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: any) {
          const req = context.switchToHttp().getRequest();
          if (req.headers.authorization !== 'Bearer contract-token')
            throw new UnauthorizedException();
          req.user = { sub: userId, id: userId, userId };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication({ logger: false });
    app.enableVersioning({ type: VersioningType.URI, prefix: 'api/v', defaultVersion: '1' });
    app.useGlobalPipes(new CustomValidationPipe());
    app.useGlobalFilters(new StandardizedExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    server = app.getHttpServer();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.resetAllMocks();
  });
  const authorized = (req: request.Test) => req.set('Authorization', 'Bearer contract-token');

  it.each([
    ['register', 201, registration],
    ['login', 200, credentials],
  ] as const)(
    'auth %s returns tokens and user in the success envelope',
    async (route, status, payload) => {
      services.AuthService[route].mockResolvedValue(authResult);
      const res = await request(server).post(`/api/v1/auth/${route}`).send(payload).expect(status);
      success(res.body, authResult);
      expect(services.AuthService[route]).toHaveBeenCalledWith(
        ...(route === 'register'
          ? [expect.objectContaining(payload)]
          : [expect.objectContaining(payload), expect.any(String)])
      );
    }
  );

  it('login preserves the invalid credentials error contract', async () => {
    services.AuthService.login.mockRejectedValue(new UnauthorizedException('Invalid credentials'));
    const path = '/api/v1/auth/login';
    const res = await request(server).post(path).send(credentials).expect(401);
    failure(res.body, 401, 'UNAUTHENTICATED', path);
  });

  it('creates a health task on the registered tasks route', async () => {
    const payload = { title: 'Walk', category: 'exercise', priority: 'high' };
    services.HealthTasksService.create.mockResolvedValue({
      id: userId,
      ...payload,
      createdAt: new Date(date),
    });
    const res = await request(server).post('/api/v1/tasks').send(payload).expect(201);
    success(res.body, { id: userId, ...payload, createdAt: date });
    expect(services.HealthTasksService.create).toHaveBeenCalledWith(
      expect.objectContaining(payload)
    );
  });

  it('creates savings goals with numeric amounts and dates', async () => {
    services.SavingsService.createGoal.mockResolvedValue(goal);
    const payload = { title: 'Care', targetAmount: 100 };
    const res = await authorized(request(server).post('/api/v1/users/me/savings/goals'))
      .send(payload)
      .expect(201);
    success(res.body, { ...goal, createdAt: date, updatedAt: date });
    expect(services.SavingsService.createGoal).toHaveBeenCalledWith(
      userId,
      expect.objectContaining(payload)
    );
  });

  it('contributes to a savings goal', async () => {
    const contribution = {
      id: userId,
      goalId: userId,
      amount: 0.01,
      status: 'CONFIRMED',
      createdAt: date,
      updatedAt: date,
    };
    services.SavingsService.contribute.mockResolvedValue(contribution);
    const res = await authorized(
      request(server).post(`/api/v1/users/me/savings/goals/${userId}/contribute`)
    )
      .send({ amount: 0.01 })
      .expect(200);
    success(res.body, contribution);
    expect(services.SavingsService.contribute).toHaveBeenCalledWith(
      userId,
      userId,
      expect.objectContaining({ amount: 0.01 })
    );
  });

  it('deleting a savings goal returns an empty 204 response', async () => {
    const res = await authorized(
      request(server).delete(`/api/v1/users/me/savings/goals/${userId}`)
    ).expect(204);
    expect(res.text).toBe('');
    expect(services.SavingsService.deleteGoal).toHaveBeenCalledWith(userId, userId);
  });

  it('links a wallet with the documented message', async () => {
    const res = await authorized(request(server).post('/api/v1/users/me/wallet'))
      .send({ address })
      .expect(200);
    success(res.body, { message: 'Wallet linked successfully' });
    expect(services.WalletService.linkWallet).toHaveBeenCalledWith(userId, address);
  });

  it.each([true, false])(
    'wallet linked=%s preserves address/balance nullability',
    async (walletLinked) => {
      services.WalletService.getWalletSummary.mockResolvedValue({
        walletLinked,
        walletAddress: address,
        liveBalance: '12.5000000',
      });
      const res = await authorized(request(server).get('/api/v1/users/me/wallet')).expect(200);
      success(res.body, {
        walletAddress: walletLinked ? address : null,
        xlmBalance: walletLinked ? '12.5000000' : null,
      });
      expect(services.WalletService.getWalletSummary).toHaveBeenCalledWith(userId);
    }
  );

  it.each([date, null])(
    'reward summary preserves totals and lastRewardDate=%s',
    async (lastRewardDate) => {
      const result = { totalEarned: 12.5, totalPending: 0, lastRewardDate };
      services.RewardService.getRewardSummary.mockResolvedValue(result);
      const res = await authorized(request(server).get('/api/v1/rewards/summary')).expect(200);
      success(res.body, result);
      expect(services.RewardService.getRewardSummary).toHaveBeenCalledWith(userId);
    }
  );

  it.each([
    { data: [] },
    {
      data: [
        {
          id: userId,
          amount: 1.5,
          status: 'SUCCESS',
          stellarTxHash: 'tx-hash',
          taskTitle: 'Walk',
          createdAt: date,
        },
      ],
    },
  ])('reward payouts preserve pagination for %j', async ({ data }) => {
    const result = { data, total: data.length, page: 1, limit: 20, totalPages: data.length };
    services.RewardService.getRewardHistory.mockResolvedValue(result);
    const res = await authorized(
      request(server).get('/api/v1/rewards/payouts?page=1&limit=20')
    ).expect(200);
    success(res.body, result);
    expect(services.RewardService.getRewardHistory).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ page: 1, limit: 20 })
    );
  });

  it.each([
    ['/api/v1/auth/register', {}, 'email', 'AuthService', 'register'],
    [
      '/api/v1/auth/register',
      { ...registration, password: 'weak' },
      'password',
      'AuthService',
      'register',
    ],
    ['/api/v1/auth/login', { ...credentials, email: 'invalid' }, 'email', 'AuthService', 'login'],
    ['/api/v1/tasks', { category: 'exercise' }, 'title', 'HealthTasksService', 'create'],
    [
      '/api/v1/tasks',
      { title: 'Walk', category: 'invalid' },
      'category',
      'HealthTasksService',
      'create',
    ],
    [
      '/api/v1/users/me/savings/goals',
      { title: 'Care', targetAmount: 0 },
      'targetAmount',
      'SavingsService',
      'createGoal',
    ],
    [
      '/api/v1/users/me/savings/goals',
      { title: 'Care', targetAmount: '100' },
      'targetAmount',
      'SavingsService',
      'createGoal',
    ],
    [
      `/api/v1/users/me/savings/goals/${userId}/contribute`,
      { amount: -1 },
      'amount',
      'SavingsService',
      'contribute',
    ],
    [
      `/api/v1/users/me/savings/goals/${userId}/contribute`,
      { amount: 0.010000001 },
      'amount',
      'SavingsService',
      'contribute',
    ],
    ['/api/v1/users/me/wallet', { address: 'invalid' }, 'address', 'WalletService', 'linkWallet'],
    [
      '/api/v1/users/me/wallet',
      { address, unexpected: true },
      'unexpected',
      'WalletService',
      'linkWallet',
    ],
  ])(
    'rejects invalid body %s %j before invoking services',
    async (path, payload, field, service, method) => {
      const res = await authorized(request(server).post(path as string))
        .send(payload)
        .expect(400);
      failure(res.body, 400, 'VALIDATION_FAILED', path as string);
      expect(res.body.error.details).toEqual({
        fields: expect.objectContaining({ [field as string]: expect.any(Array) }),
        errorCount: expect.any(Number),
      });
      expect(services[service as string][method as string]).not.toHaveBeenCalled();
    }
  );

  // Use production method implementations with repository/network collaborators
  // replaced. Mocking only the final service result would miss renamed fields.
  function bindReal(
    path: string,
    name: string,
    method: string,
    dependencies: Record<string, unknown>
  ) {
    const implementation = jest.requireActual(path)[name];
    const instance = Object.assign(Object.create(implementation.prototype), dependencies);
    services[name][method].mockImplementation(instance[method].bind(instance));
    return instance;
  }

  it('runs real auth registration response mapping', async () => {
    bindReal('../../src/modules/auth/services/auth.service', 'AuthService', 'register', {
      passwordPolicy: { assert: jest.fn() },
      usersService: {
        findByEmail: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: userId, email: credentials.email, role: 'USER' }),
        getProfile: jest.fn().mockResolvedValue(authResult.user),
      },
      eventEmitter: { emit: jest.fn() },
      emailVerificationService: { createForUser: jest.fn() },
      notifications: { sendEmail: jest.fn() },
      generateTokens: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenId: 'token-id',
      }),
    });
    const res = await request(server).post('/api/v1/auth/register').send(registration).expect(201);
    success(res.body, authResult);
  });

  it('runs real auth login response mapping', async () => {
    const bcrypt = jest.requireActual('bcryptjs');
    const user = {
      id: userId,
      email: credentials.email,
      role: 'USER',
      isVerified: true,
      password: await bcrypt.hash(credentials.password, 4),
      twoFactorEnabled: false,
    };
    const audit = jest.fn();
    bindReal('../../src/modules/auth/services/auth.service', 'AuthService', 'login', {
      usersService: {
        findByEmail: jest.fn().mockResolvedValue(user),
        canUserLogin: jest.fn().mockResolvedValue({ canLogin: true }),
        updateLastLogin: jest.fn(),
        getProfile: jest.fn().mockResolvedValue(authResult.user),
      },
      lockout: { assertNotLocked: jest.fn(), clearIpFailures: jest.fn() },
      auditService: { logEvent: audit },
      generateTokens: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        accessTokenId: 'token-id',
      }),
    });
    const res = await request(server).post('/api/v1/auth/login').send(credentials).expect(200);
    success(res.body, authResult);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ userId, ipAddress: expect.any(String) })
    );
  });

  it('runs real savings goal response mapping and decimal conversion', async () => {
    const row = { ...goal, targetAmount: '100.0000000', currentAmount: '25.0000000' };
    bindReal('../../src/modules/wallet/savings.service', 'SavingsService', 'getGoalById', {
      goalRepo: { findOne: jest.fn().mockResolvedValue(row) },
    });
    const res = await authorized(
      request(server).get(`/api/v1/users/me/savings/goals/${userId}`)
    ).expect(200);
    success(res.body, {
      ...goal,
      currentAmount: 25,
      progressPercentage: 25,
      createdAt: date,
      updatedAt: date,
    });
  });

  it('runs real savings list pagination and response mapping', async () => {
    const query: any = {};
    for (const method of ['where', 'orderBy', 'skip', 'take'])
      query[method] = jest.fn().mockReturnValue(query);
    query.getManyAndCount = jest
      .fn()
      .mockResolvedValue([[{ ...goal, targetAmount: '100', currentAmount: '0' }], 1]);
    bindReal('../../src/modules/wallet/savings.service', 'SavingsService', 'getGoals', {
      goalRepo: { createQueryBuilder: () => query },
    });
    const res = await authorized(request(server).get('/api/v1/users/me/savings/goals')).expect(200);
    success(res.body, {
      data: [{ ...goal, createdAt: date, updatedAt: date }],
      metadata: { totalCount: 1, page: 1, limit: 20, totalPages: 1 },
    });
  });

  it('runs real wallet summary mapping with string balances', async () => {
    const query: any = {};
    for (const method of ['select', 'where', 'andWhere'])
      query[method] = jest.fn().mockReturnValue(query);
    query.getRawOne = jest
      .fn()
      .mockResolvedValueOnce({ total: '18.00' })
      .mockResolvedValueOnce({ total: '2.50' });
    bindReal('../../src/modules/wallet/wallet.service', 'WalletService', 'getWalletSummary', {
      cacheManager: { get: jest.fn(), set: jest.fn() },
      userRepo: { findOne: jest.fn().mockResolvedValue({ stellarWalletAddress: address }) },
      stellarService: { getAccountBalance: jest.fn().mockResolvedValue('12.5000000') },
      rewardTransactionRepo: { createQueryBuilder: () => query },
      xlmPriceService: { getXlmUsdRate: jest.fn().mockResolvedValue(0.1) },
    });
    const res = await authorized(request(server).get('/api/v1/users/me/wallet/summary')).expect(
      200
    );
    success(res.body, {
      walletAddress: address,
      liveBalance: '12.5000000',
      totalEarnedFromTasks: '18.00',
      totalSpentOnConsultations: '0.00',
      pendingRewards: '2.50',
      xlmUsdRate: 0.1,
      balanceUsd: '1.25',
      walletLinked: true,
    });
  });

  it('runs real health task list mapping and pagination', async () => {
    const query: any = {};
    for (const method of ['where', 'skip', 'take', 'orderBy'])
      query[method] = jest.fn().mockReturnValue(query);
    query.getManyAndCount = jest
      .fn()
      .mockResolvedValue([[{ id: userId, title: 'Walk', createdAt: new Date(date) }], 1]);
    bindReal(
      '../../src/modules/health-tasks/health-tasks.service',
      'HealthTasksService',
      'getUserTasks',
      {
        taskRepository: { createQueryBuilder: () => query },
      }
    );
    const res = await request(server).get('/api/v1/tasks').expect(200);
    success(res.body, {
      items: [{ id: userId, title: 'Walk', createdAt: date }],
      total: 1,
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('serializes real reward service mapping and hides pending transaction hashes', async () => {
    const { RewardService } = jest.requireActual('../../src/rewards/reward.service');
    const query: any = {};
    for (const method of ['leftJoinAndSelect', 'where', 'orderBy', 'skip', 'take'])
      query[method] = jest.fn().mockReturnValue(query);
    query.getManyAndCount = jest.fn().mockResolvedValue([
      [
        {
          id: userId,
          amount: 1.5,
          status: 'SUCCESS',
          stellarTxHash: 'settled-hash',
          createdAt: new Date(date),
          task_completion: { health_task: { title: 'Walk' } },
        },
        {
          id: 'pending-id',
          amount: 2,
          status: 'PENDING',
          stellarTxHash: 'private-hash',
          createdAt: new Date(date),
        },
      ],
      2,
    ]);
    const service = new RewardService(
      { createQueryBuilder: () => query },
      { get: jest.fn(), set: jest.fn() }
    );
    services.RewardService.getRewardHistory.mockImplementation(
      service.getRewardHistory.bind(service)
    );
    const res = await authorized(request(server).get('/api/v1/rewards/payouts')).expect(200);
    success(res.body, {
      data: [
        {
          id: userId,
          amount: 1.5,
          status: 'SUCCESS',
          stellarTxHash: 'settled-hash',
          createdAt: date,
          taskTitle: 'Walk',
        },
        {
          id: 'pending-id',
          amount: 2,
          status: 'PENDING',
          createdAt: date,
          taskTitle: 'Unknown Task',
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it.each(['page=0', 'limit=0', 'status=invalid', 'startDate=invalid', 'unexpected=true'])(
    'rejects invalid payout query %s',
    async (query) => {
      const path = `/api/v1/rewards/payouts?${query}`;
      const res = await authorized(request(server).get(path)).expect(400);
      failure(res.body, 400, 'VALIDATION_FAILED', path, 'GET');
      expect(services.RewardService.getRewardHistory).not.toHaveBeenCalled();
    }
  );

  it.each(['/api/v1/users/me/wallet', '/api/v1/users/me/savings/goals', '/api/v1/rewards/summary'])(
    'protected route %s rejects missing authentication',
    async (path) => {
      const res = await request(server).get(path).expect(401);
      failure(res.body, 401, 'UNAUTHENTICATED', path, 'GET');
    }
  );
});
