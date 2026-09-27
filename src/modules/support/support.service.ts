import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SupportCase, SupportCaseStatus } from './entities/support-case.entity';

@Injectable()
export class SupportService {
  constructor(@InjectRepository(SupportCase) private readonly cases: Repository<SupportCase>) {}

  create(userId: string, input: { subject: string; description: string; category?: string }) {
    return this.cases.save(this.cases.create({
      userId, subject: input.subject.trim(), description: input.description.trim(),
      category: input.category?.trim() || null, notes: [], status: SupportCaseStatus.OPEN,
    }));
  }

  list(filters: { status?: SupportCaseStatus; userId?: string }) {
    return this.cases.find({
      where: { status: filters.status, userId: filters.userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async update(id: string, input: { status?: SupportCaseStatus; category?: string }) {
    const supportCase = await this.find(id);
    if (input.status) {
      supportCase.status = input.status;
      supportCase.resolvedAt = [SupportCaseStatus.RESOLVED, SupportCaseStatus.CLOSED].includes(input.status)
        ? new Date() : null;
    }
    if (input.category !== undefined) supportCase.category = input.category.trim() || null;
    return this.cases.save(supportCase);
  }

  async addNote(id: string, authorId: string, body: string) {
    const supportCase = await this.find(id);
    supportCase.notes = [...(supportCase.notes || []), { authorId, body: body.trim(), createdAt: new Date().toISOString() }];
    return this.cases.save(supportCase);
  }

  private async find(id: string): Promise<SupportCase> {
    const supportCase = await this.cases.findOne({ where: { id } });
    if (!supportCase) throw new NotFoundException('Support case not found');
    return supportCase;
  }
}
