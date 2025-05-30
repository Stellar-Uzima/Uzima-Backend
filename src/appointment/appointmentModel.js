let appointments = [];

function addAppointment(appointment) {
  appointments.push(appointment);
  return appointment;
}

function getAppointments() {
  return appointments;
}

function getAppointmentsForTomorrow() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDate = tomorrow.toISOString().split('T')[0];
  return appointments.filter(appt => appt.date.startsWith(targetDate));
}

module.exports = {
  addAppointment,
  getAppointments,
  getAppointmentsForTomorrow,
};
