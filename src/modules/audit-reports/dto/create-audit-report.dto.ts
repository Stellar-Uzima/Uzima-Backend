/**
 * DTO for creating and managing audit reports
 */

import {
  IsEnum,
  IsOptional,
  IsString,
  IsDateString,
  IsObject,
  IsBoolean,
  ValidateNested,
  IsUUID,
  Length,
  Min,
  Max,
} from 'class-validator';
import { Type, Expose } from 'class-transformer';
import { ReportType, ReportFormat, ReportStatus } from '../entities/audit-report.entity';

/**
 * DTO for creating a new report
 */
export class CreateAuditReportDto {
  @IsEnum(ReportType)
  reportType: ReportType;

  @IsString()
  @Length(3, 500)
  title: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat = ReportFormat.PDF;

  @IsOptional()
  @IsDateString()
  startDate?: Date;

  @IsOptional()
  @IsDateString()
  endDate?: Date;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  filters?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isCompliance?: boolean = false;

  @IsOptional()
  @IsString()
  complianceStandard?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean = false;

  @IsOptional()
  @IsBoolean()
  isScheduled?: boolean = false;

  @IsOptional()
  @IsString()
  schedulePattern?: string; // Cron pattern
}

/**
 * DTO for querying reports with pagination
 */
export class QueryAuditReportDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(ReportType)
  reportType?: ReportType;

  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @IsOptional()
  @IsDateString()
  startDate?: Date;

  @IsOptional()
  @IsDateString()
  endDate?: Date;

  @IsOptional()
  @IsBoolean()
  isCompliance?: boolean;

  @IsOptional()
  @IsBoolean()
  isScheduled?: boolean;

  @IsOptional()
  @IsString()
  searchText?: string;

  @IsOptional()
  @IsString()
  sortBy?: 'createdAt' | 'generatedAt' | 'title' | 'status';

  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

/**
 * DTO for exporting reports
 */
export class ExportReportDto {
  @IsEnum(ReportFormat)
  format: ReportFormat;

  @IsOptional()
  @IsBoolean()
  includeCharts?: boolean = true;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @IsObject()
  exportOptions?: Record<string, any>;
}

/**
 * DTO for scheduling reports
 */
export class ScheduleReportDto {
  @IsString()
  @Length(3, 100)
  schedulePattern: string; // Cron pattern: "0 9 * * MON" for every Monday at 9 AM

  @IsOptional()
  @IsDateString()
  startDate?: Date;

  @IsOptional()
  @IsDateString()
  endDate?: Date;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean = false;

  @IsOptional()
  @IsString()
  emailRecipients?: string; // Comma-separated emails
}

/**
 * Response DTO for audit reports
 */
export class AuditReportResponseDto {
  @Expose()
  id: string;

  @Expose()
  reportType: ReportType;

  @Expose()
  status: ReportStatus;

  @Expose()
  title: string;

  @Expose()
  description?: string;

  @Expose()
  generatedAt?: Date;

  @Expose()
  startDate?: Date;

  @Expose()
  endDate?: Date;

  @Expose()
  fileUrl?: string;

  @Expose()
  fileName?: string;

  @Expose()
  format: ReportFormat;

  @Expose()
  fileSize: number;

  @Expose()
  recordCount: number;

  @Expose()
  summary?: Record<string, any>;

  @Expose()
  isCompliance: boolean;

  @Expose()
  isScheduled: boolean;

  @Expose()
  schedulePattern?: string;

  @Expose()
  nextScheduledRun?: Date;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}

/**
 * Response DTO for paginated reports
 */
export class PaginatedAuditReportsDto {
  @Type(() => AuditReportResponseDto)
  data: AuditReportResponseDto[];

  total: number;

  page: number;

  limit: number;

  totalPages: number;

  hasMore: boolean;
}
