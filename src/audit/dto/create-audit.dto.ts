import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { AuditAction, AuditResource } from '../entities/audit-log.entity';

export class CreateAuditDto {
  @ApiPropertyOptional({ description: 'ID of the user who performed the action' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Email of the user who performed the action' })
  @IsOptional()
  @IsString()
  userEmail?: string;

  @ApiPropertyOptional({ description: 'Role of the user who performed the action' })
  @IsOptional()
  @IsString()
  userRole?: string;

  @ApiPropertyOptional({ enum: AuditAction, description: 'The action that was performed' })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ enum: AuditResource, description: 'The type of resource affected' })
  @IsOptional()
  @IsEnum(AuditResource)
  resourceType?: AuditResource;

  @ApiPropertyOptional({ description: 'ID of the affected resource' })
  @IsOptional()
  @IsString()
  resourceId?: string;

  @ApiPropertyOptional({ description: 'Human-readable name of the affected resource' })
  @IsOptional()
  @IsString()
  resourceName?: string;

  @ApiPropertyOptional({ description: 'State of the resource before the change' })
  @IsOptional()
  @IsObject()
  oldValues?: Record<string, any>;

  @ApiPropertyOptional({ description: 'State of the resource after the change' })
  @IsOptional()
  @IsObject()
  newValues?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Free-text description of the event' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'IP address the request originated from' })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional({ description: 'User agent string of the request' })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional({ description: 'Session identifier tied to the request' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Request identifier for tracing' })
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiPropertyOptional({ description: 'Correlation identifier linking related events' })
  @IsOptional()
  @IsString()
  correlationId?: string;

  @ApiPropertyOptional({ description: 'Tenant identifier for multi-tenant deployments' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Whether this event touches sensitive data' })
  @IsOptional()
  @IsBoolean()
  isSensitive?: boolean;

  @ApiPropertyOptional({ description: 'Whether this event is a compliance event (retained indefinitely)' })
  @IsOptional()
  @IsBoolean()
  isComplianceEvent?: boolean;

  @ApiPropertyOptional({ description: 'Compliance category, if applicable' })
  @IsOptional()
  @IsString()
  complianceCategory?: string;

  @ApiPropertyOptional({ description: 'Additional structured metadata for traceability' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
