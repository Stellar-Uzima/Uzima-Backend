import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthTask } from '../../tasks/entities/health-task.entity';
import { UpdateHealthTaskDto } from '../../common/dtos/update-health-task.dto';
import { CreateHealthTaskDto } from '../../common/dtos/create-health-task.dto';
import {
  PriorityService,
  PrioritizableTask,
} from './services/priority.service';
import { ActivityLogService } from './services/activity-log.service';
import { TaskCategory } from '../../database/entities/task-category.entity';
import { TaskTag } from '../../database/entities/task-tag.entity';

@Injectable()
export class HealthTasksService {
  constructor(
    @InjectRepository(HealthTask)
    private readonly taskRepository: Repository<HealthTask>,
    @InjectRepository(TaskCategory)
    private readonly categoryRepository: Repository<TaskCategory>,
    @InjectRepository(TaskTag)
    private readonly tagRepository: Repository<TaskTag>,
    private readonly priorityService: PriorityService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async findOne(id: string): Promise<HealthTask | null> {
    return this.taskRepository.findOne({
      where: { id },
      relations: ['category', 'tags'],
    });
  }

  async create(dto: CreateHealthTaskDto): Promise<HealthTask> {
    const task = this.taskRepository.create({
      title: dto.title,
      description: dto.description,
      dueDate: dto.dueDate,
      priority: dto.priority,
      frequency: dto.frequency,
    } as unknown as HealthTask);

    if (dto.categoryId) {
      const category = await this.categoryRepository.findOne({
        where: { id: dto.categoryId },
      });
      if (category) {
        task.categoryId = dto.categoryId;
        task.category = category;
      }
    }

    if (dto.tagIds && dto.tagIds.length > 0) {
      const tags = await this.tagRepository.findByIds(dto.tagIds);
      task.tags = tags;
    }

    return this.taskRepository.save(task);
  }

  async update(
    id: string,
    dto: UpdateHealthTaskDto,
    userId: string = 'system',
  ): Promise<HealthTask> {
    const task = await this.findOne(id);
    if (!task) throw new NotFoundException('Task not found');

    const originalTask = { ...task, targetProfile: { ...(task.targetProfile ?? {}) } };

    const allowed = [
      'title',
      'description',
      'categoryId',
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

    // Handle category update
    if (dto.categoryId !== undefined) {
      if (dto.categoryId) {
        const category = await this.categoryRepository.findOne({
          where: { id: dto.categoryId },
        });
        if (category) {
          task.categoryId = dto.categoryId;
          task.category = category;
        } else {
          task.categoryId = null;
          task.category = null;
        }
      } else {
        task.categoryId = null;
        task.category = null;
      }
    }

    // Handle tags update
    if (dto.tagIds !== undefined) {
      if (dto.tagIds && dto.tagIds.length > 0) {
        const tags = await this.tagRepository.findByIds(dto.tagIds);
        task.tags = tags;
      } else {
        task.tags = [];
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

    const savedTask = await this.taskRepository.save(task);
    const changeDetails = this.buildTaskChangeDetails(originalTask, dto, resolvedPriority, normalizedDueDate);

    if (changeDetails.length > 0) {
      await this.activityLogService.logTaskChange(id, userId, 'task.updated', {
        changes: changeDetails,
      });
    }

    return savedTask;
  }

  async remove(id: string, userId: string): Promise<void> {
    const task = await this.taskRepository.findOne({ where: { id } });

    if (!task) {
      throw new NotFoundException(`Health task with ID ${id} not found`);
    }

    if (task.createdBy !== userId) {
      throw new ForbiddenException('You do not have permission to delete this task');
    }

    await this.taskRepository.manager
      .createQueryBuilder()
      .delete()
      .from('reminders')
      .where('healthTaskId = :id', { id })
      .execute();

    await this.taskRepository.softDelete(id);
  }

  async getTaskActivity(taskId: string): Promise<import('../../../database/entities/task-activity.entity').TaskActivity[]> {
    return this.activityLogService.getActivityHistory(taskId);
  }

  private buildTaskChangeDetails(
    task: HealthTask,
    dto: UpdateHealthTaskDto,
    resolvedPriority: string,
    normalizedDueDate: string | null,
  ): Array<{ field: string; before: unknown; after: unknown }> {
    const changeDetails: Array<{ field: string; before: unknown; after: unknown }> = [];
    const fields = [
      'title',
      'description',
      'category',
      'status',
      'xlmReward',
      'isActive',
    ];

    for (const field of fields) {
      const before = (task as any)[field];
      const after = (dto as any)[field];
      if (after !== undefined && !this.valuesAreEqual(before, after)) {
        changeDetails.push({ field, before, after });
      }
    }

    const oldPriority = (task.targetProfile ?? {}).priority;
    const oldDueDate = (task.targetProfile ?? {}).dueDate ?? null;
    if (!this.valuesAreEqual(oldPriority, resolvedPriority)) {
      changeDetails.push({ field: 'priority', before: oldPriority, after: resolvedPriority });
    }
    if (!this.valuesAreEqual(oldDueDate, normalizedDueDate)) {
      changeDetails.push({ field: 'dueDate', before: oldDueDate, after: normalizedDueDate });
    }

    return changeDetails;
  }

  private valuesAreEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
      return true;
    }

    if (typeof a === 'object' && typeof b === 'object') {
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch {
        return false;
      }
    }

    return false;
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