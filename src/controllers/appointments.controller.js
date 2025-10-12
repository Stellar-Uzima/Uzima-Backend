import express from 'express';
import { addAppointment } from '../models/appointmentModel.js';
import mailer from '../services/email.Service.js';
import confirmationEmail from '../templates/confimationEmail.js';

const router = express.Router();
router.post('/', async (req, res) => {
  const { patient, doctor, date } = req.body;

  const newAppointment = addAppointment({ patient, doctor, date });

  await mailer.sendMail(
    patient.email,
    'Appointment Confirmation',
    confirmationEmail(patient.name, date)
  );
  await mailer.sendMail(
    doctor.email,
    'Appointment Confirmation',
    confirmationEmail(doctor.name, date)
  );

  res.status(201).json({ message: 'Appointment created and confirmation emails sent.' });
});

export default router;
