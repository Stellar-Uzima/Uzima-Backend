
import { Test, TestingModule } from '@nestjs/testing';
import { ShutdownService } from './shutdown.service';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { getQueueToken } from '@nestjs/bull';
import { Queue } from 'bull';
import { REWARD_QUEUE, PROOF_VERIFICATION_QUEUE, NOTIFICATION_QUEUE, TASK_VERIFICATION_QUEUE, USER_ACTIVITY_QUEUE, DATA_PROCESSING_QUEUE } from '../../queue/queue.constants';
import { getRedisToken } from '@nestjs-modules/ioredis';

describe('ShutdownService', () => {
  let service: ShutdownService;
  let dataSource: DeepMocked<DataSource>;
  let redis: DeepMocked<Redis>;
  let rewardQueue: DeepMocked<Queue>;
  let proofQueue: DeepMocked<Queue>;
  let notificationQueue: DeepMocked<Queue>;
  let taskVerificationQueue: DeepMocked<Queue>;
  let userActivityQueue: DeepMocked<Queue>;
  let dataProcessingQueue: DeepMocked<Queue>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShutdownService,
        {
          provide: DataSource,
          useValue: {
            isInitialized: true,
            destroy: jest.fn(),
          },
        },
        {
          provide: getRedisToken(),
          useValue: {
            quit: jest.fn(),
            disconnect: jest.fn(),
          },
        },
        { provide: getQueueToken(REWARD_QUEUE), useValue: { close: jest.fn(), name: REWARD_QUEUE } },
        { provide: getQueueToken(PROOF_VERIFICATION_QUEUE), useValue: { close: jest.fn(), name: PROOF_VERIFICATION_QUEUE } },
        { provide: getQueueToken(NOTIFICATION_QUEUE), useValue: { close: jest.fn(), name: NOTIFICATION_QUEUE } },
        { provide: getQueueToken(TASK_VERIFICATION_QUEUE), useValue: { close: jest.fn(), name: TASK_VERIFICATION_QUEUE } },
        { provide: getQueueToken(USER_ACTIVITY_QUEUE), useValue: { close: jest.fn(), name: USER_ACTIVITY_QUEUE } },
        { provide: getQueueToken(DATA_PROCESSING_QUEUE), useValue: { close: jest.fn(), name: DATA_PROCESSING_QUEUE } },
      ],
    }).compile();

    service = module.get<ShutdownService>(ShutdownService);
    dataSource = module.get(DataSource);
    redis = module.get(getRedisToken());
    rewardQueue = module.get(getQueueToken(REWARD_QUEUE));
    proofQueue = module.get(getQueueToken(PROOF_VERIFICATION_QUEUE));
    notificationQueue = module.get(getQueueToken(NOTIFICATION_QUEUE));
    taskVerificationQueue = module.get(getQueueToken(TASK_VERIFICATION_QUEUE));
    userActivityQueue = module.get(getQueueToken(USER_ACTIVITY_QUEUE));
    dataProcessingQueue = module.get(getQueueToken(DATA_PROCESSING_QUEUE));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onApplicationShutdown', () => {
    it('should gracefully shut down all services', async () => {
      await service.onApplicationShutdown('TEST');

      expect(rewardQueue.close).toHaveBeenCalledTimes(1);
      expect(proofQueue.close).toHaveBeenCalledTimes(1);
      expect(notificationQueue.close).toHaveBeenCalledTimes(1);
      expect(taskVerificationQueue.close).toHaveBeenCalledTimes(1);
      expect(userActivityQueue.close).toHaveBeenCalledTimes(1);
      expect(dataProcessingQueue.close).toHaveBeenCalledTimes(1);
      expect(redis.quit).toHaveBeenCalledTimes(1);
      expect(dataSource.destroy).toHaveBeenCalledTimes(1);
    });

    it('should handle redis quit error and disconnect', async () => {
      redis.quit.mockRejectedValue(new Error('Quit error'));

      await service.onApplicationShutdown('TEST');

      expect(redis.quit).toHaveBeenCalledTimes(1);
      expect(redis.disconnect).toHaveBeenCalledTimes(1);
      expect(dataSource.destroy).toHaveBeenCalledTimes(1);
    });

    it('should not destroy data source if not initialized', async () => {
      dataSource.isInitialized = false;

      await service.onApplicationShutdown('TEST');

      expect(dataSource.destroy).not.toHaveBeenCalled();
    });
  });
});

type DeepMocked<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? jest.Mock<ReturnType<T[K]>, Parameters<T[K]>> : T[K];
};