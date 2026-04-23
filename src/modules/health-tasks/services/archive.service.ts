import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthTask } from '../../../tasks/entities/health-task.entity';

export type AutoArchiveConfig = {
  enabled: boolean;
  olderThanDays: number;
};

@Injectable()
export class ArchiveService {
  private autoArchiveConfig: AutoArchiveConfig = {
    enabled: true,
    olderThanDays: 30,
  };

  constructor(
    @InjectRepository(HealthTask)
    private readonly taskRepository: Repository<HealthTask>,
  ) {}

  async archiveTask(taskId: string, archivedBy?: string): Promise<HealthTask> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.status !== 'completed') {
      throw new BadRequestException('Only completed tasks can be archived');
    }

    const archiveInfo = this.getArchiveInfo(task);
    if (archiveInfo.isArchived) {
      return task;
    }

    task.targetProfile = {
      ...(task.targetProfile ?? {}),
      archive: {
        isArchived: true,
        archivedAt: new Date().toISOString(),
        archivedBy: archivedBy ?? null,
      },
    };

    return this.taskRepository.save(task);
  }

  async getArchivedTasks(): Promise<HealthTask[]> {
    const completedTasks = await this.taskRepository.find({
      where: { status: 'completed' },
      order: { createdAt: 'DESC' },
    });

    return completedTasks.filter((task) => this.getArchiveInfo(task).isArchived);
  }

  async restoreTask(taskId: string, restoredBy?: string): Promise<HealthTask> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const archiveInfo = this.getArchiveInfo(task);
    if (!archiveInfo.isArchived) {
      throw new BadRequestException('Task is not archived');
    }

    task.targetProfile = {
      ...(task.targetProfile ?? {}),
      archive: {
        ...archiveInfo,
        isArchived: false,
        restoredAt: new Date().toISOString(),
        restoredBy: restoredBy ?? null,
      },
    };

    return this.taskRepository.save(task);
  }

  getAutoArchiveConfig(): AutoArchiveConfig {
    return this.autoArchiveConfig;
  }

  updateAutoArchiveConfig(
    partialConfig: Partial<AutoArchiveConfig>,
  ): AutoArchiveConfig {
    const nextConfig = {
      ...this.autoArchiveConfig,
      ...partialConfig,
    };

    if (nextConfig.olderThanDays < 0) {
      throw new BadRequestException('olderThanDays must be greater than or equal to 0');
    }

    this.autoArchiveConfig = nextConfig;
    return this.autoArchiveConfig;
  }

  async autoArchiveOldCompletedTasks(now: Date = new Date()): Promise<number> {
    if (!this.autoArchiveConfig.enabled) {
      return 0;
    }

    const completedTasks = await this.taskRepository.find({
      where: { status: 'completed' },
      order: { createdAt: 'ASC' },
    });

    const thresholdTime =
      now.getTime() - this.autoArchiveConfig.olderThanDays * 24 * 60 * 60 * 1000;

    const candidates = completedTasks.filter((task) => {
      const archiveInfo = this.getArchiveInfo(task);
      if (archiveInfo.isArchived) {
        return false;
      }

      const completedAt = this.getCompletedTimestamp(task);
      return completedAt !== null && completedAt <= thresholdTime;
    });

    for (const task of candidates) {
      task.targetProfile = {
        ...(task.targetProfile ?? {}),
        archive: {
          isArchived: true,
          archivedAt: now.toISOString(),
          archivedBy: 'auto-archive',
        },
      };
      await this.taskRepository.save(task);
    }

    return candidates.length;
  }

  private getArchiveInfo(task: HealthTask): Record<string, any> & { isArchived: boolean } {
    const archiveData = (task.targetProfile ?? {}).archive;
    return {
      ...(archiveData ?? {}),
      isArchived: Boolean(archiveData?.isArchived),
    };
  }

  private getCompletedTimestamp(task: HealthTask): number | null {
    const completedAtValue = (task.targetProfile ?? {}).completedAt;
    if (!completedAtValue) {
      return task.createdAt ? task.createdAt.getTime() : null;
    }
    const parsed = new Date(completedAtValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
  }
}
