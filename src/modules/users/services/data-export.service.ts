import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';
import { TaskCompletion } from '../../../database/entities/task-completion.entity';
import { RewardTransaction } from '../../../rewards/entities/reward-transaction.entity';
import { Notification } from '../../../notifications/entities/notification.entity';
import { ReferralRecord } from '../../../referral/entities/referral-record.entity';
import { StorageService } from '../../../shared/storage/storage.service';
import { NotificationService } from '../../../notifications/services/notification.service';
import { QueueService } from '../../../shared/queue/queue.service';
import {
  DATA_PROCESSING_QUEUE,
  USER_DATA_EXPORT_JOB,
} from '../../../queue/queue.constants';

export interface DataExportJobPayload {
  userId: string;
  email?: string;
}

@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(TaskCompletion)
    private readonly completionRepo: Repository<TaskCompletion>,
    @InjectRepository(RewardTransaction)
    private readonly rewardRepo: Repository<RewardTransaction>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(ReferralRecord)
    private readonly referralRepo: Repository<ReferralRecord>,
    private readonly storageService: StorageService,
    private readonly notificationService: NotificationService,
    private readonly queueService: QueueService,
  ) {}

  async queueExport(userId: string): Promise<{ jobId: string; status: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const job = await this.queueService.addJob<DataExportJobPayload>(
      DATA_PROCESSING_QUEUE,
      USER_DATA_EXPORT_JOB,
      { userId, email: user.email ?? undefined },
    );

    return {
      jobId: String(job.id),
      status: 'queued',
    };
  }

  async processExport(payload: DataExportJobPayload): Promise<void> {
    const { userId } = payload;
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['referredBy'],
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found for export`);
    }

    const [tasks, rewards, notifications, referralsAsReferrer, referralsAsReferred] =
      await Promise.all([
        this.completionRepo.find({ where: { userId } }),
        this.rewardRepo.find({ where: { userId } }),
        this.notificationRepo.find({ where: { userId }, order: { createdAt: 'DESC' } }),
        this.referralRepo.find({
          where: { referrer: { id: userId } },
          relations: ['referred'],
        }),
        this.referralRepo.find({
          where: { referred: { id: userId } },
          relations: ['referrer'],
        }),
      ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        email: user.email,
        phoneNumber: user.phoneNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        country: user.country,
        preferredLanguage: user.preferredLanguage,
        walletAddress: user.walletAddress,
        stellarWalletAddress: user.stellarWalletAddress,
        referralCode: user.referralCode,
        referredById: user.referredBy?.id ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      tasks,
      rewards,
      notifications,
      referrals: {
        asReferrer: referralsAsReferrer,
        asReferred: referralsAsReferred,
      },
    };

    const { downloadToken } = await this.storageService.saveDataExport(
      userId,
      exportPayload,
    );

    const downloadUrl = this.storageService.buildDataExportDownloadUrl(
      downloadToken,
    );

    await this.notificationService.sendEmail(userId, 'data-export-ready', {
      downloadUrl,
      expiresInHours: 24,
    });

    this.logger.log(`Data export ready for user ${userId}`);
  }

  async readExportFile(downloadToken: string): Promise<{
    content: Buffer;
    userId: string;
    exportId: string;
  }> {
    const resolved =
      await this.storageService.resolveDataExportDownload(downloadToken);
    if (!resolved) {
      throw new NotFoundException('Export link is invalid or expired');
    }

    const { readFile } = await import('fs/promises');
    const content = await readFile(resolved.filePath);

    return {
      content,
      userId: resolved.userId,
      exportId: resolved.exportId,
    };
  }
}
