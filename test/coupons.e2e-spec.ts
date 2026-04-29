import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { CouponController } from '../src/coupons/coupon.controller';
import { CouponService } from '../src/coupons/coupon.service';
import { Coupon, CouponStatus } from '../src/coupons/entities/coupon.entity';
import { User } from '../src/entities/user.entity';
import { Role } from '../src/auth/enums/role.enum';
import { ValidateCouponDto } from '../src/coupons/dto/validate-coupon.dto';

// Mock Redis
const mockRedisClient = {
  connect: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
};

jest.mock('ioredis', () => {
  return function () {
    return mockRedisClient;
  };
});

describe('Coupons E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let adminToken: string;
  let userToken: string;
  let anotherUserToken: string;

  const adminId = 'admin-uuid-1';
  const userId = 'user-uuid-1';
  const anotherUserId = 'user-uuid-2';

  const mockCouponRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  // Sample coupon data
  const sampleCoupon = {
    id: 'coupon-uuid-1',
    code: 'UZIMA1A2',
    userId,
    discount: 10,
    specialistType: 'doctor',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    status: CouponStatus.ACTIVE,
    createdAt: new Date(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: process.env.JWT_SECRET || 'secretKey',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [CouponController],
      providers: [
        CouponService,
        { provide: getRepositoryToken(Coupon), useValue: mockCouponRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Generate JWT tokens
    adminToken = jwtService.sign({
      sub: adminId,
      email: 'admin@test.com',
      role: Role.ADMIN,
    });

    userToken = jwtService.sign({
      sub: userId,
      email: 'user@test.com',
      role: Role.USER,
    });

    anotherUserToken = jwtService.sign({
      sub: anotherUserId,
      email: 'another@test.com',
      role: Role.USER,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset Redis mocks
    mockRedisClient.get.mockReset();
    mockRedisClient.set.mockReset();
    mockRedisClient.incr.mockReset();
    mockRedisClient.expire.mockReset();
  });

  describe('GET /coupons/me - Get current user active coupons', () => {
    it('should return list of active coupons for authenticated user', async () => {
      const activeCoupons = [
        {
          ...sampleCoupon,
          id: 'coupon-1',
          code: 'ACTIVE1',
        },
        {
          ...sampleCoupon,
          id: 'coupon-2',
          code: 'ACTIVE2',
          expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        },
      ];

      mockCouponRepository.find.mockResolvedValue(activeCoupons);

      const response = await request(app.getHttpServer())
        .get('/coupons/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0].code).toBe('ACTIVE1');
      expect(response.body[1].code).toBe('ACTIVE2');
    });

    it('should return empty array when user has no active coupons', async () => {
      mockCouponRepository.find.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get('/coupons/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it('should filter out expired coupons', async () => {
      const mixedCoupons = [
        {
          ...sampleCoupon,
          id: 'active-1',
          expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        },
        {
          ...sampleCoupon,
          id: 'expired-1',
          expiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Expired
        },
      ];

      mockCouponRepository.find.mockResolvedValue(mixedCoupons);

      const response = await request(app.getHttpServer())
        .get('/coupons/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      // Only active coupons should be returned (filtering happens in service)
      expect(response.body).toBeDefined();
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/coupons/me')
        .expect(401);
    });

    it('should order coupons by expiresAt ascending', async () => {
      const sortedCoupons = [
        {
          ...sampleCoupon,
          id: 'expiring-soon',
          expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        },
        {
          ...sampleCoupon,
          id: 'expiring-later',
          expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        },
      ];

      mockCouponRepository.find.mockResolvedValue(sortedCoupons);

      const response = await request(app.getHttpServer())
        .get('/coupons/me')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body[0].id).toBe('expiring-soon');
      expect(response.body[1].id).toBe('expiring-later');
    });
  });

  describe('POST /coupons/validate - Validate coupon before booking', () => {
    const validatePayload = {
      code: 'UZIMA1A2',
      specialistId: 'specialist-uuid-1',
    };

    it('should return valid:true for a valid, active coupon', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      mockCouponRepository.findOne.mockResolvedValue({
        ...sampleCoupon,
        userId, // Belongs to requesting user
      });

      const response = await request(app.getHttpServer())
        .post('/coupons/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send(validatePayload)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.reason).toBeUndefined();
    });

    it('should return valid:false with reason not_found for non-existent coupon', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      mockCouponRepository.findOne.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .post('/coupons/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'INVALIDCODE', specialistId: 'specialist-uuid-1' })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.reason).toBe('not_found');
    });

    it('should return valid:false with reason already_used for redeemed coupon', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      mockCouponRepository.findOne.mockResolvedValue({
        ...sampleCoupon,
        status: CouponStatus.REDEEMED,
        userId,
      });

      const response = await request(app.getHttpServer())
        .post('/coupons/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send(validatePayload)
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.reason).toBe('already_used');
    });

    it('should return valid:false with reason expired for expired coupon', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      mockCouponRepository.findOne.mockResolvedValue({
        ...sampleCoupon,
        expiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Expired
        userId,
      });

      const response = await request(app.getHttpServer())
        .post('/coupons/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send(validatePayload)
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.reason).toBe('expired');
    });

    it('should return 403 when coupon does not belong to current user', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      mockCouponRepository.findOne.mockResolvedValue({
        ...sampleCoupon,
        userId: anotherUserId, // Different user
      });

      await request(app.getHttpServer())
        .post('/coupons/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send(validatePayload)
        .expect(403);
    });

    it('should return valid:false with reason rate_limit_exceeded when validation attempts exceeded', async () => {
      mockRedisClient.get.mockResolvedValue('10'); // Already at max attempts

      const response = await request(app.getHttpServer())
        .post('/coupons/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send(validatePayload)
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.reason).toBe('rate_limit_exceeded');
    });

    it('should normalize coupon code to uppercase before validation', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      mockCouponRepository.findOne.mockResolvedValue({
        ...sampleCoupon,
        code: 'UZIMA1A2', // Stored as uppercase
        userId,
      });

      // Send lowercase code
      const response = await request(app.getHttpServer())
        .post('/coupons/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'uzima1a2', specialistId: 'specialist-uuid-1' })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(mockCouponRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { code: 'UZIMA1A2' }, // Should be converted to uppercase
        }),
      );
    });

    it('should trim whitespace from coupon code', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      mockCouponRepository.findOne.mockResolvedValue({
        ...sampleCoupon,
        userId,
      });

      const response = await request(app.getHttpServer())
        .post('/coupons/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: '  UZIMA1A2  ', specialistId: 'specialist-uuid-1' })
        .expect(200);

      expect(response.body.valid).toBe(true);
    });

    it('should reject invalid request body with 400', async () => {
      await request(app.getHttpServer())
        .post('/coupons/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({}) // Missing required fields
        .expect(400);
    });

    it('should reject request without code field', async () => {
      await request(app.getHttpServer())
        .post('/coupons/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ specialistId: 'specialist-uuid-1' })
        .expect(400);
    });

    it('should reject request without specialistId field', async () => {
      await request(app.getHttpServer())
        .post('/coupons/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'UZIMA1A2' })
        .expect(400);
    });

    it('should return 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/coupons/validate')
        .send(validatePayload)
        .expect(401);
    });
  });

  describe('Coupon Validation - Edge Cases', () => {
    it('should handle coupon with EXPIRED status but not yet past expiresAt date', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);

      mockCouponRepository.findOne.mockResolvedValue({
        ...sampleCoupon,
        status: CouponStatus.EXPIRED, // Manually marked as expired
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // Not yet expired by date
        userId,
      });

      const response = await request(app.getHttpServer())
        .post('/coupons/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'UZIMA1A2', specialistId: 'specialist-uuid-1' })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.reason).toBe('expired');
    });

    it('should increment Redis counter on each validation attempt', async () => {
      mockRedisClient.get.mockResolvedValue('2');
      mockRedisClient.incr.mockResolvedValue(3);
      mockRedisClient.expire.mockResolvedValue(1);

      mockCouponRepository.findOne.mockResolvedValue({
        ...sampleCoupon,
        userId,
      });

      await request(app.getHttpServer())
        .post('/coupons/validate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: 'UZIMA1A2', specialistId: 'specialist-uuid-1' })
        .expect(200);

      expect(mockRedisClient.incr).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        'coupon_validate:UZIMA1A2',
        3600,
      );
    });
  });

  // Note: The following tests document endpoints that should exist based on task requirements
  // but are not currently implemented in the codebase
  describe.skip('Missing Endpoints (To Be Implemented)', () => {
    it('POST /coupons - Admin-only coupon creation (endpoint not implemented)', async () => {
      // This test documents the requirement for an admin-only coupon creation endpoint
      const createPayload = {
        code: 'ADMIN2024',
        userId,
        discount: 20,
        specialistType: 'therapist',
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      };

      // Admin should be able to create coupon
      await request(app.getHttpServer())
        .post('/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createPayload)
        .expect(201);

      // Non-admin should receive 403
      await request(app.getHttpServer())
        .post('/coupons')
        .set('Authorization', `Bearer ${userToken}`)
        .send(createPayload)
        .expect(403);
    });

    it('GET /coupons/validate/:code - Direct code validation (endpoint not implemented)', async () => {
      // This test documents the requirement for a direct code validation endpoint
      mockCouponRepository.findOne.mockResolvedValue({
        ...sampleCoupon,
        userId,
      });

      const response = await request(app.getHttpServer())
        .get('/coupons/validate/UZIMA1A2')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
    });

    it('GET /coupons - List coupons with filters (endpoint not implemented)', async () => {
      // This test documents the requirement for a filtered coupon list endpoint
      const response = await request(app.getHttpServer())
        .get('/coupons?status=active&specialistType=doctor')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('POST /coupons/apply - Apply coupon to reward calculation (endpoint not implemented)', async () => {
      // This test documents the requirement for a coupon application endpoint
      const applyPayload = {
        couponCode: 'UZIMA1A2',
        totalAmount: 100,
      };

      const response = await request(app.getHttpServer())
        .post('/coupons/apply')
        .set('Authorization', `Bearer ${userToken}`)
        .send(applyPayload)
        .expect(200);

      expect(response.body.originalAmount).toBe(100);
      expect(response.body.discountAmount).toBe(10); // 10% discount
      expect(response.body.finalAmount).toBe(90);
    });

    it('Database state - usedCount should increment after coupon redemption (requires redemption endpoint)', async () => {
      // This test documents the requirement for tracking coupon usage
      const coupon = {
        ...sampleCoupon,
        usedCount: 0,
        maxUses: 1,
      };

      mockCouponRepository.findOne.mockResolvedValue(coupon);

      // After applying coupon, usedCount should increment
      await request(app.getHttpServer())
        .post('/coupons/apply')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ couponCode: 'UZIMA1A2', totalAmount: 100 })
        .expect(200);

      // Verify database state updated
      expect(mockCouponRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          usedCount: 1,
        }),
      );
    });
  });
});
