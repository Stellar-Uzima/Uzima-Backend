import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { CreateAuditDto } from './dto/create-audit.dto';
import { UpdateAuditDto } from './dto/update-audit.dto';

export interface AuditPaginationOptions {
  page?: number;
  limit?: number;
  action?: string;
  userId?: string;
  sortBy?: 'createdAt' | 'action' | 'adminId';
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedAuditResult {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
  ) {}

  async logAction(adminId: string, action: string) {
    const log = this.auditRepo.create({ adminId, action });
    await this.auditRepo.save(log);
  }

  async create(dto: CreateAuditDto): Promise<AuditLog> {
    const log = this.auditRepo.create({
      adminId: (dto as { adminId?: string }).adminId ?? '',
      action: (dto as { action?: string }).action ?? '',
    });
    return this.auditRepo.save(log);
  }

  /**
   * Find audit logs with pagination, filtering, and sorting
   */
  async findAllPaginated(options: AuditPaginationOptions = {}): Promise<PaginatedAuditResult> {
    const {
      page = 1,
      limit = 20,
      action,
      userId,
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
      where.action = Like(`%${action}%`);
    }
    
    if (userId) {
      where.adminId = userId;
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

  async findAll(): Promise<AuditLog[]> {
    return this.auditRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: number | string): Promise<AuditLog | null> {
    return this.auditRepo.findOne({ where: { id: String(id) } });
  }

  async update(id: number | string, dto: UpdateAuditDto): Promise<AuditLog> {
    await this.auditRepo.update({ id: String(id) }, dto as Partial<AuditLog>);
    const log = await this.findOne(id);
    if (!log) throw new Error('Audit log not found');
    return log;
  }

  async remove(id: number | string): Promise<void> {
    await this.auditRepo.delete({ id: String(id) });
  }
}
