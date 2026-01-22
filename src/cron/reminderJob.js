import cron from 'node-cron';
import { schedulePurgeJob } from './purgeJob.js';
import { getAppointmentsForTomorrow } from '../models/appointmentModel.js';
import mailer from '../services/email.Service.js';
import reminderEmail from '../templates/remainderEmail.js';

cron.schedule('0 0 * * *', async () => {
  const appointments = getAppointmentsForTomorrow();

  for (const appt of appointments) {
    await mailer.sendMail(
      appt.patient.email,
      'Appointment Reminder',
      reminderEmail(appt.patient.name, appt.date)
    );
    await mailer.sendMail(
      appt.doctor.email,
      'Appointment Reminder',
      reminderEmail(appt.doctor.name, appt.date)
    );
  }

  console.log(`[${new Date().toISOString()}] Reminder emails sent.`);
});

// Schedule purge job
schedulePurgeJob(cron);
