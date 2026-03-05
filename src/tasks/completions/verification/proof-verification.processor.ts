import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PROOF_VERIFICATION_QUEUE } from '../../../queue/queue.constants';
import { ProofVerificationService } from './proof-verification.service';

@Processor(PROOF_VERIFICATION_QUEUE)
export class ProofVerificationProcessor extends WorkerHost {
  private readonly logger = new Logger(ProofVerificationProcessor.name);

  constructor(private proofVerificationService: ProofVerificationService) {
    super();
  }

  async process(job: Job<{ completionId: string }>): Promise<void> {
    const { completionId } = job.data;

    this.logger.log(`Processing proof verification for completion ${completionId}`);

    await this.proofVerificationService.verifyProof(completionId);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Proof verification completed for job ${job.id}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Proof verification failed for job ${job.id}: ${err.message}`);
  }
}