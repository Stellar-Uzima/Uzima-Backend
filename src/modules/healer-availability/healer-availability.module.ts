import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { HealerAvailabilityController } from './healer-availability.controller';
import { HealerAvailabilityService } from './healer-availability.service';
import { AvailabilitySlot } from './entities/availability-slot.entity';
import { Appointment } from './entities/appointment.entity';
import { AppointmentReminderProcessor } from './appointment.reminder.processor';
import { APPOINTMENT_REMINDER_QUEUE } from './constants';
import { QueueModule } from '../../queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AvailabilitySlot, Appointment]),
    QueueModule,
    BullModule.registerQueue({
      name: APPOINTMENT_REMINDER_QUEUE,
    }),
  ],
  controllers: [HealerAvailabilityController],
  providers: [HealerAvailabilityService, AppointmentReminderProcessor],
  exports: [HealerAvailabilityService],
})
export class HealerAvailabilityModule {}
