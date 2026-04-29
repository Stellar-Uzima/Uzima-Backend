import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AdminUsersController } from '../src/admin/admin-user.controller';
import { AdminUsersService } from '../src/admin/services/admin-users.service';
import { AuditService } from '../src/audit/audit.service';
import { AuditLog } from '../src/audit/entities/audit-log.entity';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { User } from '../src/entities/user.entity';
import { Role } from '../src/auth/enums/role.enum';

const mockRedisClient = {
  connect: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

jest.mock('redis', () => ({
  createClient: () => mockRedisClient,
}));

describe('Admin User Management (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let adminToken: string;
  let userToken: string;

  const adminId = 'admin-uuid-1';
  const userId = 'user-uuid-1';
  const targetUserId = 'target-uuid-1';

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockAuditRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const auditLogs: { adminId: string; action: string }[] = [];

  beforeAll(async () => {
    // Track audit logs in memory
    mockAuditRepository.create.mockImplementation((dto) => dto);
    mockAuditRepository.save.mockImplementation((log) => {
      auditLogs.push(log);
      return Promise.resolve({ id: 'log-uuid', ...log, createdAt: new Date() });
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: process.env.JWT_SECRET || 'secretKey',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [AdminUsersController],
      providers: [
        AdminUsersService,
        AuditService,
        JwtStrategy,
        RolesGuard,
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(AuditLog), useValue: mockAuditRepository },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

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
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
    auditLogs.length = 0;
  });

  describe('Non-admin user receives 403 on all admin endpoints', () => {
    it('GET /admin/users returns 403 for regular user', () => {
      return request(app.getHttpServer())
        .get('/admin/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('GET /admin/users/:id returns 403 for regular user', () => {
      return request(app.getHttpServer())
        .get(`/admin/users/${targetUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('PATCH /admin/users/:id/role returns 403 for regular user', () => {
      return request(app.getHttpServer())
        .patch(`/admin/users/${targetUserId}/role`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ role: Role.ADMIN })
        .expect(403);
    });

    it('PATCH /admin/users/:id/suspend returns 403 for regular user', () => {
      return request(app.getHttpServer())
        .patch(`/admin/users/${targetUserId}/suspend`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('PATCH /admin/users/:id/reactivate returns 403 for regular user', () => {
      return request(app.getHttpServer())
        .patch(`/admin/users/${targetUserId}/reactivate`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });

    it('POST /admin/users returns 403 for regular user', () => {
      return request(app.getHttpServer())
        .post('/admin/users')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          email: 'newadmin@test.com',
          firstName: 'New',
          lastName: 'Admin',
          password: 'SecurePass123',
          country: 'US',
        })
        .expect(403);
    });

    it('returns 401 with no token', () => {
      return request(app.getHttpServer())
        .get('/admin/users')
        .expect(401);
    });
  });

  describe('Admin actions are recorded in the audit log', () => {
    const mockTarget = {
      id: targetUserId,
      email: 'target@test.com',
      firstName: 'Target',
      lastName: 'User',
      role: Role.USER,
      country: 'US',
      isActive: true,
      stellarWalletAddress: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('changing a user role creates an audit log entry', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockTarget });
      mockUserRepository.save.mockResolvedValue({
        ...mockTarget,
        role: Role.HEALER,
      });

      await request(app.getHttpServer())
        .patch(`/admin/users/${targetUserId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: Role.HEALER })
        .expect(200);

      expect(auditLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            adminId,
            action: expect.stringContaining('Changed role'),
          }),
        ]),
      );
    });

    it('suspending a user creates an audit log entry', async () => {
      mockUserRepository.findOne.mockResolvedValue({ ...mockTarget });
      mockUserRepository.save.mockResolvedValue({
        ...mockTarget,
        isActive: false,
      });

      await request(app.getHttpServer())
        .patch(`/admin/users/${targetUserId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(auditLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            adminId,
            action: expect.stringContaining('Suspended user'),
          }),
        ]),
      );
    });

    it('reactivating a user creates an audit log entry', async () => {
      mockUserRepository.findOne.mockResolvedValue({
        ...mockTarget,
        isActive: false,
      });
      mockUserRepository.save.mockResolvedValue({
        ...mockTarget,
        isActive: true,
      });

      await request(app.getHttpServer())
        .patch(`/admin/users/${targetUserId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(auditLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            adminId,
            action: expect.stringContaining('Reactivated user'),
          }),
        ]),
      );
    });

    it('creating an admin user creates an audit log entry', async () => {
      const savedAdmin = {
        id: 'new-admin-uuid',
        email: 'created-admin@test.com',
        firstName: 'Created',
        lastName: 'Admin',
        password: 'hashed-password',
        country: 'KE',
        role: Role.ADMIN,
        isActive: true,
        isVerified: true,
      };

      // findOne returns null (email not taken)
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue(savedAdmin);
      mockUserRepository.save.mockResolvedValue(savedAdmin);

      await request(app.getHttpServer())
        .post('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'created-admin@test.com',
          firstName: 'Created',
          lastName: 'Admin',
          password: 'SecurePass123',
          country: 'KE',
        })
        .expect(201);

      expect(auditLogs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            adminId,
            action: expect.stringContaining('Created admin user'),
          }),
        ]),
      );
    });
  });
});
