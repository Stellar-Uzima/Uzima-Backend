/* eslint-disable prettier/prettier */
import eventManager from '../services/eventManager.js';
import { logger } from './logger.js';

/**
 * Utility module for emitting SSE events throughout the application
 * This provides a simple interface for other services and controllers to send events
 */

/**
 * Emit a record created event
 * @param {Object} record - The created record
 * @param {string} userId - Optional: send to specific user
 */
export function emitRecordCreated(record, userId = null) {
  try {
    eventManager.broadcastEvent('record.created', {
      recordId: record._id,
      title: record.title,
      type: record.type,
      createdAt: record.createdAt,
    }, userId);
  } catch (error) {
    logger.error('Failed to emit record.created event:', error);
  }
}

/**
 * Emit a record updated event
 * @param {Object} record - The updated record
 * @param {string} userId - Optional: send to specific user
 */
export function emitRecordUpdated(record, userId = null) {
  try {
    eventManager.broadcastEvent('record.updated', {
      recordId: record._id,
      title: record.title,
      updatedAt: record.updatedAt,
    }, userId);
  } catch (error) {
    logger.error('Failed to emit record.updated event:', error);
  }
}

/**
 * Emit a system alert event
 * @param {string} message - Alert message
 * @param {string} level - Alert level: 'info', 'warning', 'error'
 * @param {Object} details - Additional alert details
 * @param {string} userId - Optional: send to specific user
 */
export function emitSystemAlert(message, level = 'info', details = {}, userId = null) {
  try {
    eventManager.broadcastEvent('system.alert', {
      message,
      level,
      details,
      timestamp: new Date().toISOString(),
    }, userId);
  } catch (error) {
    logger.error('Failed to emit system.alert event:', error);
  }
}

/**
 * Emit a notification event
 * @param {Object} notification - Notification object
 * @param {string} userId - Optional: send to specific user
 */
export function emitNotification(notification, userId = null) {
  try {
    eventManager.broadcastEvent('notification', {
      id: notification._id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      read: notification.read,
      createdAt: notification.createdAt,
    }, userId);
  } catch (error) {
    logger.error('Failed to emit notification event:', error);
  }
}

/**
 * Emit a custom event
 * @param {string} eventType - Event type name
 * @param {Object} data - Event data
 * @param {string} userId - Optional: send to specific user
 */
export function emitCustomEvent(eventType, data, userId = null) {
  try {
    eventManager.broadcastEvent(eventType, data, userId);
  } catch (error) {
    logger.error(`Failed to emit ${eventType} event:`, error);
  }
}

/**
 * Emit a prescription status change event
 * @param {Object} prescription - Prescription object
 * @param {string} status - New status
 * @param {string} userId - Optional: send to specific user
 */
export function emitPrescriptionStatusChanged(prescription, status, userId = null) {
  try {
    eventManager.broadcastEvent('prescription.statusChanged', {
      prescriptionId: prescription._id,
      status,
      previousStatus: prescription.status,
      updatedAt: new Date().toISOString(),
    }, userId);
  } catch (error) {
    logger.error('Failed to emit prescription.statusChanged event:', error);
  }
}

/**
 * Emit an appointment reminder event
 * @param {Object} appointment - Appointment object
 * @param {string} userId - Optional: send to specific user
 */
export function emitAppointmentReminder(appointment, userId = null) {
  try {
    eventManager.broadcastEvent('appointment.reminder', {
      appointmentId: appointment._id,
      title: appointment.title,
      scheduledTime: appointment.scheduledTime,
      reminderSentAt: new Date().toISOString(),
    }, userId);
  } catch (error) {
    logger.error('Failed to emit appointment.reminder event:', error);
  }
}

/**
 * Get current event manager statistics
 * Useful for monitoring and debugging
 */
export function getEventStats() {
  return eventManager.getStats();
}

export default {
  emitRecordCreated,
  emitRecordUpdated,
  emitSystemAlert,
  emitNotification,
  emitCustomEvent,
  emitPrescriptionStatusChanged,
  emitAppointmentReminder,
  getEventStats,
};
