import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BackfillRun, BackfillRunStatus } from './entities/backfill-run.entity';

export type BackfillJob = (run: BackfillRun) => Promise<{ processed: number; failed?: number }>;

@Injectable()
export class BackfillService {
  private readonly jobs = new Map<string, BackfillJob>();

  constructor(@InjectRepository(BackfillRun) private readonly runs: Repository<BackfillRun>) {}

  register(jobKey: string, job: BackfillJob): void { this.jobs.set(jobKey, job); }

  async run(jobKey: string): Promise<BackfillRun> {
    const job = this.jobs.get(jobKey);
    if (!job) throw new Error(`Unknown backfill job: ${jobKey}`);
    const existing = await this.runs.findOne({ where: { jobKey } });
    if (existing?.status === BackfillRunStatus.COMPLETED) throw new ConflictException('Backfill already completed');
    const run = existing || await this.runs.save(this.runs.create({ jobKey, status: BackfillRunStatus.RUNNING }));
    try {
      const result = await job(run);
      run.processedCount = result.processed;
      run.failedCount = result.failed || 0;
      run.status = BackfillRunStatus.COMPLETED;
      run.completedAt = new Date();
    } catch (error) {
      run.status = BackfillRunStatus.FAILED;
      run.errorMessage = error instanceof Error ? error.message : String(error);
      run.completedAt = new Date();
    }
    return this.runs.save(run);
  }

  list(): Promise<BackfillRun[]> { return this.runs.find({ order: { startedAt: 'DESC' } }); }
}
