import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PROOF_VERIFICATION_QUEUE } from '../../../queue/queue.constants';
import { ProofVerificationService } from './proof-verification.service';

@Processor(PROOF_VERIFICATION_QUEUE)
export class ProofVerificationProcessor extends WorkerHost {
  private readonly logger = new Logger(ProofVerificationProcessor.name);

  constructor(
    private readonly proofVerificationService: ProofVerificationService,
  ) {
    super();
  }

  async process(job: any): Promise<void> {
    const { completionId } = job.data;
    this.logger.log(Processing proof verification for completion );
    await this.proofVerificationService.verifyProof(completionId);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: any) {
    this.logger.log(Proof verification completed for job );
  }

  @OnWorkerEvent('failed')
  onFailed(job: any, err: Error) {
    this.logger.error(Proof verification failed for job : , (err as any)?.stack);
  }
}
