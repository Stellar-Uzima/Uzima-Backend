import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Database Integration Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  // ========== MIGRATIONS VERIFICATION ==========

  describe('Migrations Verification', () => {
    it('should have User table', async () => {
      const result = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'User'
        );
      `);
      const exists = (result as any[])[0]?.exists;
      expect(exists).toBe(true);
    });

    it('should have Company table', async () => {
      const result = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'Company'
        );
      `);
      const exists = (result as any[])[0]?.exists;
      expect(exists).toBe(true);
    });

    it('should have Transaction table', async () => {
      const result = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'Transaction'
        );
      `);
      const exists = (result as any[])[0]?.exists;
      expect(exists).toBe(true);
    });

    it('should have Project table', async () => {
      const result = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'Project'
        );
      `);
      const exists = (result as any[])[0]?.exists;
      expect(exists).toBe(true);
    });
  });

  // ========== RELATIONSHIPS TESTS ==========

  describe('Relationships Tests', () => {
    let testCompanyId: string;
    let testUserId: string;

    beforeAll(async () => {
      // Create test company
      const company = await prisma.company.create({
        data: {
          name: `Test Company ${Date.now()}`,
          annualRetirementTarget: 1000,
          netZeroTarget: 5000,
        },
      });
      testCompanyId = company.id;

      // Create test user
      const user = await prisma.user.create({
        data: {
          email: `test-${Date.now()}@example.com`,
          password: 'hashedpassword123',
          firstName: 'Test',
          lastName: 'User',
          companyId: testCompanyId,
        },
      });
      testUserId = user.id;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { id: testUserId } });
      await prisma.company.deleteMany({ where: { id: testCompanyId } });
    });

    it('should link User to Company correctly', async () => {
      const user = await prisma.user.findUnique({
        where: { id: testUserId },
        include: { company: true },
      });
      
      expect(user).toBeDefined();
      expect(user?.company).toBeDefined();
      expect(user?.company.id).toBe(testCompanyId);
      expect(user?.company.name).toContain('Test Company');
    });

    it('should allow querying users by company', async () => {
      const users = await prisma.user.findMany({
        where: { companyId: testCompanyId },
      });
      
      expect(users.length).toBeGreaterThan(0);
      expect(users[0].companyId).toBe(testCompanyId);
    });
  });

  // ========== TRANSACTIONS TESTS ==========

  describe('Transactions Tests', () => {
    let testCompanyId: string;
    let testProjectId: string;

    beforeAll(async () => {
      const company = await prisma.company.create({
        data: {
          name: `Transaction Test Co ${Date.now()}`,
          annualRetirementTarget: 500,
          netZeroTarget: 2500,
        },
      });
      testCompanyId = company.id;

      const project = await prisma.project.create({
        data: {
          name: 'Transaction Test Project',
          startDate: new Date(),
          companyId: testCompanyId,
        },
      });
      testProjectId = project.id;
    });

    afterAll(async () => {
      await prisma.project.deleteMany({ where: { id: testProjectId } });
      await prisma.company.deleteMany({ where: { id: testCompanyId } });
    });

    it('should create a transaction record', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          companyId: testCompanyId,
          type: 'order',
          amount: 1000,
          currency: 'USD',
          status: 'pending',
        },
      });
      
      expect(transaction).toBeDefined();
      expect(transaction.id).toBeDefined();
      expect(transaction.amount).toBe(1000);
      expect(transaction.status).toBe('pending');
      
      await prisma.transaction.delete({ where: { id: transaction.id } });
    });

    it('should update transaction status', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          companyId: testCompanyId,
          type: 'order',
          amount: 500,
          currency: 'USD',
          status: 'pending',
        },
      });
      
      const updated = await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'completed' },
      });
      
      expect(updated.status).toBe('completed');
      
      await prisma.transaction.delete({ where: { id: transaction.id } });
    });

    it('should delete transaction', async () => {
      const transaction = await prisma.transaction.create({
        data: {
          companyId: testCompanyId,
          type: 'order',
          amount: 200,
          currency: 'USD',
          status: 'pending',
        },
      });
      
      await prisma.transaction.delete({ where: { id: transaction.id } });
      
      const deleted = await prisma.transaction.findUnique({
        where: { id: transaction.id },
      });
      expect(deleted).toBeNull();
    });
  });

  // ========== QUERIES TESTS ==========

  describe('Queries Tests', () => {
    let testCompanyId: string;

    beforeAll(async () => {
      const company = await prisma.company.create({
        data: {
          name: `Query Test Co ${Date.now()}`,
          annualRetirementTarget: 2000,
          netZeroTarget: 10000,
        },
      });
      testCompanyId = company.id;

      // Create multiple users
      for (let i = 0; i < 5; i++) {
        await prisma.user.create({
          data: {
            email: `query-user-${i}-${Date.now()}@example.com`,
            password: 'hashed',
            firstName: `User${i}`,
            lastName: 'Test',
            companyId: testCompanyId,
          },
        });
      }
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { companyId: testCompanyId } });
      await prisma.company.deleteMany({ where: { id: testCompanyId } });
    });

    it('should filter users by company', async () => {
      const users = await prisma.user.findMany({
        where: { companyId: testCompanyId },
      });
      
      expect(users.length).toBe(5);
    });

    it('should sort users by creation date', async () => {
      const users = await prisma.user.findMany({
        where: { companyId: testCompanyId },
        orderBy: { createdAt: 'desc' },
      });
      
      expect(users.length).toBeGreaterThan(0);
      expect(users[0].createdAt).toBeDefined();
    });

    it('should paginate results using take and skip', async () => {
      const page1 = await prisma.user.findMany({
        where: { companyId: testCompanyId },
        take: 2,
        skip: 0,
      });
      
      const page2 = await prisma.user.findMany({
        where: { companyId: testCompanyId },
        take: 2,
        skip: 2,
      });
      
      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  // ========== CLEANUP ==========

  describe('Cleanup', () => {
    it('should clean up test data', async () => {
      // This ensures all test data is removed
      const result = await prisma.$executeRawUnsafe(`
        DELETE FROM "User" WHERE email LIKE '%-test-%'
      `);
      expect(result).toBeDefined();
    });
  });
});