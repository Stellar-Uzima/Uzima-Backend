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

  async deleteById(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
