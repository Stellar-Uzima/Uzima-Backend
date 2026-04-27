import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { AuditLog, AuditAction, AuditResource } from './entities/audit-log.entity';
import { CreateAuditDto } from './dto/create-audit.dto';
import { UpdateAuditDto } from './dto/update-audit.dto';
import * as crypto from 'crypto';

export interface AuditPaginationOptions {
  page?: number;
  limit?: number;
  action?: AuditAction;
  resourceType?: AuditResource;
  resourceId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  isComplianceEvent?: boolean;
  complianceCategory?: string;
  sortBy?: 'createdAt' | 'action' | 'userId' | 'resourceType';
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedAuditResult {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditEventOptions {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  action: AuditAction;
  resourceType: AuditResource;
  resourceId?: string;
  resourceName?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  correlationId?: string;
  tenantId?: string;
  isSensitive?: boolean;
  isComplianceEvent?: boolean;
  complianceCategory?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private previousHash: string | null = null;

  constructor(
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
  ) {}

  /**
   * Create a comprehensive audit log entry with immutability features
   */
  async logEvent(options: AuditEventOptions): Promise<AuditLog> {
    const auditLog = this.auditRepo.create({
      userId: options.userId,
      userEmail: options.userEmail,
      userRole: options.userRole,
      action: options.action,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      resourceName: options.resourceName,
      oldValues: options.oldValues,
      newValues: options.newValues,
      description: options.description,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      sessionId: options.sessionId,
      requestId: options.requestId,
      correlationId: options.correlationId,
      tenantId: options.tenantId,
      isSensitive: options.isSensitive || false,
      isComplianceEvent: options.isComplianceEvent || false,
      complianceCategory: options.complianceCategory,
      metadata: options.metadata,
      createdBy: options.userId,
    });

    // Generate hash for immutability
    auditLog.hash = this.generateHash(auditLog);
    auditLog.previousHash = this.previousHash;
    auditLog.blockIndex = await this.getNextBlockIndex();

    const savedLog = await this.auditRepo.save(auditLog);
    this.previousHash = savedLog.hash;

    this.logger.debug(`Audit log created: ${savedLog.id} for action ${savedLog.action}`);
    return savedLog;
  }

  /**
   * Legacy method for backward compatibility
   */
  async logAction(adminId: string, action: string) {
    return this.logEvent({
      userId: adminId,
      action: AuditAction.SYSTEM,
      resourceType: AuditResource.SYSTEM,
      description: action,
    });
  }

  /**
   * Create audit log from DTO
   */
  async create(dto: CreateAuditDto): Promise<AuditLog> {
    return this.logEvent({
      userId: (dto as any).userId,
      userEmail: (dto as any).userEmail,
      action: (dto as any).action || AuditAction.SYSTEM,
      resourceType: (dto as any).resourceType || AuditResource.SYSTEM,
      description: (dto as any).description,
    });
  }

  /**
   * Verify audit log integrity
   */
  async verifyIntegrity(): Promise<{ isValid: boolean; brokenChains: string[] }> {
    const logs = await this.auditRepo.find({
      order: { blockIndex: 'ASC' },
      take: 1000, // Limit to last 1000 entries for performance
    });

    const brokenChains: string[] = [];
    let isValid = true;

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      
      // Verify hash
      const expectedHash = this.generateHash(log);
      if (log.hash !== expectedHash) {
        brokenChains.push(`Hash mismatch for log ${log.id}`);
        isValid = false;
      }

      // Verify chain integrity
      if (i > 0 && log.previousHash !== logs[i - 1].hash) {
        brokenChains.push(`Chain break at log ${log.id}`);
        isValid = false;
      }
    }

    return { isValid, brokenChains };
  }

  /**
   * Find audit logs with comprehensive filtering and pagination
   */
  async findAllPaginated(options: AuditPaginationOptions = {}): Promise<PaginatedAuditResult> {
    const {
      page = 1,
      limit = 20,
      action,
      resourceType,
      resourceId,
      userId,
      startDate,
      endDate,
      isComplianceEvent,
      complianceCategory,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = options;

    // Handle edge cases
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const skip = (safePage - 1) * safeLimit;

    // Build where clause for filtering
    const where: FindOptionsWhere<AuditLog> = {};
    
    if (action) {
      where.action = action;
    }
    
    if (resourceType) {
      where.resourceType = resourceType;
    }

    if (resourceId) {
      where.resourceId = resourceId;
    }
    
    if (userId) {
      where.userId = userId;
    }

    if (isComplianceEvent !== undefined) {
      where.isComplianceEvent = isComplianceEvent;
    }

    if (complianceCategory) {
      where.complianceCategory = complianceCategory;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        (where.createdAt as any).gte = startDate;
      }
      if (endDate) {
        (where.createdAt as any).lte = endDate;
      }
    }

    // Build order clause
    const order: Record<string, 'ASC' | 'DESC'> = {
      [sortBy]: sortOrder,
    };

    // Execute query with pagination
    const [data, total] = await this.auditRepo.findAndCount({
      where,
      order,
      take: safeLimit,
      skip,
    });

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  /**
   * Get compliance reports
   */
  async getComplianceReport(startDate: Date, endDate: Date): Promise<any> {
    const complianceLogs = await this.auditRepo.find({
      where: {
        isComplianceEvent: true,
        createdAt: { gte: startDate, lte: endDate },
      },
      order: { createdAt: 'DESC' },
    });

    const report = {
      period: { start: startDate, end: endDate },
      totalEvents: complianceLogs.length,
      eventsByCategory: {},
      eventsByAction: {},
      eventsByUser: {},
      sensitiveEvents: complianceLogs.filter(log => log.isSensitive).length,
    };

    complianceLogs.forEach(log => {
      // Count by category
      const category = log.complianceCategory || 'UNCATEGORIZED';
      report.eventsByCategory[category] = (report.eventsByCategory[category] || 0) + 1;

      // Count by action
      report.eventsByAction[log.action] = (report.eventsByAction[log.action] || 0) + 1;

      // Count by user
      if (log.userId) {
        report.eventsByUser[log.userId] = (report.eventsByUser[log.userId] || 0) + 1;
      }
    });

    return report;
  }

  async findAll(): Promise<AuditLog[]> {
    return this.auditRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: number | string): Promise<AuditLog | null> {
    return this.auditRepo.findOne({ where: { id: String(id) } });
  }

  async update(id: number | string, dto: UpdateAuditDto): Promise<AuditLog> {
    // For audit logs, we should not allow updates to maintain immutability
    throw new Error('Audit logs are immutable and cannot be updated');
  }

  async remove(id: number | string): Promise<void> {
    // For audit logs, we should not allow deletion to maintain immutability
    throw new Error('Audit logs are immutable and cannot be deleted');
  }

  /**
   * Generate SHA-256 hash for audit log immutability
   */
  private generateHash(auditLog: AuditLog): string {
    const data = {
      id: auditLog.id,
      userId: auditLog.userId,
      action: auditLog.action,
      resourceType: auditLog.resourceType,
      resourceId: auditLog.resourceId,
      oldValues: auditLog.oldValues,
      newValues: auditLog.newValues,
      createdAt: auditLog.createdAt,
      previousHash: this.previousHash,
    };

    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(dataString).digest('hex');
  }

  /**
   * Get next block index for audit log chain
   */
  private async getNextBlockIndex(): Promise<number> {
    const lastLog = await this.auditRepo.findOne({
      order: { blockIndex: 'DESC' },
      select: ['blockIndex'],
    });
    
    return (lastLog?.blockIndex || 0) + 1;
  }
}
