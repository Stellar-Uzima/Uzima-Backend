import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthTask } from '../../tasks/entities/health-task.entity';
import { UpdateHealthTaskDto } from '../../common/dtos/update-health-task.dto';
import { CreateHealthTaskDto } from '../../common/dtos/create-health-task.dto';
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

  async createTask(createTaskDto: CreateHealthTaskDto, userId: string): Promise<HealthTask> {
    const task = this.taskRepository.create({
      ...createTaskDto,
      createdBy: userId,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.taskRepository.save(task);
  }

  async getUserTasks(userId: string, options: {
    status?: string;
    category?: string;
    priority?: string;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  }): Promise<{
    tasks: HealthTask[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    stats: {
      total: number;
      completed: number;
      pending: number;
      inProgress: number;
    };
  }> {
    const queryBuilder = this.taskRepository
      .createQueryBuilder('task')
      .where('task.createdBy = :userId', { userId });

    // Apply filters
    if (options.status) {
      queryBuilder.andWhere('task.status = :status', { status: options.status });
    }

    if (options.category) {
      queryBuilder.andWhere('task.category = :category', { category: options.category });
    }

    if (options.priority) {
      queryBuilder.andWhere('task.priority = :priority', { priority: options.priority });
    }

    if (options.startDate) {
      queryBuilder.andWhere('task.createdAt >= :startDate', { startDate: options.startDate });
    }

    if (options.endDate) {
      queryBuilder.andWhere('task.createdAt <= :endDate', { endDate: options.endDate });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply sorting
    const sortField = options.sortBy === 'createdAt' ? 'task.createdAt' : 
                     options.sortBy === 'dueDate' ? 'task.dueDate' :
                     options.sortBy === 'title' ? 'task.title' : 'task.createdAt';
    
    queryBuilder.orderBy(sortField, options.sortOrder);

    // Apply pagination
    const offset = (options.page - 1) * options.limit;
    queryBuilder.skip(offset).take(options.limit);

    const tasks = await queryBuilder.getMany();

    // Get completion stats
    const statsQuery = this.taskRepository
      .createQueryBuilder('task')
      .select('task.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('task.createdBy = :userId', { userId });

    const statsResult = await statsQuery.groupBy('task.status').getRawMany();
    const stats = statsResult.reduce((acc: any, item: any) => {
      acc[item.status] = parseInt(item.count, 10);
      return acc;
    }, { total: 0, completed: 0, pending: 0, inProgress: 0 });

    stats.total = total;

    return {
      tasks,
      total,
      page: options.page,
      limit: options.limit,
      totalPages: Math.ceil(total / options.limit),
      stats,
    };
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
