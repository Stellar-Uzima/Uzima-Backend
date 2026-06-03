import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Consultation } from './entities/consultation.entity';
import { HealerAvailability } from './entities/availability.entity';
import { QueueService } from '../../shared/queue/queue.service';
import { NOTIFICATION_QUEUE, EMAIL_NOTIFICATION_JOB } from '../../queue/queue.constants';

export interface AvailabilitySlotView {
  id: string;
  healerId: string;
  startTime: Date;
  endTime: Date;
  available: boolean;
}

@Injectable()
export class ConsultationsService {
  private readonly logger = new Logger(ConsultationsService.name);

  constructor(
    @InjectRepository(Consultation)
    private readonly consultationRepo: Repository<Consultation>,
    @InjectRepository(HealerAvailability)
    private readonly availabilityRepo: Repository<HealerAvailability>,
    private readonly queueService: QueueService,
  ) {}

  async setAvailability(healerId: string, startTime: Date, endTime: Date) {
    if (startTime >= endTime) {
      throw new BadRequestException('startTime must be before endTime');
    }

    const slot = this.availabilityRepo.create({ healerId, startTime, endTime });
    const saved = await this.availabilityRepo.save(slot);
    this.logger.log(`Healer ${healerId} added availability slot ${saved.id}`);
    return saved;
  }

  async getAvailability(healerId: string): Promise<AvailabilitySlotView[]> {
    const slots = await this.availabilityRepo.find({
      where: { healerId },
      order: { startTime: 'ASC' },
    });

    const booked = await this.consultationRepo.find({
      where: { healerId, cancelled: false },
    });

    return slots.map((slot) => ({
      id: slot.id,
      healerId: slot.healerId,
      startTime: slot.startTime,
      endTime: slot.endTime,
      available: !this.isSlotBooked(slot, booked),
    }));
  }

  private isSlotBooked(slot: HealerAvailability, consultations: Consultation[]): boolean {
    const slotStart = slot.startTime.getTime();
    const slotEnd = slot.endTime.getTime();

    return consultations.some((consultation) => {
      const bookedAt = new Date(consultation.scheduledAt).getTime();
      return bookedAt >= slotStart && bookedAt < slotEnd;
    });
  }

  async schedule(userId: string, scheduledAt: Date, healerId?: string) {
    const consultation = this.consultationRepo.create({
      userId,
      scheduledAt,
      healerId: healerId ?? null,
    });
    const saved = await this.consultationRepo.save(consultation);

    const reminderTime = new Date(scheduledAt.getTime() - 60 * 60 * 1000);
    const delayMs = Math.max(0, reminderTime.getTime() - Date.now());

    await this.queueService.addDelayedJob(
      NOTIFICATION_QUEUE,
      EMAIL_NOTIFICATION_JOB,
      {
        userId,
        consultationId: saved.id,
        scheduledAt: scheduledAt.toISOString(),
      },
      delayMs,
      { attempts: 3 },
    );

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
