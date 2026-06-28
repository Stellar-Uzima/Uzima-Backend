import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User } from '../src/entities/user.entity';
import { Notification } from '../src/notifications/entities/notification.entity';
import { NotificationPreference } from '../src/notifications/entities/notification-preference.entity';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

describe('Notifications API e2e', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let notificationRepo: Repository<Notification>;
  let prefsRepo: Repository<NotificationPreference>;

  const mockAuthGuard = {
    canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      const id = req.headers['x-test-user-id'] || 'test-user-id';
      req.user = { userId: id, id };
      return true;
    },
  };

  beforeAll(async () => {
    jest.setTimeout(30000);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    userRepo = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    notificationRepo = moduleRef.get<Repository<Notification>>(
      getRepositoryToken(Notification),
    );
    prefsRepo = moduleRef.get<Repository<NotificationPreference>>(
      getRepositoryToken(NotificationPreference),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await Promise.all([
      notificationRepo.query('DELETE FROM notifications'),
      prefsRepo.query('DELETE FROM notification_preferences'),
      userRepo.query('DELETE FROM users'),
    ]);
  });

  it('should support notification flows', async () => {
    const user = await userRepo.save({
      firstName: 'Notify',
      lastName: 'User',
      email: 'notify@example.com',
      country: 'US',
    } as any);

    await prefsRepo.save({
      userId: user.id,
      user,
      taskReminders: true,
      rewardAlerts: true,
      streakAlerts: true,
      emailNotifications: true,
      smsNotifications: true,
      pushNotifications: true,
      timezone: 'Africa/Lagos',
    } as any);

    await request(app.getHttpServer())
      .get('/notifications')
      .set('x-test-user-id', user.id)
      .expect(200, []);

    const { body: created } = await request(app.getHttpServer())
      .post('/notifications/seed')
      .set('x-test-user-id', user.id)
      .send({ type: 'info', title: 'Welcome', body: 'Hello world' })
      .expect(201);

    expect(created).toHaveProperty('id');
    expect(created.isRead).toBe(false);

    const { body: list } = await request(app.getHttpServer())
      .get('/notifications')
      .set('x-test-user-id', user.id)
      .expect(200);

    expect(list.length).toBe(1);

    const { body: count1 } = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('x-test-user-id', user.id)
      .expect(200);

    expect(count1).toEqual({ count: 1 });

    await request(app.getHttpServer())
      .patch('/notifications/read-all')
      .set('x-test-user-id', user.id)
      .expect(200);

    const { body: count2 } = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('x-test-user-id', user.id)
      .expect(200);

    expect(count2).toEqual({ count: 0 });
  });
});
