import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../src/entities/user.entity';
import { StellarService } from '../src/stellar/stellar.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

describe('Wallet Linking E2E', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;

  const mockAuthGuard = {
    canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      const id = req.headers['x-test-user-id'] || 'test-user-id';
      req.user = { id, sub: id };
      return true;
    },
  };

  const mockStellarService = {
    accountExists: jest.fn(),
    getAccountBalance: jest.fn(),
  };

  const VALID_ADDRESS = 'GBXGQ7HVG44S3SBRHZR6P2I4VVRX7XNR4T47FTHS5U4B5GZZSZRNS4TR';

  beforeAll(async () => {
    // Increase timeout for app initialization
    jest.setTimeout(30000);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockAuthGuard)
      .overrideProvider(StellarService)
      .useValue(mockStellarService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    userRepo = moduleRef.get(getRepositoryToken(User));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await userRepo.query('DELETE FROM users');
    jest.clearAllMocks();
  });

  describe('POST /users/me/wallet', () => {
    it('should link a valid Stellar address successfully (200)', async () => {
      const user = await userRepo.save(
        userRepo.create({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          country: 'US',
        } as any),
      );
      const userId = (user as any).id;

      mockStellarService.accountExists.mockResolvedValue(true);

      const res = await (request as any)(app.getHttpServer())
        .post('/users/me/wallet')
        .set('x-test-user-id', userId)
        .send({ address: VALID_ADDRESS })
        .expect(200);

      expect(res.body.message).toBe('Wallet linked successfully');

      const updatedUser = await userRepo.findOne({ where: { id: userId } });
      expect(updatedUser.stellarWalletAddress).toBe(VALID_ADDRESS);
    });

    it('should return 400 for invalid address format', async () => {
      const user = await userRepo.save(
        userRepo.create({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john2@example.com',
          country: 'US',
        } as any),
      );
      const userId = (user as any).id;

      await (request as any)(app.getHttpServer())
        .post('/users/me/wallet')
        .set('x-test-user-id', userId)
        .send({ address: 'invalid-address' })
        .expect(400);
    });

    it('should return 400 if account does not exist on Stellar network', async () => {
      const user = await userRepo.save(
        userRepo.create({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john3@example.com',
          country: 'US',
        } as any),
      );
      const userId = (user as any).id;

      mockStellarService.accountExists.mockResolvedValue(false);

      await (request as any)(app.getHttpServer())
        .post('/users/me/wallet')
        .set('x-test-user-id', userId)
        .send({ address: VALID_ADDRESS })
        .expect(400);
    });

    it('should return 409 if address is already linked to another account', async () => {
      await userRepo.save(
        userRepo.create({
          firstName: 'Linked',
          lastName: 'User',
          email: 'linked@example.com',
          stellarWalletAddress: VALID_ADDRESS,
          country: 'US',
        } as any),
      );

      const user = await userRepo.save(
        userRepo.create({
          firstName: 'Second',
          lastName: 'User',
          email: 'second@example.com',
          country: 'US',
        } as any),
      );
      const userId = (user as any).id;

      mockStellarService.accountExists.mockResolvedValue(true);

      await (request as any)(app.getHttpServer())
        .post('/users/me/wallet')
        .set('x-test-user-id', userId)
        .send({ address: VALID_ADDRESS })
        .expect(409);
    });
  });

  describe('GET /users/me', () => {
    it('should include the linked wallet address in the response', async () => {
      const user = await userRepo.save(
        userRepo.create({
          firstName: 'Wallet',
          lastName: 'Owner',
          email: 'wallet@example.com',
          stellarWalletAddress: VALID_ADDRESS,
          country: 'US',
          isVerified: true,
          isActive: true,
          role: 'USER',
        } as any),
      );
      const userId = (user as any).id;

      const res = await (request as any)(app.getHttpServer())
        .get('/users/me')
        .set('x-test-user-id', userId)
        .expect(200);

      expect(res.body.stellarWalletAddress).toBe(VALID_ADDRESS);
    });
  });
});
