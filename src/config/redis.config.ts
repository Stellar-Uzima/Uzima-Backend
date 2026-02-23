import { ConfigService } from '@nestjs/config';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
}

export const redisConfig = (configService: ConfigService): RedisConfig => ({
  host: configService.get<string>('REDIS_HOST', 'localhost'),
  port: configService.get<number>('REDIS_PORT', 6379),
  password: configService.get<string>('REDIS_PASSWORD'),
  db: configService.get<number>('REDIS_DB', 0),
  tls: configService.get<boolean>('REDIS_TLS', false),
});

export const getRedisUrl = (config: RedisConfig): string => {
  const protocol = config.tls ? 'rediss' : 'redis';
  const auth = config.password ? `:${config.password}@` : '';
  const db = config.db ? `/${config.db}` : '';
  
  return `${protocol}://${auth}${config.host}:${config.port}${db}`;
};