import { TaskCategory } from '../../../tasks/entities/health-task.entity';

export class CompletionRecordDto {
  completedAt: Date;
  completedBy: string;
  notes?: string;
}

export class ReminderDto {
  remindAt: Date;
  message: string;
  sent: boolean;
}

export class TaskDetailResponseDto {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  status: string;
  xlmReward: number;
  isActive: boolean;
  createdBy: string | null;
  targetProfile: Record<string, any>;
  createdAt: Date;
  completionHistory: CompletionRecordDto[];
  reminders: ReminderDto[];

  static fromEntity(
    task: {
      id: string;
      title: string;
      description: string;
      category: TaskCategory;
      status: string;
      xlmReward: number;
      isActive: boolean;
      createdBy: string | null;
      targetProfile: Record<string, any>;
      createdAt: Date;
    },
    completionHistory: CompletionRecordDto[] = [],
    reminders: ReminderDto[] = [],
  ): TaskDetailResponseDto {
    const dto = new TaskDetailResponseDto();
    dto.id = task.id;
    dto.title = task.title;
    dto.description = task.description;
    dto.category = task.category;
    dto.status = task.status;
    dto.xlmReward = task.xlmReward;
    dto.isActive = task.isActive;
    dto.createdBy = task.createdBy;
    dto.targetProfile = task.targetProfile;
    dto.createdAt = task.createdAt;
    dto.completionHistory = completionHistory;
    dto.reminders = reminders;
    return dto;
  }
}

export class GetHealthTaskParamDto {
  id: string;
}

export class HealthTaskNotFoundResponseDto {
  statusCode: number = 404;
  message: string = 'Health task not found';
  error: string = 'Not Found';
}

export class HealthTaskForbiddenResponseDto {
  statusCode: number = 403;
  message: string = 'You do not have permission to view this task';
  error: string = 'Forbidden';
}
