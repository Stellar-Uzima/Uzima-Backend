import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthTask } from '../../tasks/entities/health-task.entity';
import { UpdateHealthTaskDto } from '../../common/dtos/update-health-task.dto';
import {
  PriorityService,
  PrioritizableTask,
} from './services/priority.service';

@Injectable()
export class HealthTasksService {
  constructor(
    @InjectRepository(HealthTask)
    private readonly taskRepository: Repository<HealthTask>,
    private readonly priorityService: PriorityService,
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

    const existingPriorityData = this.getPrioritizableTask(task);
    const dueDateInput = dto.dueDate ?? existingPriorityData.dueDate;
    const resolvedPriority = this.priorityService.resolvePriority(
      dto.priority ?? existingPriorityData.priority,
      dueDateInput,
    );
    const normalizedDueDate = this.toIsoDateStringOrNull(dueDateInput);

    this.persistPriorityData(task, resolvedPriority, normalizedDueDate);

    const prioritizableTask = this.getPrioritizableTask(task);
    const alertMessage = this.priorityService.buildOverdueAlert(prioritizableTask);
    if (alertMessage) {
      const existingProfile = task.targetProfile ?? {};
      const priorityAlerts = Array.isArray((existingProfile as any).priorityAlerts)
        ? [...(existingProfile as any).priorityAlerts]
        : [];
      const alreadyPresent = priorityAlerts.some(
        (alert: any) => alert?.type === 'overdue' && alert?.message === alertMessage,
      );
      if (!alreadyPresent) {
        priorityAlerts.push({
          type: 'overdue',
          message: alertMessage,
          createdAt: new Date().toISOString(),
        });
      }
      task.targetProfile = {
        ...existingProfile,
        priorityAlerts,
      };
    }

    return this.taskRepository.save(task);
  }

  sortTasksByPriority(tasks: HealthTask[]): HealthTask[] {
    const prioritizedTasks = tasks.map((task) => {
      const priorityData = this.getPrioritizableTask(task);
      return {
        ...task,
        priority: this.priorityService.resolvePriority(
          priorityData.priority,
          priorityData.dueDate,
        ),
        dueDate: priorityData.dueDate,
      };
    });

    return this.priorityService.sortByPriority(
      prioritizedTasks as unknown as PrioritizableTask[],
    ) as HealthTask[];
  }

  getOverdueAlerts(tasks: HealthTask[]): string[] {
    return tasks
      .map((task) =>
        this.priorityService.buildOverdueAlert(this.getPrioritizableTask(task)),
      )
      .filter((alert): alert is string => Boolean(alert));
  }

  private getPrioritizableTask(task: HealthTask): PrioritizableTask {
    const taskTargetProfile = task.targetProfile ?? {};
    const persistedPriority = (taskTargetProfile as any).priority;
    const persistedDueDate = (taskTargetProfile as any).dueDate;

    return {
      id: task.id,
      title: task.title,
      priority: persistedPriority,
      dueDate: persistedDueDate,
    };
  }

  private persistPriorityData(
    task: HealthTask,
    priority: string,
    dueDate: string | null,
  ): void {
    const existingProfile = task.targetProfile ?? {};
    task.targetProfile = {
      ...existingProfile,
      priority,
      dueDate,
    };
  }

  private toIsoDateStringOrNull(value?: Date | string | null): string | null {
    if (!value) {
      return null;
    }
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString();
  }
}
