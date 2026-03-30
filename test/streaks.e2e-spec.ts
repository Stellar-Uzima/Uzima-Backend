import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User } from '../src/entities/user.entity';
import { Streak } from '../src/streaks/entities/streak.entity';
import { HealthTask } from '../src/tasks/entities/health-task.entity';
import { TaskCompletion } from '../src/tasks/entities/task-completion.entity';
import { Coupon, CouponStatus } from '../src/coupons/entities/coupon.entity';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

describe('Streak Endpoint Integration (e2e)', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let streakRepo: Repository<Streak>;
  let healthTaskRepo: Repository<HealthTask>;
  let completionRepo: Repository<TaskCompletion>;
  let couponRepo: Repository<Coupon>;

  const mockAuthGuard = {
    canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      const id = req.headers['x-test-user-id'] || 'test-user-id';
      req.user = { id, sub: id };
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
    streakRepo = moduleRef.get<Repository<Streak>>(getRepositoryToken(Streak));
    healthTaskRepo = moduleRef.get<Repository<HealthTask>>(
      getRepositoryToken(HealthTask),
    );
    completionRepo = moduleRef.get<Repository<TaskCompletion>>(
      getRepositoryToken(TaskCompletion),
    );
    couponRepo = moduleRef.get<Repository<Coupon>>(getRepositoryToken(Coupon));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await Promise.all([
      completionRepo.query('DELETE FROM task_completions'),
      streakRepo.query('DELETE FROM streaks'),
      couponRepo.query('DELETE FROM coupons'),
      healthTaskRepo.query('DELETE FROM health_tasks'),
      userRepo.query('DELETE FROM users'),
    ]);
  });

  function formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  it('GET /users/me/streak returns current streak data', async () => {
    const user = await userRepo.save({
      firstName: 'Streak',
      lastName: 'User',
      email: 'streak1@example.com',
      country: 'US',
    } as any);

    await streakRepo.save(
      streakRepo.create({ user, currentStreak: 0, longestStreak: 0 }),
    );

    const result = await request(app.getHttpServer())
      .get('/users/me/streak')
      .set('x-test-user-id', user.id)
      .expect(200);

    expect(result.body.currentStreak).toBe(0);
    expect(result.body.longestStreak).toBe(0);
    expect(result.body.lastCompletedDate).toBeNull();
  });

  it('completing a task increments streak correctly', async () => {
    const user = await userRepo.save({
      firstName: 'Streak',
      lastName: 'Runner',
      email: 'streak2@example.com',
      country: 'US',
    } as any);

    await streakRepo.save(
      streakRepo.create({ user, currentStreak: 0, longestStreak: 0 }),
    );

    const task = await healthTaskRepo.save({
      title: 'Walk',
      category: 'fitness',
      xlmReward: 1,
      isActive: true,
    } as any);

    await request(app.getHttpServer())
      .post('/tasks/completions')
      .set('x-test-user-id', user.id)
      .send({ taskId: task.id, proofType: 'self_report' })
      .expect(201);

    const streak = await streakRepo.findOne({
      where: { user: { id: user.id } },
    });
    expect(streak).toBeDefined();
    expect(streak.currentStreak).toBe(1);
    expect(streak.longestStreak).toBe(1);

    const response = await request(app.getHttpServer())
      .get('/users/me/streak')
      .set('x-test-user-id', user.id)
      .expect(200);

    expect(response.body.currentStreak).toBe(1);
    expect(response.body.longestStreak).toBe(1);
    expect(response.body.lastCompletedDate).toBe(formatDate(new Date()));
  });

  it('streak resets to 1 after missed day', async () => {
    const user = await userRepo.save({
      firstName: 'Streak',
      lastName: 'Reset',
      email: 'streak3@example.com',
      country: 'US',
    } as any);

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    await streakRepo.save(
      streakRepo.create({
        user,
        currentStreak: 5,
        longestStreak: 5,
        lastCompletedDate: formatDate(twoDaysAgo),
      }),
    );

    const task = await healthTaskRepo.save({
      title: 'Meditate',
      category: 'mental',
      xlmReward: 2,
      isActive: true,
    } as any);

    await request(app.getHttpServer())
      .post('/tasks/completions')
      .set('x-test-user-id', user.id)
      .send({ taskId: task.id, proofType: 'self_report' })
      .expect(201);

    const streak = await streakRepo.findOne({
      where: { user: { id: user.id } },
    });
    expect(streak.currentStreak).toBe(1);
    expect(streak.longestStreak).toBe(5);
    expect(streak.lastCompletedDate).toBe(formatDate(new Date()));
  });

  it('GET /users/me/streak/history returns a week-by-week view', async () => {
    const user = await userRepo.save({
      firstName: 'History',
      lastName: 'User',
      email: 'streak4@example.com',
      country: 'US',
    } as any);

    await streakRepo.save(
      streakRepo.create({ user, currentStreak: 0, longestStreak: 0 }),
    );

    const start = new Date();
    start.setDate(start.getDate() - 13);

    // create daily completions in days 0, 1, and 8
    const completeDates = [0, 1, 8].map((offset) => {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      return d;
    });

    const task = await healthTaskRepo.save(
      healthTaskRepo.create({
        title: 'Run',
        category: 'fitness',
        xlmReward: 1,
        isActive: true,
      } as any),
    );

    for (const date of completeDates) {
      await completionRepo.save(
        completionRepo.create({
          user,
          task,
          status: 'verified',
          proofUrl: null,
          xlmRewarded: 1,
          completedAt: date,
        } as any),
      );
    }

    const response = await request(app.getHttpServer())
      .get('/users/me/streak/history')
      .set('x-test-user-id', user.id)
      .expect(200);

    expect(response.body).toHaveProperty('weeks');
    expect(Array.isArray(response.body.weeks)).toBe(true);
    expect(response.body.weeks.length).toBe(4);

    const flattened = response.body.weeks.flat();
    const completedDays = flattened
      .filter((d: any) => d.completed)
      .map((d: any) => d.date);

    expect(completedDays).toEqual(
      expect.arrayContaining(completeDates.map((d) => formatDate(d))),
    );
  });

  it('streak milestone 7 triggers bonus coupon creation', async () => {
    const user = await userRepo.save({
      firstName: 'Milestone',
      lastName: 'User',
      email: 'streak5@example.com',
      country: 'US',
    } as any);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await streakRepo.save(
      streakRepo.create({
        user,
        currentStreak: 6,
        longestStreak: 6,
        lastCompletedDate: formatDate(yesterday),
      }),
    );

    const task = await healthTaskRepo.save({
      title: 'Yoga',
      category: 'fitness',
      xlmReward: 1,
      isActive: true,
    } as any);

    await request(app.getHttpServer())
      .post('/tasks/completions')
      .set('x-test-user-id', user.id)
      .send({ taskId: task.id, proofType: 'self_report' })
      .expect(201);

    const streak = await streakRepo.findOne({
      where: { user: { id: user.id } },
    });
    expect(streak.currentStreak).toBe(7);
    expect(streak.longestStreak).toBe(7);

    const couponCount = await couponRepo.count({
      where: { userId: user.id, status: CouponStatus.ACTIVE },
    });
    expect(couponCount).toBeGreaterThanOrEqual(1);
  });
});
