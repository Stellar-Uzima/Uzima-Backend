import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PROOF_VERIFICATION_QUEUE } from '../../../queue/queue.constants';
import { ProofVerificationService } from './proof-verification.service';

@Processor(PROOF_VERIFICATION_QUEUE)
export class ProofVerificationProcessor {
  private readonly logger = new Logger(ProofVerificationProcessor.name);

  constructor(private proofVerificationService: ProofVerificationService) {}

  @Process()
  async process(job: Job<{ completionId: string }>): Promise<void> {
    const { completionId } = job.data;

    this.logger.log(
      `Processing proof verification for completion ${completionId}`,
    );

    await this.proofVerificationService.verifyProof(completionId);
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    this.logger.log(`Proof verification completed for job ${job.id}`);
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Proof verification failed for job ${job.id}: ${err.message}`,
    );
  }
}
