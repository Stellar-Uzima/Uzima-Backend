import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { APPOINTMENT_REMINDER_QUEUE, APPOINTMENT_REMINDER_JOB } from './constants';

@Processor(APPOINTMENT_REMINDER_QUEUE)
export class AppointmentReminderProcessor {
  private readonly logger = new Logger(AppointmentReminderProcessor.name);

  @Process({ name: APPOINTMENT_REMINDER_JOB, concurrency: 5 })
  async handleAppointmentReminder(job: any): Promise<void> {
    const { appointmentId, userId, healerId, appointmentTime } = job.data;
    this.logger.log(`Processing reminder for appointment ${appointmentId}`);
  }
}