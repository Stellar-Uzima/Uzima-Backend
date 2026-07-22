import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthReport, HealthReportStatus } from './entities/health-report.entity';
import { AggregationService } from './aggregation.service';
import { PdfService } from './pdf.service';
import { StorageService } from '../storage/storage.service';
import { User } from '../entities/user.entity';

const DOWNLOAD_EXPIRY_DAYS = 7;

@Injectable()
export class HealthReportService {
  private readonly logger = new Logger(HealthReportService.name);

  constructor(
    @InjectRepository(HealthReport)
    private readonly reportRepo: Repository<HealthReport>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly aggregationService: AggregationService,
    private readonly pdfService: PdfService,
    private readonly storageService: StorageService
  ) {}

  /**
   * Idempotent: returns the existing report for this user/period if one
   * already exists (any status), otherwise creates a new pending one.
   * Used by the weekly background job so it doesn't regenerate a report
   * already produced for the current week.
   */
  async findOrCreatePendingReport(
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<HealthReport> {
    const periodStartStr = this.toDateString(periodStart);
    const periodEndStr = this.toDateString(periodEnd);

    const existing = await this.reportRepo.findOne({
      where: {
        userId,
        periodStart: periodStartStr,
        periodEnd: periodEndStr,
      },
    });

    if (existing) {
      return existing;
    }

    const report = this.reportRepo.create({
      userId,
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
      status: HealthReportStatus.PENDING,
    });

    return this.reportRepo.save(report);
  }

  /**
   * Runs the full generation pipeline: aggregate data, render PDF, upload
   * to storage, update entity to ready. On any failure, marks the entity
   * failed with a reason and ensures no partial file is left in storage.
   */
  async generateReport(reportId: string): Promise<HealthReport> {
    const report = await this.reportRepo.findOne({ where: { id: reportId } });
    if (!report) {
      throw new NotFoundException(`Health report ${reportId} not found`);
    }

    report.status = HealthReportStatus.GENERATING;
    await this.reportRepo.save(report);

    let uploadedFileKey: string | null = null;

    try {
      const user = await this.userRepo.findOne({ where: { id: report.userId } });
      if (!user) {
        throw new NotFoundException(`User ${report.userId} not found`);
      }

      const periodStart = new Date(report.periodStart + 'T00:00:00Z');
      const periodEnd = new Date(report.periodEnd + 'T23:59:59Z');

      const aggregation = await this.aggregationService.aggregateForUser(
        report.userId,
        periodStart,
        periodEnd
      );

      const displayName = this.resolveDisplayName(user);
      const pdfBuffer = await this.pdfService.generateReportPdf(aggregation, displayName);

      const fileKey = await this.storageService.uploadFile(
        {
          originalname: `health-report-${report.periodStart}-to-${report.periodEnd}.pdf`,
          buffer: pdfBuffer,
          mimetype: 'application/pdf',
        },
        `health-reports/${report.userId}`
      );
      uploadedFileKey = fileKey;

      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + DOWNLOAD_EXPIRY_DAYS);

      report.status = HealthReportStatus.READY;
      report.storageKey = fileKey;
      report.generatedAt = now;
      report.expiresAt = expiresAt;
      report.failureReason = null;

      await this.reportRepo.save(report);
      this.logger.log(`Report ${reportId} generated successfully for user ${report.userId}`);

      return report;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Report ${reportId} generation failed: ${err.message}`, err.stack);

      if (uploadedFileKey) {
        try {
          await this.storageService.deleteFile(uploadedFileKey);
        } catch (cleanupError) {
          this.logger.error(
            `Failed to clean up partial upload for report ${reportId}`,
            (cleanupError as Error).stack
          );
        }
      }

      report.status = HealthReportStatus.FAILED;
      report.failureReason = err.message?.slice(0, 500) ?? 'Unknown error';
      await this.reportRepo.save(report);

      throw error;
    }
  }

  /**
   * Validates ownership and expiry, then returns a signed download URL.
   * Throws 403 if the requester doesn't own the report, 410 if the
   * report's download window has passed.
   */
  async getDownloadUrl(reportId: string, requestingUserId: string): Promise<string> {
    const report = await this.reportRepo.findOne({ where: { id: reportId } });
    if (!report) {
      throw new NotFoundException(`Health report ${reportId} not found`);
    }

    if (report.userId !== requestingUserId) {
      throw new ForbiddenException('You do not have access to this report');
    }

    if (report.status !== HealthReportStatus.READY || !report.storageKey) {
      throw new NotFoundException('Report is not ready for download');
    }

    if (!report.expiresAt || report.expiresAt.getTime() < Date.now()) {
      throw new HttpException('Download link has expired', HttpStatus.GONE);
    }

    return this.storageService.getDownloadUrl(report.storageKey, 3600);
  }

  private resolveDisplayName(user: User): string {
    if (user.fullName) {
      return user.fullName;
    }
    if (user.firstName || user.lastName) {
      return [user.firstName, user.lastName].filter(Boolean).join(' ');
    }
    return user.email ?? 'Uzima User';
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
