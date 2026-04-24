import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere } from 'typeorm';
import { HealthTask, TaskCategory } from '../../../tasks/entities/health-task.entity';

export interface TaskFilterOptions {
  status?: string;
  category?: TaskCategory;
  priority?: string;
  createdBy?: string;
  isActive?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  presetName?: string;
}

export interface FilterPreset {
  name: string;
  ownerId: string;
  filters: TaskFilterOptions;
  createdAt: Date;
}

@Injectable()
export class TaskFilterService {
  private readonly presets = new Map<string, FilterPreset>();

  constructor(
    @InjectRepository(HealthTask)
    private readonly taskRepo: Repository<HealthTask>,
  ) {}

  async filter(options: TaskFilterOptions, page: number = 1, limit: number = 10): Promise<{ data: HealthTask[], total: number }> {
    const where: FindOptionsWhere<HealthTask> = {};

    if (options.status) where.status = options.status;
    if (options.category) where.category = options.category;
    if (options.isActive !== undefined) where.isActive = options.isActive;
    if (options.createdBy) where.createdBy = options.createdBy;

    const qb = this.taskRepo.createQueryBuilder('task').where(where);

    if (options.dateFrom && options.dateTo) {
      qb.andWhere('task.createdAt BETWEEN :from AND :to', {
        from: options.dateFrom,
        to: options.dateTo,
      });
    } else if (options.dateFrom) {
      qb.andWhere('task.createdAt >= :from', { from: options.dateFrom });
    } else if (options.dateTo) {
      qb.andWhere('task.createdAt <= :to', { to: options.dateTo });
    }

    // Optimization (#512): Field projection
    qb.select([
      'task.id',
      'task.title',
      'task.category',
      'task.status',
      'task.xlmReward',
      'task.createdAt',
    ]);

    // Pagination (#512)
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.orderBy('task.createdAt', 'DESC').getManyAndCount();
    return { data, total };
  }

  savePreset(name: string, ownerId: string, filters: TaskFilterOptions): FilterPreset {
    const key = `${ownerId}:${name}`;
    const preset: FilterPreset = { name, ownerId, filters, createdAt: new Date() };
    this.presets.set(key, preset);
    return preset;
  }

  getPreset(name: string, ownerId: string): FilterPreset | null {
    return this.presets.get(`${ownerId}:${name}`) ?? null;
  }

  listPresets(ownerId: string): FilterPreset[] {
    return Array.from(this.presets.values()).filter((p) => p.ownerId === ownerId);
  }

  deletePreset(name: string, ownerId: string): boolean {
    return this.presets.delete(`${ownerId}:${name}`);
  }

  async filterWithPreset(presetName: string, ownerId: string, page: number = 1, limit: number = 10): Promise<{ data: HealthTask[], total: number }> {
    const preset = this.getPreset(presetName, ownerId);
    if (!preset) return { data: [], total: 0 };
    return this.filter(preset.filters, page, limit);
  }
}
