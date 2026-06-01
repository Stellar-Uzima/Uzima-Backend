import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthTask, TaskCategory } from './entities/health-task.entity';
import { TaskStatus } from './enums/task-status.enum';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { Role } from '../auth/enums/role.enum';
import { PaginatedResponseDto } from 'src/common/dto/paginated-response.dto';
import { QueueService } from '../shared/queue/queue.service';
import {
  NOTIFICATION_QUEUE,
  TASK_REMINDER_JOB,
  TASK_REMINDER_TEMPLATE,
} from '../queue/queue.constants';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(HealthTask)
    private readonly healthTaskRepository: Repository<HealthTask>,
    private readonly queueService: QueueService,
  ) {}

  getCategories(): Array<{ value: string; label: string }> {
    return Object.values(TaskCategory).map((value) => ({
      value,
      label: value.charAt(0).toUpperCase() + value.slice(1),
    }));
  /**
   * Enqueue a delayed notification job for a task's reminder.
   * No-op if reminderTime is null/undefined or already in the past.
   *
   * Uses a deterministic Bull jobId derived from `taskId` and the
   * reminder timestamp so repeated calls (e.g., service-side on create
   * and scheduler-side from the backfill cron) collapse to a single
   * queued job. If reminderTime changes, the jobId changes too, so the
   * new schedule does not collide with the old one.
   */
  async scheduleReminderJob(task: HealthTask): Promise<void> {
    if (!task.reminderTime) {
      return;
    }
    const remindAt = new Date(task.reminderTime).getTime();
    const delayMs = remindAt - Date.now();
    if (delayMs <= 0) {
      // Past reminder; don't enqueue
      return;
    }
    const jobId = `task-reminder:${task.id}:${remindAt}`;
    await this.queueService.addDelayedJob(
      NOTIFICATION_QUEUE,
      TASK_REMINDER_JOB,
      {
        template: TASK_REMINDER_TEMPLATE,
        taskId: task.id,
        userId: task.createdBy,
        taskTitle: task.title,
        remindAt: task.reminderTime,
      },
      delayMs,
      // Use Bull's native JobOptions shape (attempts/backoff) so the
      // options reach the underlying queue. QueueService.addDelayedJob
      // passes options through unchanged, unlike addJob which translates
      // maxRetries/backoffMs. The deterministic jobId makes Bull
      // deduplicate when the same reminder is enqueued more than once.
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  async create(
    createTaskDto: CreateTaskDto,
    userId: string,
  ): Promise<HealthTask> {
    const task = this.healthTaskRepository.create({
      ...createTaskDto,
      createdBy: userId,
      status: TaskStatus.DRAFT,
    });

    const saved = await this.healthTaskRepository.save(task);
    await this.scheduleReminderJob(saved);
    return saved;
  }

  async findAll(
    listTasksDto: ListTasksDto,
  ): Promise<PaginatedResponseDto<HealthTask>> {
    const { page, limit, categoryId } = listTasksDto;

    const query = this.healthTaskRepository
      .createQueryBuilder('task')
      .where('task.status = :status', { status: TaskStatus.ACTIVE })
      .andWhere('task.deletedAt IS NULL')
      .leftJoinAndSelect('task.creator', 'creator')
      .orderBy('task.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (categoryId) {
      query.andWhere('task.categoryId = :categoryId', { categoryId });
    }

    const [tasks, total] = await query.getManyAndCount();

    return new PaginatedResponseDto(tasks, total, page, limit);
  }

  async findOne(id: string): Promise<HealthTask> {
    const task = await this.healthTaskRepository.findOne({
      where: { id },
      relations: ['creator'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async update(
    id: string,
    updateTaskDto: UpdateTaskDto,
    userId: string,
    userRole: Role,
  ): Promise<HealthTask> {
    const task = await this.findOne(id);

    // Check ownership
    if (task.createdBy !== userId && userRole !== Role.ADMIN) {
      throw new ForbiddenException('You can only update your own tasks');
    }

    // Only admins can publish (set status to ACTIVE)
    if (updateTaskDto.status === TaskStatus.ACTIVE && userRole !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can publish tasks');
    }

    Object.assign(task, updateTaskDto);
    const saved = await this.healthTaskRepository.save(task);
    if (updateTaskDto.reminderTime !== undefined) {
      await this.scheduleReminderJob(saved);
    }
    return saved;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.healthTaskRepository.softDelete(id);
  }

  async restore(id: string): Promise<void> {
    await this.healthTaskRepository.restore(id);
  }
}
