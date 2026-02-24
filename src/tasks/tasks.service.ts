import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthTask } from './entities/health-task.entity';
import { TaskStatus } from './enums/task-status.enum';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { Role } from '../auth/enums/role.enum';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(HealthTask)
    private readonly healthTaskRepository: Repository<HealthTask>,
  ) {}

  async create(createTaskDto: CreateTaskDto, userId: number): Promise<HealthTask> {
    const task = this.healthTaskRepository.create({
      ...createTaskDto,
      createdBy: userId,
      status: TaskStatus.DRAFT,
    });

    return await this.healthTaskRepository.save(task);
  }

  async findAll(listTasksDto: ListTasksDto) {
    const { page, limit, categoryId } = listTasksDto;
    
    const query = this.healthTaskRepository
      .createQueryBuilder('task')
      .where('task.status = :status', { status: TaskStatus.ACTIVE })
      .leftJoinAndSelect('task.creator', 'creator')
      .orderBy('task.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (categoryId) {
      query.andWhere('task.categoryId = :categoryId', { categoryId });
    }

    const [tasks, total] = await query.getManyAndCount();

    return {
      data: tasks,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number): Promise<HealthTask> {
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
    id: number,
    updateTaskDto: UpdateTaskDto,
    userId: number,
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
    return await this.healthTaskRepository.save(task);
  }

  async remove(id: number): Promise<void> {
    const task = await this.findOne(id);
    
    // Soft delete by setting status to ARCHIVED
    task.status = TaskStatus.ARCHIVED;
    await this.healthTaskRepository.save(task);
  }
}
