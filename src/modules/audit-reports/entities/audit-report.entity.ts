/**
 * Audit Report Entity
 * Stores metadata about generated audit reports for compliance and tracking
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { IsEnum, IsUUID, IsOptional, IsString, IsDateString } from 'class-validator';

export enum ReportStatus {
  PENDING = 'PENDING',
  GENERATED = 'GENERATED',
  EXPORTED = 'EXPORTED',
  FAILED = 'FAILED',
  ARCHIVED = 'ARCHIVED',
}

export enum ReportFormat {
  PDF = 'PDF',
  CSV = 'CSV',
  JSON = 'JSON',
  EXCEL = 'EXCEL',
}

export enum ReportType {
  USER_ACTIVITY = 'USER_ACTIVITY',
  DATA_ACCESS = 'DATA_ACCESS',
  SECURITY_EVENTS = 'SECURITY_EVENTS',
  COMPLIANCE = 'COMPLIANCE',
  FINANCIAL = 'FINANCIAL',
  SYSTEM_EVENTS = 'SYSTEM_EVENTS',
  AUTHENTICATION = 'AUTHENTICATION',
  CUSTOM = 'CUSTOM',
}

@Entity('audit_reports')
@Index(['reportType'])
@Index(['status'])
@Index(['createdAt'])
@Index(['generatedAt'])
@Index(['userId'])
export class AuditReport {
  @PrimaryGeneratedColumn('uuid')
  @IsUUID()
  id: string;

  @Column({ type: 'enum', enum: ReportType, default: ReportType.COMPLIANCE })
  @IsEnum(ReportType)
  reportType: ReportType;

  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.PENDING })
  @IsEnum(ReportStatus)
  status: ReportStatus;

  @Column({ type: 'varchar', length: 500 })
  @IsString()
  title: string;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @IsOptional()
  @IsString()
  generatedBy?: string;

  @Column({ type: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @Column({ type: 'timestamp', nullable: true })
  @IsOptional()
  @IsDateString()
  generatedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  @IsOptional()
  @IsDateString()
  startDate?: Date;

  @Column({ type: 'timestamp', nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: Date;

  @Column({ type: 'simple-json', nullable: true })
  filters?: Record<string, any>;

  @Column({ type: 'varchar', length: 500, nullable: true })
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  @IsOptional()
  @IsString()
  fileName?: string;

  @Column({ type: 'enum', enum: ReportFormat, default: ReportFormat.PDF })
  @IsEnum(ReportFormat)
  format: ReportFormat;

  @Column({ type: 'bigint', default: 0 })
  fileSize: number;

  @Column({ type: 'integer', default: 0 })
  recordCount: number;

  @Column({ type: 'simple-json', nullable: true })
  summary?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @Column({ type: 'boolean', default: false })
  isScheduled: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @IsOptional()
  @IsString()
  schedulePattern?: string; // Cron pattern

  @Column({ type: 'timestamp', nullable: true })
  @IsOptional()
  @IsDateString()
  nextScheduledRun?: Date;

  @Column({ type: 'boolean', default: false })
  isCompliance: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @IsOptional()
  @IsString()
  complianceStandard?: string; // e.g., GDPR, HIPAA, SOC2

  @Column({ type: 'simple-json', nullable: true })
  complianceMetadata?: Record<string, any>;

  @Column({ type: 'boolean', default: true })
  isPublic: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @Column({ type: 'timestamp', nullable: true })
  @IsOptional()
  @IsDateString()
  expiresAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}
