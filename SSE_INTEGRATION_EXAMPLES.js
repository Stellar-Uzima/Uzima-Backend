/* eslint-disable prettier/prettier */
/**
 * SSE Integration Examples
 * 
 * This file shows how to integrate SSE event emission into existing controllers
 * and services throughout the application.
 * 
 * These are example snippets to help developers understand how to emit events
 * when records are created, updated, or other important actions occur.
 */

import {
  emitRecordCreated,
  emitRecordUpdated,
  emitSystemAlert,
  emitNotification,
  emitPrescriptionStatusChanged,
  emitAppointmentReminder,
} from '../utils/eventEmitter.js';

/**
 * Example 1: Emit event in Record Controller
 * 
 * File: src/controllers/recordController.js
 */
export async function createRecordExample(req, res) {
  try {
    // Create the record
    const record = await Record.create({
      title: req.body.title,
      content: req.body.content,
      // ... other fields
    });

    // Emit SSE event to notify all connected clients
    emitRecordCreated(record);

    // Or send to specific user only
    // emitRecordCreated(record, req.user._id);

    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Example 2: Emit event in Record Update
 */
export async function updateRecordExample(req, res) {
  try {
    const record = await Record.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    // Emit update event
    emitRecordUpdated(record);

    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Example 3: Emit system alert
 * 
 * File: src/cron/backupJob.js or any background job
 */
export async function backupJobExample() {
  try {
    // Perform backup
    await performBackup();

    // Notify all connected admins of successful backup
    emitSystemAlert(
      'Database backup completed successfully',
      'info',
      {
        timestamp: new Date().toISOString(),
        duration: '5 minutes',
        size: '500MB',
      }
    );
  } catch (error) {
    // Notify of backup failure
    emitSystemAlert(
      'Database backup failed',
      'error',
      {
        error: error.message,
        timestamp: new Date().toISOString(),
      }
    );
  }
}

/**
 * Example 4: Emit notification event
 * 
 * File: src/controllers/notificationController.js
 */
export async function createNotificationExample(req, res) {
  try {
    const notification = await Notification.create({
      userId: req.user._id,
      title: req.body.title,
      message: req.body.message,
      type: req.body.type, // 'reminder', 'alert', 'info'
    });

    // Emit notification event to specific user
    emitNotification(notification, req.user._id);

    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Example 5: Emit prescription status change
 * 
 * File: src/controllers/prescriptionController.js
 */
export async function updatePrescriptionStatusExample(req, res) {
  try {
    const prescription = await Prescription.findById(req.params.id);
    const previousStatus = prescription.status;

    prescription.status = req.body.status; // 'pending', 'approved', 'filled'
    await prescription.save();

    // Emit status change event
    emitPrescriptionStatusChanged(prescription, prescription.status);

    res.json(prescription);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Example 6: Emit appointment reminder
 * 
 * File: src/cron/reminderJob.js
 */
export async function appointmentReminderJobExample() {
  try {
    // Find appointments scheduled for the next hour
    const tomorrow = new Date();
    tomorrow.setHours(tomorrow.getHours() + 1);

    const upcomingAppointments = await Appointment.find({
      scheduledTime: {
        $gte: new Date(),
        $lte: tomorrow,
      },
      reminderSent: false,
    });

    // Emit reminder for each appointment
    for (const appointment of upcomingAppointments) {
      emitAppointmentReminder(appointment, appointment.userId);

      // Mark reminder as sent
      appointment.reminderSent = true;
      await appointment.save();
    }

    console.log(`Sent ${upcomingAppointments.length} appointment reminders`);
  } catch (error) {
    console.error('Failed to send appointment reminders:', error);
  }
}

/**
 * Example 7: Emit custom event
 * 
 * File: Any service or controller
 */
export async function customEventExample(req, res) {
  try {
    // Perform some action
    const result = await someAction();

    // Emit custom event
    const { emitCustomEvent } = await import('../utils/eventEmitter.js');
    emitCustomEvent('custom.actionCompleted', {
      action: 'dataSync',
      recordsProcessed: 1500,
      duration: '2.5 seconds',
      status: 'success',
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Example 8: Emit event in batch operations
 * 
 * File: src/controllers/recordController.js
 */
export async function bulkCreateRecordsExample(req, res) {
  try {
    const records = await Record.insertMany(req.body.records);

    // Emit event for each created record
    records.forEach(record => {
      emitRecordCreated(record);
    });

    // Or emit a single bulk event
    emitSystemAlert(
      `Bulk created ${records.length} records`,
      'info',
      { recordCount: records.length }
    );

    res.status(201).json({ count: records.length, records });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Example 9: Error notification
 * 
 * File: src/middleware/errorHandler.js or async error handlers
 */
export async function errorNotificationExample(error, req, res, next) {
  try {
    // Handle the error
    const statusCode = error.statusCode || 500;
    
    // If it's a critical error, notify admins
    if (statusCode >= 500) {
      emitSystemAlert(
        `Server error: ${error.message}`,
        'error',
        {
          statusCode,
          path: req.path,
          method: req.method,
          timestamp: new Date().toISOString(),
        }
      );
    }

    res.status(statusCode).json({ error: error.message });
  } catch (err) {
    next(err);
  }
}

/**
 * Example 10: Event emission with user context
 * 
 * File: Any controller
 */
export async function contextAwareEventExample(req, res) {
  try {
    const record = await Record.create(req.body);

    // Send event to all users (broadcast)
    emitRecordCreated(record);

    // Send notification only to current user
    emitNotification({
      _id: new Date().getTime(),
      title: 'Your record was created',
      message: `Record "${record.title}" created successfully`,
      type: 'info',
      read: false,
      createdAt: new Date(),
    }, req.user._id);

    // Send alert to admins (you'd need to fetch admin IDs)
    const admins = await User.find({ role: 'admin' });
    admins.forEach(admin => {
      emitSystemAlert(
        `New record created: ${record.title}`,
        'info',
        { recordId: record._id },
        admin._id
      );
    });

    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Integration Checklist
 * 
 * To integrate SSE into your controllers:
 * 
 * 1. Import the event emitter utilities:
 *    import { emitRecordCreated, emitSystemAlert, ... } from '../utils/eventEmitter.js';
 * 
 * 2. Add event emission after successful operations:
 *    - After create: emitRecordCreated(record);
 *    - After update: emitRecordUpdated(record);
 *    - On status change: emitPrescriptionStatusChanged(prescription, newStatus);
 *    - On errors: emitSystemAlert(message, 'error');
 * 
 * 3. Consider the context:
 *    - Broadcast events (null userId) for public updates
 *    - Send to specific user for personal notifications
 *    - Send to admin for system-level alerts
 * 
 * 4. Keep payloads minimal:
 *    - Send IDs and essential data
 *    - Let clients fetch full records if needed
 *    - Reduces bandwidth and latency
 * 
 * 5. Test with SSE client:
 *    - Use browser DevTools to test EventSource
 *    - Monitor network tab for event stream
 *    - Check console for received events
 */

export default {
  createRecordExample,
  updateRecordExample,
  backupJobExample,
  createNotificationExample,
  updatePrescriptionStatusExample,
  appointmentReminderJobExample,
  customEventExample,
  bulkCreateRecordsExample,
  errorNotificationExample,
  contextAwareEventExample,
};
