import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  async ping(): Promise<boolean> {
    return true;
  }

  async get(key: string): Promise<string | null> {
    return null;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<void> {
    // stub
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    // stub
  }

  async incr(key: string): Promise<number> {
    return 0;
  }

  async expire(key: string, seconds: number): Promise<void> {
    // stub
  }

  async exists(key: string): Promise<number> {
    return 0;
  }
}