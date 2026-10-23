import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { IdempotencyKey } from '../../database/entities/idempotency-key.entity';

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly repo: Repository<IdempotencyKey>,
  ) {}

  async find(
    userId: string | null,
    method: string,
    path: string,
    key: string,
  ): Promise<IdempotencyKey | null> {
    return this.repo.findOne({
      where: {
        userId: userId === null ? IsNull() : userId,
        method,
        path,
        key,
      },
    });
  }

  async save(record: Partial<IdempotencyKey>): Promise<IdempotencyKey> {
    const entity = this.repo.create(record);
    return this.repo.save(entity);
  }

  /**
   * Atomically claims an operation identifier for a side-effecting job.
   * Returns true if this caller created the record (first execution),
   * false if the operation was already claimed/recorded (duplicate retry).
   * Relies on a unique constraint on (userId, method, path, key) so that
   * concurrent retries cannot both succeed.
   */
  async claim(
    userId: string | null,
    method: string,
    path: string,
    key: string,
    initial: Partial<IdempotencyKey> = {},
  ): Promise<boolean> {
    const existing = await this.find(userId, method, path, key);
    if (existing) {
      return false;
    }
    try {
      await this.save({ ...initial, userId, method, path, key });
      return true;
    } catch (err: any) {
      // Unique violation from a concurrent claimer
      if (err?.code === '23505' || err?.code === 'ER_DUP_ENTRY' || err?.code === 'SQLITE_CONSTRAINT') {
        return false;
      }
      throw err;
    }
  }

  /**
   * Runs an irreversible side effect at most once per stable operation id.
   * If the operation was already completed, the side effect is skipped and
   * the previously stored result is returned. Otherwise the side effect runs
   * and its result is persisted under the operation id.
   */
  async runOnce<T>(
    userId: string | null,
    operationId: string,
    sideEffect: () => Promise<T>,
  ): Promise<{ executed: boolean; result: T | null }> {
    const method = 'JOB';
    const path = 'background-job';
    const existing = await this.find(userId, method, path, operationId);
    if (existing && existing.responseBody !== undefined && existing.responseBody !== null) {
      return { executed: false, result: JSON.parse(existing.responseBody) as T };
    }
    const claimed = existing
      ? false
      : await this.claim(userId, method, path, operationId);
    if (!claimed && !existing) {
      return { executed: false, result: null };
    }
    const result = await sideEffect();
    const record = await this.find(userId, method, path, operationId);
    if (record) {
      record.responseBody = JSON.stringify(result ?? null);
      await this.repo.save(record);
    }
    return { executed: true, result };
  }

  async deleteById(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
