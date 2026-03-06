import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  @Get()
  async check() {
    let dbStatus = 'up';
    let redisStatus = 'up';

    try {
      await this.db.pingCheck('database');
    } catch {
      dbStatus = 'down';
    }

    try {
      await this.redis.ping();
    } catch {
      redisStatus = 'down';
    }

    if (dbStatus === 'down' || redisStatus === 'down') {
      throw new HttpException(
        {
          status: 'error',
          db: dbStatus,
          redis: redisStatus,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      status: 'ok',
      db: dbStatus,
      redis: redisStatus,
    };
  }
}