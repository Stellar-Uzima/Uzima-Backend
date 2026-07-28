import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { AvailabilitySlot, DayOfWeek } from './entities/availability-slot.entity';
import { Appointment, AppointmentStatus } from './entities/appointment.entity';
import { ScheduleSlotDto } from './dto/set-schedule.dto';
import { BookSlotDto, CancelBookingDto, BlockDateDto } from './dto/book-slot.dto';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { APPOINTMENT_REMINDER_QUEUE, APPOINTMENT_REMINDER_JOB } from '../../queue/queue.constants';

@Injectable()
export class HealerAvailabilityService {
  constructor(
    @InjectRepository(AvailabilitySlot)
    private readonly slotRepository: Repository<AvailabilitySlot>,
    @InjectRepository(Appointment)
    private readonly appointmentRepository: Repository<Appointment>,
    @InjectQueue(APPOINTMENT_REMINDER_QUEUE) private readonly reminderQueue: Queue,
  ) {}

  async setWeeklySchedule(healerId: string, slots: ScheduleSlotDto[], effectiveFrom?: Date, effectiveUntil?: Date): Promise<AvailabilitySlot[]> {
    const createdSlots: AvailabilitySlot[] = [];

    for (const slotData of slots) {
      const existingSlots = await this.slotRepository.find({
        where: {
          healerId,
          dayOfWeek: slotData.dayOfWeek,
          startTime: slotData.startTime,
          endTime: slotData.endTime,
          isRecurring: true,
        },
      });

      if (existingSlots.length > 0) {
        continue;
      }

      const slot = this.slotRepository.create({
        healerId,
        dayOfWeek: slotData.dayOfWeek,
        startTime: slotData.startTime,
        endTime: slotData.endTime,
        isRecurring: true,
        exceptionDate: null,
        isBlocked: false,
      });

      const saved = await this.slotRepository.save(slot);
      createdSlots.push(saved);
    }

    return createdSlots;
  }

  async blockDate(healerId: string, blockData: BlockDateDto): Promise<AvailabilitySlot> {
    const date = new Date(blockData.date);
    const dayOfWeek = date.getDay() as DayOfWeek;

    const existingBlock = await this.slotRepository.findOne({
      where: {
        healerId,
        exceptionDate: date,
        isBlocked: true,
      },
    });

    if (existingBlock) {
      return existingBlock;
    }

    const blockingSlot = this.slotRepository.create({
      healerId,
      dayOfWeek,
      startTime: '00:00',
      endTime: '23:59',
      isRecurring: false,
      exceptionDate: date,
      isBlocked: true,
      blockReason: blockData.reason,
    });

    return this.slotRepository.save(blockingSlot);
  }

  async getAvailableSlots(healerId: string, startDate: Date, endDate: Date): Promise<AvailabilitySlot[]> {
    const availableSlots: AvailabilitySlot[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay() as DayOfWeek;
      const dateStr = currentDate.toISOString().split('T')[0];

      const blockedSlot = await this.slotRepository.findOne({
        where: {
          healerId,
          dayOfWeek,
          exceptionDate: currentDate,
          isBlocked: true,
        },
      });

      if (!blockedSlot) {
        const recurringSlots = await this.slotRepository.find({
          where: {
            healerId,
            dayOfWeek,
            isRecurring: true,
            isBlocked: false,
          },
        });

        const bookedAppointments = await this.appointmentRepository.find({
          where: {
            healerId,
            scheduledAt: Between(
              new Date(`${dateStr}T00:00:00`),
              new Date(`${dateStr}T23:59:59`)
            ),
            status: In([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
          },
        });

        const bookedTimes = bookedAppointments.map(apt => apt.scheduledAt);

        for (const slot of recurringSlots) {
          const slotStart = new Date(`${dateStr}T${slot.startTime}`);
          const slotEnd = new Date(`${dateStr}T${slot.endTime}`);

          const isBooked = bookedTimes.some(booked => booked >= slotStart && booked < slotEnd);

          if (!isBooked) {
            availableSlots.push(slot);
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return availableSlots;
  }

  async bookSlot(userId: string, healerId: string, dto: BookSlotDto): Promise<Appointment> {
    const slot = await this.slotRepository.findOne({
      where: { id: dto.slotId, healerId },
    });

    if (!slot) {
      throw new NotFoundException('Availability slot not found');
    }

    if (slot.isBlocked) {
      throw new BadRequestException('This slot is blocked');
    }

    const scheduledAt = new Date(`${dto.date}T${slot.startTime}`);

    const dayStart = new Date(`${dto.date}T00:00:00`);
    const dayEnd = new Date(`${dto.date}T23:59:59`);

    const existingAppointment = await this.appointmentRepository.findOne({
      where: {
        healerId,
        scheduledAt: Between(dayStart, dayEnd),
        status: In([AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]),
      },
    });

    if (existingAppointment) {
      throw new ConflictException('This slot is already booked');
    }

    const appointment = this.appointmentRepository.create({
      slotId: dto.slotId,
      userId,
      healerId,
      status: AppointmentStatus.PENDING,
      scheduledAt,
      durationMinutes: this.calculateDuration(slot.startTime, slot.endTime),
      metadata: dto.notes ? { notes: dto.notes } : undefined,
    });

    const savedAppointment = await this.appointmentRepository.save(appointment);

    if (dto.sendReminder) {
      await this.scheduleReminder(savedAppointment);
    }

    return savedAppointment;
  }

  async cancelBooking(bookingId: string, userId: string, dto: CancelBookingDto): Promise<Appointment> {
    const appointment = await this.appointmentRepository.findOne({
      where: { id: bookingId },
      relations: ['slot'],
    });

    if (!appointment) {
      throw new NotFoundException('Booking not found');
    }

    if (appointment.userId !== userId && appointment.healerId !== userId) {
      throw new ForbiddenException('You are not authorized to cancel this booking');
    }

    const now = new Date();
    const appointmentTime = new Date(appointment.scheduledAt);
    const hoursBeforeAppointment = (appointmentTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    appointment.status = AppointmentStatus.CANCELLED;
    appointment.cancellationReason = dto.reason || 'No reason provided';
    appointment.cancellationNotes = dto.notes ?? null;
    appointment.isLateCancellation = hoursBeforeAppointment < 24;

    const saved = await this.appointmentRepository.save(appointment);

    await this.cancelReminder(bookingId);

    return saved;
  }

  async getMyAppointments(userId: string, status?: string, startDate?: Date, endDate?: Date): Promise<Appointment[]> {
    const query = this.appointmentRepository
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.slot', 'slot')
      .where('appointment.userId = :userId OR appointment.healerId = :userId', { userId })
      .orderBy('appointment.scheduledAt', 'ASC');

    if (status) {
      query.andWhere('appointment.status = :status', { status });
    }

    if (startDate && endDate) {
      query.andWhere('appointment.scheduledAt BETWEEN :startDate AND :endDate', { startDate, endDate });
    }

    return query.getMany();
  }

  private calculateDuration(startTime: string, endTime: string): number {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    return (endHour * 60 + endMin) - (startHour * 60 + startMin);
  }

  private async scheduleReminder(appointment: Appointment): Promise<void> {
    const appointmentTime = new Date(appointment.scheduledAt);
    const reminderTime = new Date(appointmentTime.getTime() - 24 * 60 * 60 * 1000);
    const now = new Date();

    if (reminderTime > now) {
      await this.reminderQueue.add(
        APPOINTMENT_REMINDER_JOB,
        {
          appointmentId: appointment.id,
          userId: appointment.userId,
          healerId: appointment.healerId,
          appointmentTime: appointmentTime.toISOString(),
        },
        {
          delay: reminderTime.getTime() - now.getTime(),
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );
    }
  }

  private async cancelReminder(appointmentId: string): Promise<void> {
    const jobs = await this.reminderQueue.getJobs(['delayed', 'waiting', 'active']);
    const reminderJobs = jobs.filter(job => job.data.appointmentId === appointmentId);

    for (const job of reminderJobs) {
      await job.remove();
    }
  }
}