import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TaskCompletion, TaskCompletionStatus } from '../../entities/task-completion.entity';
import { StorageService } from '../../../storage/storage.service';

@Injectable()
export class ProofVerificationService {
  private readonly logger = new Logger(ProofVerificationService.name);

  constructor(
    @InjectRepository(TaskCompletion)
    private taskCompletionRepo: Repository<TaskCompletion>,
    private storageService: StorageService,
    private eventEmitter: EventEmitter2,
  ) {}

  async verifyProof(completionId: string): Promise<void> {
    const completion = await this.taskCompletionRepo.findOne({
      where: { id: completionId },
      relations: ['user', 'task'],
    });

    if (!completion) {
      this.logger.error(`Task completion ${completionId} not found`);
      return;
    }

    if (!completion.proofUrl) {
      this.logger.error(`No proof URL for completion ${completionId}`);
      await this.rejectCompletion(completion, 'No proof URL provided');
      return;
    }

    try {
      // Extract file key from proofUrl (assuming it's an S3 URL)
      const fileKey = this.extractFileKeyFromUrl(completion.proofUrl);

      const fileInfo = await this.storageService.verifyFileExists(fileKey);

      if (!fileInfo.exists) {
        await this.rejectCompletion(completion, 'Proof file not found in storage');
        return;
      }

      // Check content type
      if (!fileInfo.contentType || !['image/jpeg', 'image/png'].includes(fileInfo.contentType)) {
        await this.rejectCompletion(completion, 'Invalid file type. Only JPEG and PNG images are allowed');
        return;
      }

      // Check file size (5MB limit)
      if (fileInfo.size && fileInfo.size > 5 * 1024 * 1024) {
        await this.rejectCompletion(completion, 'File size exceeds 5MB limit');
        return;
      }

      // Verification passed
      await this.verifyCompletion(completion);

    } catch (error) {
      this.logger.error(`Error verifying proof for completion ${completionId}`, error);
      await this.rejectCompletion(completion, 'Verification failed due to system error');
    }
  }

  private async verifyCompletion(completion: TaskCompletion): Promise<void> {
    completion.status = TaskCompletionStatus.VERIFIED;
    await this.taskCompletionRepo.save(completion);

    this.logger.log(`Verified task completion ${completion.id}`);
    this.eventEmitter.emit('task.verified', {
      completionId: completion.id,
      userId: completion.user.id,
      taskId: completion.task.id,
      xlmAmount: completion.xlmRewarded,
    });
  }

  private async rejectCompletion(completion: TaskCompletion, reason: string): Promise<void> {
    completion.status = TaskCompletionStatus.REJECTED;
    completion.rejectionReason = reason;
    await this.taskCompletionRepo.save(completion);

    this.logger.log(`Rejected task completion ${completion.id}: ${reason}`);
    this.eventEmitter.emit('task.rejected', {
      completionId: completion.id,
      userId: completion.user.id,
      taskId: completion.task.id,
      reason,
    });
  }

  private extractFileKeyFromUrl(url: string): string {
    // Assuming the proofUrl is something like https://bucket.s3.amazonaws.com/proofs/user/task/timestamp
    // Extract the key after the bucket
    const urlParts = url.split('/');
    const keyIndex = urlParts.findIndex(part => part.includes('proofs'));
    return urlParts.slice(keyIndex).join('/');
  }
}