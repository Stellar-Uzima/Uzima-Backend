import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { DATA_PROCESSING_QUEUE, USER_DATA_EXPORT_JOB } from '../../../queue/queue.constants';
import {
  DataExportJobPayload,
  DataExportService,
} from '../services/data-export.service';

@Processor(DATA_PROCESSING_QUEUE)
export class DataExportProcessor {
  private readonly logger = new Logger(DataExportProcessor.name);

  constructor(private readonly dataExportService: DataExportService) {}

  @Process(USER_DATA_EXPORT_JOB)
  async handleUserDataExport(job: Job<DataExportJobPayload>) {
    this.logger.log(`Processing GDPR export job ${job.id} for user ${job.data.userId}`);
    await this.dataExportService.processExport(job.data);
  }
}
