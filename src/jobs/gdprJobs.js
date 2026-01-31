import User from '../models/User.js';
import Record from '../models/Record.js';
import GDPRRequest from '../models/GDPRRequest.js';
import transactionLog from '../models/transactionLog.js';
import { withTransaction } from '../utils/withTransaction.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Export user data in background job
 */
export async function exportUserData(requestId) {
  try {
    const gdprRequest = await GDPRRequest.findById(requestId);
    if (!gdprRequest) {
      throw new Error('GDPR request not found');
    }

    // Update status to processing
    await GDPRRequest.findByIdAndUpdate(requestId, { status: 'processing' });

    const user = await User.findById(gdprRequest.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Collect all user-related data
    const userData = await assembleUserData(gdprRequest.userId);

    // Create export file
    const exportData = await createExportFile(userData, gdprRequest.exportFormat);

    // Update GDPR request with results
    await GDPRRequest.findByIdAndUpdate(requestId, {
      status: 'completed',
      exportData: userData,
      downloadUrl: exportData.filePath,
      processingCompletedAt: new Date(),
    });

    // Log completion
    await transactionLog.create({
      action: 'gdpr_export_completed',
      resource: 'user',
      resourceId: gdprRequest.userId,
      performedBy: gdprRequest.requestedBy,
      details: `Data export completed for user ${gdprRequest.userId}`,
      timestamp: new Date(),
    });

    console.log(`GDPR Export completed for user ${gdprRequest.userId}`);
  } catch (error) {
    console.error('GDPR Export Job Error:', error);

    // Update request with error
    await GDPRRequest.findByIdAndUpdate(requestId, {
      status: 'failed',
      errorMessage: error.message,
      processingCompletedAt: new Date(),
    });

    // Log error
    await transactionLog.create({
      action: 'gdpr_export_failed',
      resource: 'user',
      resourceId: requestId,
      performedBy: 'system',
      details: `Data export failed: ${error.message}`,
      timestamp: new Date(),
    });
  }
}

/**
 * Schedule user deletion in background job
 */
export async function scheduleUserDeletion(requestId) {
  try {
    const gdprRequest = await GDPRRequest.findById(requestId);
    if (!gdprRequest) {
      throw new Error('GDPR request not found');
    }

    // Update status to processing
    await GDPRRequest.findByIdAndUpdate(requestId, { status: 'processing' });

    // Soft delete the user immediately
    await withTransaction(async session => {
      await User.findByIdAndUpdate(
        gdprRequest.userId,
        {
          deletedAt: new Date(),
          deletedBy: gdprRequest.requestedBy,
        },
        { session }
      );

      // Soft delete all user's records
      await Record.updateMany(
        { createdBy: gdprRequest.userId, deletedAt: null },
        {
          deletedAt: new Date(),
          deletedBy: gdprRequest.requestedBy,
        },
        { session }
      );
    });

    // Schedule permanent deletion for 30 days from now
    const deletionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await GDPRRequest.findByIdAndUpdate(requestId, {
      status: 'completed',
      deletionScheduledAt: deletionDate,
      processingCompletedAt: new Date(),
    });

    // Log completion
    await transactionLog.create({
      action: 'gdpr_deletion_scheduled',
      resource: 'user',
      resourceId: gdprRequest.userId,
      performedBy: gdprRequest.requestedBy,
      details: `User soft-deleted and permanent deletion scheduled for ${deletionDate.toISOString()}`,
      timestamp: new Date(),
    });

    console.log(
      `GDPR Deletion scheduled for user ${gdprRequest.userId} on ${deletionDate.toISOString()}`
    );
  } catch (error) {
    console.error('GDPR Deletion Job Error:', error);

    // Update request with error
    await GDPRRequest.findByIdAndUpdate(requestId, {
      status: 'failed',
      errorMessage: error.message,
      processingCompletedAt: new Date(),
    });

    // Log error
    await transactionLog.create({
      action: 'gdpr_deletion_failed',
      resource: 'user',
      resourceId: requestId,
      performedBy: 'system',
      details: `Data deletion failed: ${error.message}`,
      timestamp: new Date(),
    });
  }
}

/**
 * Assemble all user-related data for export
 */
async function assembleUserData(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Get user's records
  const records = await Record.find({ createdBy: userId, deletedAt: null });

  // Get user's transaction logs
  const userLogs = await transactionLog
    .find({
      $or: [{ userId: userId.toString() }, { performedBy: userId.toString() }],
    })
    .sort({ timestamp: -1 });

  // Get user's GDPR requests
  const gdprRequests = await GDPRRequest.find({ userId });

  return {
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      security: {
        loginAttempts: user.security.loginAttempts,
        passwordChangedAt: user.security.passwordChangedAt,
        requireTwoFactorForSensitive: user.security.requireTwoFactorForSensitive,
      },
    },
    records: records.map(record => ({
      id: record._id,
      patientName: record.patientName,
      date: record.date,
      diagnosis: record.diagnosis,
      treatment: record.treatment,
      txHash: record.txHash,
      clientUUID: record.clientUUID,
      syncTimestamp: record.syncTimestamp,
      files: record.files,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })),
    transactionLogs: userLogs.map(log => ({
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      performedBy: log.performedBy,
      details: log.details,
      userId: log.userId,
      recordId: log.recordId,
      txHash: log.txHash,
      timestamp: log.timestamp,
    })),
    gdprRequests: gdprRequests.map(req => ({
      id: req._id,
      requestType: req.requestType,
      status: req.status,
      requestReason: req.requestReason,
      createdAt: req.createdAt,
      processingStartedAt: req.processingStartedAt,
      processingCompletedAt: req.processingCompletedAt,
    })),
    exportMetadata: {
      exportedAt: new Date().toISOString(),
      dataVersion: '1.0',
      totalRecords: records.length,
      totalLogs: userLogs.length,
      totalGDPRRequests: gdprRequests.length,
    },
  };
}

/**
 * Create export file in specified format
 */
async function createExportFile(userData, format) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `user-data-export-${timestamp}.${format}`;
  const filePath = path.join(__dirname, '../exports', filename);

  // Ensure exports directory exists
  const exportsDir = path.join(__dirname, '../exports');
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  if (format === 'json') {
    fs.writeFileSync(filePath, JSON.stringify(userData, null, 2));
  } else if (format === 'csv') {
    const csvData = convertToCSV(userData);
    fs.writeFileSync(filePath, csvData);
  }

  return {
    filePath,
    filename,
    size: fs.statSync(filePath).size,
  };
}

/**
 * Convert user data to CSV format
 */
function convertToCSV(userData) {
  const lines = [];

  // User information
  lines.push('Section,Field,Value');
  lines.push(`User,ID,${userData.user.id}`);
  lines.push(`User,Username,${userData.user.username}`);
  lines.push(`User,Email,${userData.user.email}`);
  lines.push(`User,Role,${userData.user.role}`);
  lines.push(`User,Created At,${userData.user.createdAt}`);

  // Records
  lines.push('');
  lines.push('Records,ID,Patient Name,Date,Diagnosis,Treatment,TxHash,Created At');
  userData.records.forEach(record => {
    lines.push(
      `Record,${record.id},${record.patientName},${record.date},${record.diagnosis},${record.treatment},${record.txHash},${record.createdAt}`
    );
  });

  // Transaction logs
  lines.push('');
  lines.push('Transaction Logs,Action,Resource,Details,Timestamp');
  userData.transactionLogs.forEach(log => {
    lines.push(`Log,${log.action},${log.resource},"${log.details}",${log.timestamp}`);
  });

  return lines.join('\n');
}

/**
 * Cron job to process permanent deletions
 */
export function schedulePermanentDeletionJob() {
  // Run every day at 2 AM
  cron.schedule(
    '0 2 * * *',
    async () => {
      try {
        const now = new Date();

        // Find completed deletion requests that are ready for permanent deletion
        const requestsToDelete = await GDPRRequest.find({
          requestType: 'delete',
          status: 'completed',
          deletionScheduledAt: { $lte: now },
        });

        for (const request of requestsToDelete) {
          await processPermanentDeletion(request._id);
        }

        console.log(
          `[${now.toISOString()}] Permanent deletion job completed. Processed ${requestsToDelete.length} requests.`
        );
      } catch (error) {
        console.error('Permanent deletion job error:', error);
      }
    },
    {
      scheduled: true,
      timezone: 'UTC',
    }
  );
}

/**
 * Process permanent deletion of user data
 */
async function processPermanentDeletion(requestId) {
  try {
    const gdprRequest = await GDPRRequest.findById(requestId);
    if (!gdprRequest) {
      throw new Error('GDPR request not found');
    }

    // Permanently delete user and all related data
    await withTransaction(async session => {
      // Delete user
      await User.findByIdAndDelete(gdprRequest.userId, { session });

      // Delete all user's records
      await Record.deleteMany({ createdBy: gdprRequest.userId }, { session });

      // Delete user's transaction logs
      await transactionLog.deleteMany(
        {
          $or: [
            { userId: gdprRequest.userId.toString() },
            { performedBy: gdprRequest.userId.toString() },
          ],
        },
        { session }
      );
    });

    // Update GDPR request
    await GDPRRequest.findByIdAndUpdate(requestId, {
      deletionCompletedAt: new Date(),
    });

    // Log permanent deletion
    await transactionLog.create({
      action: 'gdpr_permanent_deletion_completed',
      resource: 'user',
      resourceId: gdprRequest.userId,
      performedBy: 'system',
      details: `Permanent deletion completed for user ${gdprRequest.userId}`,
      timestamp: new Date(),
    });

    console.log(`Permanent deletion completed for user ${gdprRequest.userId}`);
  } catch (error) {
    console.error('Permanent deletion error:', error);

    // Log error
    await transactionLog.create({
      action: 'gdpr_permanent_deletion_failed',
      resource: 'user',
      resourceId: requestId,
      performedBy: 'system',
      details: `Permanent deletion failed: ${error.message}`,
      timestamp: new Date(),
    });
  }
}
