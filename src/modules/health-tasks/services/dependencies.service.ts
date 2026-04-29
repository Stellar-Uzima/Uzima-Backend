import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthTask } from '../../../tasks/entities/health-task.entity';

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: Date;
}

@Injectable()
export class TaskDependenciesService {
  private readonly dependencies: TaskDependency[] = [];
  private counter = 0;

  constructor(
    @InjectRepository(HealthTask)
    private readonly taskRepo: Repository<HealthTask>,
  ) {}

  async addDependency(taskId: string, dependsOnTaskId: string): Promise<TaskDependency> {
    if (taskId === dependsOnTaskId) {
      throw new BadRequestException('A task cannot depend on itself');
    }

    const [task, dep] = await Promise.all([
      this.taskRepo.findOne({ where: { id: taskId } }),
      this.taskRepo.findOne({ where: { id: dependsOnTaskId } }),
    ]);

    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
    if (!dep) throw new NotFoundException(`Dependency task ${dependsOnTaskId} not found`);

    if (this.wouldCreateCycle(taskId, dependsOnTaskId)) {
      throw new BadRequestException('Adding this dependency would create a circular chain');
    }

    const existing = this.dependencies.find(
      (d) => d.taskId === taskId && d.dependsOnTaskId === dependsOnTaskId,
    );
    if (existing) return existing;

    const record: TaskDependency = {
      id: `dep_${++this.counter}`,
      taskId,
      dependsOnTaskId,
      createdAt: new Date(),
    };

    this.dependencies.push(record);
    return record;
  }

  removeDependency(taskId: string, dependsOnTaskId: string): boolean {
    const idx = this.dependencies.findIndex(
      (d) => d.taskId === taskId && d.dependsOnTaskId === dependsOnTaskId,
    );
    if (idx === -1) return false;
    this.dependencies.splice(idx, 1);
    return true;
  }

  getDependencies(taskId: string): TaskDependency[] {
    return this.dependencies.filter((d) => d.taskId === taskId);
  }

  getDependents(taskId: string): TaskDependency[] {
    return this.dependencies.filter((d) => d.dependsOnTaskId === taskId);
  }

  async canStart(taskId: string): Promise<{ allowed: boolean; blockedBy: string[] }> {
    const deps = this.getDependencies(taskId);
    if (deps.length === 0) return { allowed: true, blockedBy: [] };

    const blockedBy: string[] = [];

    for (const dep of deps) {
      const depTask = await this.taskRepo.findOne({ where: { id: dep.dependsOnTaskId } });
      if (!depTask || depTask.status !== 'completed') {
        blockedBy.push(dep.dependsOnTaskId);
      }
    }

    return { allowed: blockedBy.length === 0, blockedBy };
  }

  async onTaskCompleted(completedTaskId: string): Promise<string[]> {
    const unlocked: string[] = [];

    const dependents = this.getDependents(completedTaskId);
    for (const dep of dependents) {
      const check = await this.canStart(dep.taskId);
      if (check.allowed) {
        unlocked.push(dep.taskId);
      }
    }

    return unlocked;
  }

  private wouldCreateCycle(taskId: string, dependsOnTaskId: string): boolean {
    const visited = new Set<string>();
    const stack = [dependsOnTaskId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const upstream = this.dependencies
        .filter((d) => d.taskId === current)
        .map((d) => d.dependsOnTaskId);

      stack.push(...upstream);
    }

    return false;
  }
}
