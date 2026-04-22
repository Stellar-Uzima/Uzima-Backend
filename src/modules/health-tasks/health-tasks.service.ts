import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthTask } from '../../tasks/entities/health-task.entity';
import { UpdateHealthTaskDto } from '../../common/dtos/update-health-task.dto';

@Injectable()
export class HealthTasksService {
  constructor(
    @InjectRepository(HealthTask)
    private readonly taskRepository: Repository<HealthTask>,
  ) {}

  async findOne(id: string): Promise<HealthTask | null> {
    return this.taskRepository.findOne({ where: { id } });
  }

  async update(id: string, dto: UpdateHealthTaskDto): Promise<HealthTask> {
    const task = await this.findOne(id);
    if (!task) throw new NotFoundException('Task not found');

    // Apply allowed updates (exclude id and createdAt)
    const allowed = [
      'title',
      'description',
      'category',
      'status',
      'xlmReward',
      'targetProfile',
      'isActive',
    ];
    for (const key of Object.keys(dto)) {
      if (allowed.includes(key)) {
        (task as any)[key] = (dto as any)[key];
      }
    }

    return this.taskRepository.save(task);
  }
}
