const express = require('express');
const router = express.Router();
const { addAppointment } = require('../models/appointment.model');
const { sendMail } = require('../services/email.service');
const confirmationEmail = require('../templates/confirmationEmail');

router.post('/', async (req, res) => {
  const { patient, doctor, date } = req.body;

  const newAppointment = addAppointment({ patient, doctor, date });

  await sendMail(patient.email, 'Appointment Confirmation', confirmationEmail(patient.name, date));
  await sendMail(doctor.email, 'Appointment Confirmation', confirmationEmail(doctor.name, date));

  res.status(201).json({ message: 'Appointment created and confirmation emails sent.' });
});

module.exports = router;
