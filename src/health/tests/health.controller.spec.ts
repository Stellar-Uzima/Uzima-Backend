import { Test } from '@nestjs/testing';

import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

import { HealthController } from '../health.controller';

import { RedisHealthIndicator } from '../indicators/redis.health';

import { QueueHealthIndicator } from '../indicators/queue.health';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],

      providers: [
        {
          provide: HealthCheckService,
          useValue: {},
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: {},
        },
        {
          provide: RedisHealthIndicator,
          useValue: {},
        },
        {
          provide: QueueHealthIndicator,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
