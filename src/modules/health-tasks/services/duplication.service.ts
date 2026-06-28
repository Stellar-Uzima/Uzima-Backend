import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { HealthTask } from '../../../tasks/entities/health-task.entity';

@Injectable()
export class DuplicationService {
  constructor(
    @InjectRepository(HealthTask)
    private readonly taskRepository: Repository<HealthTask>,
  ) {}

  async duplicateTask(id: string, overrides: any = {}) {
    const originalTask = await this.taskRepository.findOne({ where: { id } });
    if (!originalTask) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _, createdAt, deletedAt, ...rest } = originalTask;
    
    // Handle dueDate and settings which are in targetProfile
    const targetProfile = { ...originalTask.targetProfile };
    if (overrides.dueDate) {
      targetProfile.dueDate = overrides.dueDate;
      delete overrides.dueDate;
    }
    if (overrides.settings) {
      targetProfile.settings = { ...(targetProfile.settings || {}), ...overrides.settings };
      delete overrides.settings;
    }

    const duplicatedTask = this.taskRepository.create({
      ...rest,
      ...overrides,
      targetProfile,
      status: 'draft',
      title: overrides.title || `${originalTask.title} (Copy)`,
    });

    return this.taskRepository.save(duplicatedTask);
  }

  async bulkDuplicate(ids: string[], commonOverrides: any = {}) {
    const tasks = await this.taskRepository.find({ where: { id: In(ids) } });
    const duplicates = tasks.map(task => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _, createdAt, deletedAt, ...rest } = task;
      
      const targetProfile = { ...task.targetProfile };
      if (commonOverrides.dueDate) {
        targetProfile.dueDate = commonOverrides.dueDate;
      }

      return this.taskRepository.create({
        ...rest,
        ...commonOverrides,
        targetProfile,
        status: 'draft',
        title: `${task.title} (Copy)`,
      });
    });

    return this.taskRepository.save(duplicates);
  }
}
