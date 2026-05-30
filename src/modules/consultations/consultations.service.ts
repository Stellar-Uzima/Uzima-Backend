import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Consultation } from './entities/consultation.entity';
import { QueueService } from '../../shared/queue/queue.service';
import { NOTIFICATION_QUEUE, EMAIL_NOTIFICATION_JOB } from '../../queue/queue.constants';

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    @InjectRepository(Consultation)
    private readonly consultationRepo: Repository<Consultation>,
    private readonly queueService: QueueService,
  ) {}

  async schedule(userId: string, scheduledAt: Date) {
    const consultation = this.consultationRepo.create({ userId, scheduledAt });
    const saved = await this.consultationRepo.save(consultation);

    // Schedule a reminder 1 hour before scheduled time (or immediately if in past)
    const reminderTime = new Date(scheduledAt.getTime() - 60 * 60 * 1000);
    const delayMs = Math.max(0, reminderTime.getTime() - Date.now());

    await this.queueService.addDelayedJob(NOTIFICATION_QUEUE, EMAIL_NOTIFICATION_JOB, {
      userId,
      consultationId: saved.id,
      scheduledAt: scheduledAt.toISOString(),
    },
    delayMs,
    { maxRetries: 3, backoffMs: 1000 });

    this.logger.log(`Scheduled consultation ${saved.id} for user ${userId}`);
    return saved;
  }

  async cancel(id: string) {
    const consultation = await this.consultationRepo.findOne({ where: { id } });
    if (!consultation) {
      throw new NotFoundException('Consultation not found');
    }

    consultation.cancelled = true;
    await this.consultationRepo.save(consultation);

    this.logger.log(`Cancelled consultation ${id}`);
    return consultation;
  }
}
