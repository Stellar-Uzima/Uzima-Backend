import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TaskCompletion,
  TaskCompletionStatus,
} from '../entities/task-completion.entity';
import { HealthTask } from '../entities/health-task.entity';
import { CompleteTaskDto, ProofType } from './dto/complete-task.dto';
import {
  REWARD_QUEUE,
  PROOF_VERIFICATION_QUEUE,
  REWARD_DISTRIBUTION_JOB,
} from '../../queue/queue.constants';

// Estimated queue processing time in milliseconds
const ESTIMATED_QUEUE_DELAY_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class TaskCompletionService {
  constructor(
    @InjectRepository(TaskCompletion)
    private completionRepo: Repository<TaskCompletion>,
    @InjectRepository(HealthTask)
    private taskRepo: Repository<HealthTask>,
    @InjectQueue(REWARD_QUEUE)
    private rewardQueue: Queue,
    @InjectQueue(PROOF_VERIFICATION_QUEUE)
    private proofVerificationQueue: Queue,
    private eventEmitter: EventEmitter2,
  ) {}

  async completeTask(userId: string, dto: CompleteTaskDto) {
    // 1. Validate task exists
    const task = await this.taskRepo.findOne({ where: { id: dto.taskId } });
    if (!task) throw new NotFoundException(`Task #${dto.taskId} not found`);

    // 2. PHOTO proof type requires proofUrl
    if (dto.proofType === ProofType.PHOTO && !dto.proofUrl) {
      throw new BadRequestException('Photo proof type requires a proofUrl');
    }

    // 3. 24-hour duplicate check via QueryBuilder
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await this.completionRepo
      .createQueryBuilder('c')
      .where('c.userId = :userId', { userId })
      .andWhere('c.taskId = :taskId', { taskId: dto.taskId })
      .andWhere('c.completedAt > :yesterday', { yesterday })
      .getOne();

    if (existing) {
      const nextAvailableAt = new Date(
        existing.completedAt.getTime() + 24 * 60 * 60 * 1000,
      );
      throw new ConflictException({
        message: 'Task already completed within the last 24 hours',
        nextAvailableAt,
      });
    }

    // 4. Persist the completion record
    const initialStatus =
      dto.proofType === ProofType.SELF_REPORT
        ? TaskCompletionStatus.VERIFIED
        : TaskCompletionStatus.PENDING;

    const completion = this.completionRepo.create({
      user: { id: userId } as any,
      task: { id: dto.taskId } as any,
      proofUrl: dto.proofUrl ?? null,
      xlmRewarded: Number(task.xlmReward),
      status: initialStatus,
    });
    const saved = await this.completionRepo.save(completion);

    // 5. Handle verification and events
    if (dto.proofType === ProofType.SELF_REPORT) {
      // Self-report goes straight to verified
      this.eventEmitter.emit('task.verified', {
        completionId: saved.id,
        userId,
        taskId: dto.taskId,
        xlmAmount: Number(task.xlmReward),
      });
    } else if (dto.proofType === ProofType.PHOTO) {
      // Queue proof verification
      await this.proofVerificationQueue.add(
        'verify-proof',
        { completionId: saved.id },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );

      this.eventEmitter.emit('task.completed', {
        completionId: saved.id,
        userId,
        taskId: dto.taskId,
        xlmAmount: Number(task.xlmReward),
      });
    }

    // 6. Enqueue XLM reward distribution
    await this.rewardQueue.add(REWARD_DISTRIBUTION_JOB, {
      completionId: saved.id,
      userId,
      xlmAmount: Number(task.xlmReward),
    });

    // 7. Return response with estimated XLM arrival time
    const estimatedXlmArrival = new Date(Date.now() + ESTIMATED_QUEUE_DELAY_MS);

    return {
      id: saved.id,
      taskId: dto.taskId,
      status: saved.status,
      xlmRewarded: saved.xlmRewarded,
      completedAt: saved.completedAt,
      estimatedXlmArrival,
    };
  }

  async getUserCompletions(userId: string) {
    return this.completionRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.task', 'task')
      .where('c.userId = :userId', { userId })
      .orderBy('c.completedAt', 'DESC')
      .getMany();
  }
}
