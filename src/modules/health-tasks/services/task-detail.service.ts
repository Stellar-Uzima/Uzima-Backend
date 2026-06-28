import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthTask } from '../../../tasks/entities/health-task.entity';

export interface TaskCompletionRecord {
  completedAt: Date;
  completedBy: string;
  notes?: string;
}

export interface TaskReminder {
  remindAt: Date;
  message: string;
  sent: boolean;
}

export interface TaskDetailResponse {
  task: HealthTask;
  completionHistory: TaskCompletionRecord[];
  reminders: TaskReminder[];
}

@Injectable()
export class TaskDetailService {
  private readonly completions = new Map<string, TaskCompletionRecord[]>();
  private readonly reminders = new Map<string, TaskReminder[]>();

  constructor(
    @InjectRepository(HealthTask)
    private readonly taskRepo: Repository<HealthTask>,
  ) {}

  async getDetail(
    taskId: string,
    requesterId: string,
    requesterRole?: string,
  ): Promise<TaskDetailResponse> {
    const task = await this.taskRepo.findOne({ where: { id: taskId } });

    if (!task) {
      throw new NotFoundException(`Health task ${taskId} not found`);
    }

    const isAdmin = requesterRole === 'ADMIN';
    const isCreator = task.createdBy === requesterId;

    if (!isAdmin && !isCreator && !task.isActive) {
      throw new ForbiddenException('You do not have access to this task');
    }

    return {
      task,
      completionHistory: this.completions.get(taskId) ?? [],
      reminders: this.reminders.get(taskId) ?? [],
    };
  }

  recordCompletion(taskId: string, userId: string, notes?: string): TaskCompletionRecord {
    const record: TaskCompletionRecord = {
      completedAt: new Date(),
      completedBy: userId,
      notes,
    };

    const existing = this.completions.get(taskId) ?? [];
    this.completions.set(taskId, [...existing, record]);
    return record;
  }

  addReminder(taskId: string, remindAt: Date, message: string): TaskReminder {
    const reminder: TaskReminder = { remindAt, message, sent: false };
    const existing = this.reminders.get(taskId) ?? [];
    this.reminders.set(taskId, [...existing, reminder]);
    return reminder;
  }
}
