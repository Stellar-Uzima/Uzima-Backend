import { Processor, Process } from '@nestjs/bull';
import { Logger, Injectable } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users.service';
import { NotificationService } from '../../../notifications/services/notification.service';
import { StorageService } from '../../../storage/storage.service';
import { HealthTask } from '../../../tasks/entities/health-task.entity';
import { RewardTransaction } from '../../../rewards/entities/reward-transaction.entity';
import { Notification } from '../../../notifications/entities/notification.entity';
import { DATA_PROCESSING_QUEUE, DATA_EXPORT_JOB } from '../../../queue/queue.constants';

@Injectable()
@Processor(DATA_PROCESSING_QUEUE)
export class DataExportProcessor {
  private readonly logger = new Logger(DataExportProcessor.name);

  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(HealthTask)
    private readonly taskRepo: Repository<HealthTask>,
    @InjectRepository(RewardTransaction)
    private readonly rewardRepo: Repository<RewardTransaction>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly storageService: StorageService,
    private readonly notificationService: NotificationService,
  ) {}

  @Process(DATA_EXPORT_JOB)
  async handleDataExport(job: Job<{ userId: string }>): Promise<void> {
    const { userId } = job.data;
    this.logger.log(`Starting data export for user ${userId} (job ${job.id})`);

    try {
      const profile = await this.usersService.getProfile(userId);

      const tasks = await this.taskRepo.find({ where: { createdBy: userId } });
      const rewards = await this.rewardRepo.find({ where: { userId } });
      const notifications = await this.notificationRepo.find({ where: { userId } });

      const exportObj = {
        exportedAt: new Date().toISOString(),
        profile,
        tasks,
        rewards,
        notifications,
      };

      const json = JSON.stringify(exportObj, null, 2);
      const filename = `gdpr-export-${userId}-${Date.now()}.json`;

      // StorageService.uploadFile expects an object similar to multer file
      const fileKey = await this.storageService.uploadFile(
        { originalname: filename, buffer: Buffer.from(json), mimetype: 'application/json' } as any,
        'gdpr-exports',
      );

      const expiresIn = 24 * 3600; // 24 hours in seconds
      const downloadUrl = await this.storageService.getDownloadUrl(fileKey, expiresIn);

      await this.notificationService.sendEmail(userId, 'gdpr-export-ready', {
        downloadUrl,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      });

      await job.progress(100);
      this.logger.log(`Data export job ${job.id} completed for user ${userId}`);
    } catch (err) {
      this.logger.error(`Data export job ${job.id} failed for user ${userId}`, err as any?.stack || String(err));
      throw err;
    }
  }
}
