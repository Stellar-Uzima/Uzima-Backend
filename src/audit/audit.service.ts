import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private auditRepo: Repository<AuditLog>,
  ) {}

  async create(createAuditDto: any) {
    const log = this.auditRepo.create(createAuditDto);
    return this.auditRepo.save(log);
  }

  async findAll() {
    return this.auditRepo.find();
  }

  async findOne(id: number) {
    return this.auditRepo.findOneBy({ id: id.toString() });
  }

  async update(id: number, updateAuditDto: any) {
    await this.auditRepo.update(id.toString(), updateAuditDto);
    return this.findOne(id);
  }

  async remove(id: number) {
    return this.auditRepo.delete(id.toString());
  }

  async logAction(adminId: string, action: string) {
    const log = this.auditRepo.create({ adminId, action });
    await this.auditRepo.save(log);
  }
}
