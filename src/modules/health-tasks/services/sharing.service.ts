import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskShare, SharePermission } from '../../../database/entities/task-share.entity';
import { HealthTask } from '../../../entities/health-task.entity';

@Injectable()
export class SharingService {
  constructor(
    @InjectRepository(TaskShare)
    private readonly shareRepository: Repository<TaskShare>,
    @InjectRepository(HealthTask)
    private readonly taskRepository: Repository<HealthTask>,
  ) {}

  async shareTask(
    taskId: string,
    sharedById: string,
    sharedWithId: string,
    permission: SharePermission = SharePermission.VIEW,
  ): Promise<TaskShare> {
    // Check if task exists and belongs to sharer
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    if (task.userId !== sharedById) {
      throw new ForbiddenException('You can only share your own tasks');
    }

    if (sharedById === sharedWithId) {
      throw new BadRequestException('You cannot share a task with yourself');
    }

    // Check if already shared
    let share = await this.shareRepository.findOne({
      where: { taskId, sharedWithId },
    });

    if (share) {
      share.permission = permission;
    } else {
      share = this.shareRepository.create({
        taskId,
        sharedById,
        sharedWithId,
        permission,
      });
    }

    return this.shareRepository.save(share);
  }

  async revokeShare(taskId: string, sharedById: string, sharedWithId: string): Promise<void> {
    const share = await this.shareRepository.findOne({
      where: { taskId, sharedWithId },
    });

    if (!share) {
      throw new NotFoundException('Share not found');
    }

    if (share.sharedById !== sharedById) {
      throw new ForbiddenException('You can only revoke shares you created');
    }

    await this.shareRepository.remove(share);
  }

  async getSharedTasksForUser(userId: string): Promise<HealthTask[]> {
    const shares = await this.shareRepository.find({
      where: { sharedWithId: userId },
      relations: ['task', 'sharedBy'],
    });

    return shares.map(share => share.task);
  }

  async getTaskShares(taskId: string, userId: string): Promise<TaskShare[]> {
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    if (task.userId !== userId) {
      throw new ForbiddenException('You can only view shares for your own tasks');
    }

    return this.shareRepository.find({
      where: { taskId },
      relations: ['sharedWith'],
    });
  }

  async hasPermission(taskId: string, userId: string, permission: SharePermission): Promise<boolean> {
    // Owner always has permission
    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (task && task.userId === userId) {
      return true;
    }

    const share = await this.shareRepository.findOne({
      where: { taskId, sharedWithId: userId },
    });

    if (!share) return false;

    if (permission === SharePermission.VIEW) return true;
    
    // For EDIT permission, check if share is EDIT
    return share.permission === SharePermission.EDIT;
  }
}
