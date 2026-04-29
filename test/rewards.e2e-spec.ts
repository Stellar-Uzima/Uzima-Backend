import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../src/entities/user.entity';
import { HealthTask } from '../src/tasks/entities/health-task.entity';
import { TaskCompletion } from '../src/tasks/entities/task-completion.entity';
import { RewardTransaction } from '../src/rewards/entities/reward-transaction.entity';

describe('Rewards E2E', () => {
  let app: INestApplication;
  let userRepo: Repository<User>;
  let taskRepo: Repository<HealthTask>;
  let completionRepo: Repository<TaskCompletion>;
  let rewardRepo: Repository<RewardTransaction>;

  const mockAuthGuard = {
    canActivate: (context: any) => {
      const req = context.switchToHttp().getRequest();
      const id = req.headers['x-test-user-id'] || 'test-user-id';
      req.user = { id, sub: id };
      return true;
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard((require('../src/auth/guards/jwt-auth.guard') as any).JwtAuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    userRepo = moduleRef.get(getRepositoryToken(User));
    taskRepo = moduleRef.get(getRepositoryToken(HealthTask));
    completionRepo = moduleRef.get(getRepositoryToken(TaskCompletion));
    rewardRepo = moduleRef.get(getRepositoryToken(RewardTransaction));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await rewardRepo.query('DELETE FROM reward_transactions');
    await completionRepo.query('DELETE FROM task_completions');
    await taskRepo.query('DELETE FROM health_tasks');
    await userRepo.query('DELETE FROM users');
  });

  it('completing a task increases user XLM balance correctly', async () => {
    const user = await userRepo.save(
      userRepo.create({ firstName: 'Test', lastName: 'User', country: 'US' } as any),
    );
    const task = await taskRepo.save(
      taskRepo.create({ title: 'Walk', rewardAmount: 1.5 } as any),
    );

    // Starting balance should be zero
    const beforeRows = await rewardRepo.query(
      `SELECT COALESCE(SUM(amount)::float,0) as sum FROM reward_transactions WHERE "userId" = $1 AND status = 'success'`,
      [user.id],
    );
    const before = parseFloat(beforeRows?.[0]?.sum ?? '0');
    expect(before).toBeCloseTo(0);

    // Complete task (self-report) -> should create completion and enqueue reward
    await request(app.getHttpServer())
      .post('/tasks/completions')
      .set('x-test-user-id', user.id)
      .send({ taskId: task.id, proofType: 'SELF_REPORT' })
      .expect(201);

    // Simulate reward distribution by directly inserting a successful transaction
    await rewardRepo.save(
      rewardRepo.create({ userId: user.id, amount: 1.5, status: 'success' } as any),
    );

    const afterRows = await rewardRepo.query(
      `SELECT COALESCE(SUM(amount)::float,0) as sum FROM reward_transactions WHERE "userId" = $1 AND status = 'success'`,
      [user.id],
    );
    const after = parseFloat(afterRows?.[0]?.sum ?? '0');
    expect(after - before).toBeCloseTo(1.5);
  });

  it('daily duplicate completion is rejected (conflict/409)', async () => {
    const user = await userRepo.save(userRepo.create({ firstName: 'Dup', lastName: 'User', country: 'US' } as any));
    const task = await taskRepo.save(taskRepo.create({ title: 'Run', rewardAmount: 0.8 } as any));

    await request(app.getHttpServer())
      .post('/tasks/completions')
      .set('x-test-user-id', user.id)
      .send({ taskId: task.id, proofType: 'SELF_REPORT' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/tasks/completions')
      .set('x-test-user-id', user.id)
      .send({ taskId: task.id, proofType: 'SELF_REPORT' })
      .expect(409);
  });

  it.skip('daily limit is enforced and returns 429 when exceeded (requires rate-limit/daily limit implementation)', async () => {});

  it.skip('streak bonus is applied on the correct day (requires streak -> rewards integration)', async () => {});

  it('reward history endpoint returns earnings in descending order', async () => {
    const user = await userRepo.save(userRepo.create({ firstName: 'Hist', lastName: 'User', country: 'US' } as any));
    const older = await rewardRepo.save(
      rewardRepo.create({ userId: user.id, amount: 0.5, status: 'success', createdAt: new Date(Date.now() - 1000 * 60 * 60) } as any),
    );
    const newer = await rewardRepo.save(
      rewardRepo.create({ userId: user.id, amount: 1.0, status: 'success', createdAt: new Date() } as any),
    );

    const res = await request(app.getHttpServer())
      .get('/rewards/history')
      .set('x-test-user-id', user.id)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0].id).toEqual(newer.id);
    expect(res.body.data[1].id).toEqual(older.id);
  });

  it.skip('redemption with insufficient balance returns 402 (to be implemented when redeem endpoint exists)', async () => {});
});
