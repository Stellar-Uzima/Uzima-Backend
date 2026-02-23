import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { HealthTask, TaskStatus } from '../entities/health-task.entity';

@Injectable()
export class HealthTaskRepository extends Repository<HealthTask> {
  constructor(private dataSource: DataSource) {
    super(HealthTask, dataSource.createEntityManager());
  }

  async findActiveTasks(page: number, limit: number, categoryId?: number) {
    const query = this.createQueryBuilder('task')
      .where('task.status = :status', { status: TaskStatus.ACTIVE })
      .leftJoinAndSelect('task.creator', 'creator')
      .orderBy('task.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (categoryId) {
      query.andWhere('task.categoryId = :categoryId', { categoryId });
    }

    const [tasks, total] = await query.getManyAndCount();
    return { tasks, total };
  }
}
