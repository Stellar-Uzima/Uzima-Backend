import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';
import { TaskCompletion } from '../../../tasks/entities/task-completion.entity';
import { RewardTransaction } from '../../../rewards/entities/reward-transaction.entity';
import { Notification } from '../../../notifications/entities/notification.entity';
import { ReferralRecord } from '../../../referral/entities/referral-record.entity';
import { StorageService } from '../../../shared/storage/storage.service';
import { NotificationService } from '../../../notifications/services/notification.service';
import { QueueService } from '../../../shared/queue/queue.service';
import { DATA_PROCESSING_QUEUE, USER_DATA_EXPORT_JOB } from '../../../queue/queue.constants';
import { Role } from '../../../modules/auth/enums/role.enum';
import { AuditService, AuditEventOptions } from '../../../audit/audit.service';
import { AuditAction, AuditResource } from '../../../audit/entities/audit-log.entity';

export interface DataExportRequester {
  kind: 'user' | 'service';
  userId: string;
  role?: Role;
  scopes?: string[];
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface DataExportJobPayload {
  userId: string;
  email?: string;
  requester?: DataExportRequester;
}

const EXPORT_SENSITIVE_SCOPE = 'exports:read-sensitive';
const EXPORT_SCOPE = 'exports:read';

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
    private readonly auditService: AuditService
  ) {}

  private isServiceAccountAuthorized(requester: DataExportRequester): boolean {
    if (requester.kind !== 'service') return false;
    const scopes = requester.scopes ?? [];
    return scopes.includes(EXPORT_SCOPE) || scopes.includes(EXPORT_SENSITIVE_SCOPE);
  }

  private canRequestExportFor(targetUserId: string, requester: DataExportRequester): boolean {
    if (requester.userId === targetUserId) return true;
    if (requester.role === Role.ADMIN) return true;
    if (this.isServiceAccountAuthorized(requester)) return true;
    return false;
  }

  private hasSensitiveAccess(requester: DataExportRequester | undefined): boolean {
    if (!requester) return false;
    if (requester.role === Role.ADMIN) return true;
    if (requester.kind === 'service' && (requester.scopes ?? []).includes(EXPORT_SENSITIVE_SCOPE)) {
      return true;
    }
    return false;
  }

  private isSelfExport(targetUserId: string, requester: DataExportRequester | undefined): boolean {
    return !!requester && requester.userId === targetUserId;
  }

  async queueExport(
    targetUserId: string,
    requester: DataExportRequester
  ): Promise<{ jobId: string; status: string }> {
    if (!this.canRequestExportFor(targetUserId, requester)) {
      throw new ForbiddenException('You are not authorized to request exports for this user');
    }

    const user = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const auditOptions: AuditEventOptions = {
      userId: requester.userId,
      userRole: requester.role,
      action: AuditAction.EXPORT,
      resourceType: AuditResource.USER,
      resourceId: targetUserId,
      resourceName: user.email ?? targetUserId,
      description: this.isSelfExport(targetUserId, requester)
        ? 'Requested own data export'
        : `Requested data export for user ${targetUserId} (${requester.kind} account)`,
      ipAddress: requester.ipAddress,
      userAgent: requester.userAgent,
      requestId: requester.requestId,
      isComplianceEvent: true,
      complianceCategory: 'DATA_EXPORT',
      isSensitive: !this.isSelfExport(targetUserId, requester),
      metadata: {
        requesterKind: requester.kind,
        scopes: requester.scopes,
        targetUserId,
      },
    };
    await this.auditService.logEvent(auditOptions);

    const job = await this.queueService.addJob<DataExportJobPayload>(
      DATA_PROCESSING_QUEUE,
      USER_DATA_EXPORT_JOB,
      { userId: targetUserId, email: user.email ?? undefined, requester }
    );

    return {
      jobId: String(job.id),
      status: 'queued',
    };
  }

  private redactIfNeeded<T extends Record<string, any>>(
    record: T,
    sensitiveFields: (keyof T)[],
    shouldRedact: boolean
  ): T {
    if (!shouldRedact) return record;
    const out = { ...record };
    for (const field of sensitiveFields) {
      if (out[field] !== undefined && out[field] !== null) {
        (out as any)[field] = '[REDACTED]';
      }
    }
    return out;
  }

  async processExport(payload: DataExportJobPayload): Promise<void> {
    const { userId, requester } = payload;
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['referredBy'],
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found for export`);
    }

    const isSelf = this.isSelfExport(userId, requester);
    const showSensitive = isSelf || this.hasSensitiveAccess(requester);

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

    const rawProfile = {
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
    };

    const profile = this.redactIfNeeded(
      rawProfile,
      ['phoneNumber', 'walletAddress', 'stellarWalletAddress', 'referralCode'],
      !showSensitive
    );

    const safeNotifications = notifications.map((n) =>
      this.redactIfNeeded(n as any, ['payload', 'body'], !showSensitive)
    );

    const safeReferralsAsReferrer = referralsAsReferrer.map((r) =>
      this.redactIfNeeded(r as any, ['referredRewardAmount'], !showSensitive)
    );
    const safeReferralsAsReferred = referralsAsReferred.map((r) =>
      this.redactIfNeeded(r as any, ['referredRewardAmount'], !showSensitive)
    );

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      generatedFor: isSelf ? 'self' : (requester?.kind ?? 'unknown'),
      redacted: !showSensitive,
      profile,
      tasks,
      rewards,
      notifications: safeNotifications,
      referrals: {
        asReferrer: safeReferralsAsReferrer,
        asReferred: safeReferralsAsReferred,
      },
    };

    const { downloadToken } = await this.storageService.saveDataExport(userId, exportPayload);

    const downloadUrl = this.storageService.buildDataExportDownloadUrl(downloadToken);

    if (isSelf) {
      await this.notificationService.sendEmail(userId, 'data-export-ready', {
        downloadUrl,
        expiresInHours: 24,
      });
    }

    this.logger.log(
      `Data export ready for user ${userId} (self=${isSelf}, redacted=${!showSensitive})`
    );
  }

  async readExportFile(
    downloadToken: string,
    downloader?: DataExportRequester
  ): Promise<{
    content: Buffer;
    userId: string;
    exportId: string;
  }> {
    const resolved = await this.storageService.resolveDataExportDownload(downloadToken);
    if (!resolved) {
      throw new NotFoundException('Export link is invalid or expired');
    }

    if (downloader) {
      const isOwn = downloader.userId === resolved.userId;
      const isAdmin = downloader.role === Role.ADMIN;
      const serviceOk =
        downloader.kind === 'service' &&
        ((downloader.scopes ?? []).includes(EXPORT_SCOPE) ||
          (downloader.scopes ?? []).includes(EXPORT_SENSITIVE_SCOPE));

      if (!isOwn && !isAdmin && !serviceOk) {
        throw new ForbiddenException('You are not authorized to download this export');
      }

      await this.auditService.logEvent({
        userId: downloader.userId,
        userRole: downloader.role,
        action: AuditAction.VIEW,
        resourceType: AuditResource.USER,
        resourceId: resolved.userId,
        resourceName: resolved.exportId,
        description: isOwn
          ? 'Downloaded own data export'
          : `Downloaded data export for user ${resolved.userId}`,
        ipAddress: downloader.ipAddress,
        userAgent: downloader.userAgent,
        requestId: downloader.requestId,
        isComplianceEvent: true,
        complianceCategory: 'DATA_EXPORT',
        isSensitive: !isOwn,
        metadata: {
          requesterKind: downloader.kind,
          scopes: downloader.scopes,
          targetUserId: resolved.userId,
          exportId: resolved.exportId,
          event: 'download',
        },
      });
    } else {
      await this.auditService.logEvent({
        action: AuditAction.VIEW,
        resourceType: AuditResource.USER,
        resourceId: resolved.userId,
        resourceName: resolved.exportId,
        description: `Data export downloaded via token link (exportId: ${resolved.exportId})`,
        isComplianceEvent: true,
        complianceCategory: 'DATA_EXPORT',
        metadata: {
          targetUserId: resolved.userId,
          exportId: resolved.exportId,
          event: 'download-token',
          authenticated: false,
        },
      });
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
