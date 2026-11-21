import { Test } from '@nestjs/testing';
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { HealthController } from '../health.controller';
import { QueueHealthIndicator } from '../indicators/queue.health';
import { RedisHealthIndicator } from '../indicators/redis.health';

describe('HealthController', () => {
  it('should be defined', async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: {} },
        { provide: TypeOrmHealthIndicator, useValue: {} },
        { provide: RedisHealthIndicator, useValue: {} },
        { provide: QueueHealthIndicator, useValue: {} },
      ],
    }).compile();

    expect(module.get(HealthController)).toBeDefined();
  });
});