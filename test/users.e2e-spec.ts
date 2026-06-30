import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let server: any;
  let usersService: UsersService;

  const mockId = 'mock-user-id';
  const userPayload = {
    id: mockId,
    email: `mock-${Date.now()}@example.com`,
    firstName: 'Mock',
    lastName: 'User',
    country: 'US',
    password: 'ignored',
  } as any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    usersService = moduleFixture.get<UsersService>(UsersService);

    // ensure a user exists with the mock id used by the controller's JwtAuthGuard
    await usersService.create(userPayload);
  });

  afterAll(async () => {
    // cleanup
    try {
      // repository is exposed as public on UsersService
      // attempt to remove the mock user
      const repo = (usersService as any).userRepository;
      if (repo) {
        await repo.delete({ id: mockId });
      }
    } catch (e) {
      // ignore
    }
    await app.close();
  });

  it('GET /api/v1/users/me -> 200', async () => {
    const res = await request(server).get('/api/v1/users/me').expect(200);
    expect(res.body).toHaveProperty('email', userPayload.email);
    expect(res.body).toHaveProperty('firstName', userPayload.firstName);
  });

  it('PATCH /api/v1/users/me -> 200 and updates profile', async () => {
    const res = await request(server)
      .patch('/api/v1/users/me')
      .send({ firstName: 'Updated' })
      .expect(200);

    expect(res.body).toHaveProperty('firstName', 'Updated');
  });
});
