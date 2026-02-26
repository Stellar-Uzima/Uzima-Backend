import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { CreateAuditDto } from './dto/create-audit.dto';
import { UpdateAuditDto } from './dto/update-audit.dto';

@Injectable()
export class AuditService {
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
