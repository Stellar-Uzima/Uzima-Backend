import cron from 'node-cron';
import BackupService from '../services/backupService.js';
import Backup from '../models/Backup.js';
import BackupAlertService from '../services/backupAlertService.js';
import RestoreTestingService from '../services/restoreTestingService.js';

const backupService = new BackupService();
const backupAlertService = new BackupAlertService();
const restoreTestingService = new RestoreTestingService();

/**
 * Execute backup process (full backup)
 */
async function executeBackup() {
  const backupId = `full-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let backupRecord = null;
  
  try {
    console.log(`Starting scheduled full backup: ${backupId}`);
    
    // Create backup record in database
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() + (parseInt(process.env.BACKUP_RETENTION_DAYS) || 30));
    
    backupRecord = new Backup({
      backupId,
      backupType: 'full',
      status: 'in_progress',
      database: backupService.extractDatabaseName(process.env.MONGO_URI),
      retentionDate
    });
    
    await backupRecord.save();
    
    // Execute full backup
    const backupInfo = await backupService.createBackup('full');
    
    // Update backup record with completion details
    await backupRecord.markCompleted(
      backupInfo.s3Key,
      backupInfo.hash,
      backupInfo.size,
      {
        totalDocuments: 0, // This would be populated from actual dump stats
        totalSize: backupInfo.size,
        compressionRatio: 0.7 // Estimated compression ratio
      }
    );
    
    // Verify backup integrity
    const verification = await backupService.verifyBackupIntegrity(backupInfo.s3Key);
    if (verification.verified) {
      await backupRecord.markVerified(backupInfo.hash);
    }
    
    console.log(`Full backup completed successfully: ${backupId}`);
    
    // Send success notification
    const duration = Math.round((Date.now() - backupRecord.startedAt.getTime()) / 1000);
    await backupAlertService.sendBackupSuccessNotification(
      backupId, 
      'full', 
      backupInfo.size, 
      duration
    );
    
    // Cleanup old backups
    await cleanupOldBackups();
    
  } catch (error) {
    console.error(`Full backup failed: ${backupId}`, error);
    
    if (backupRecord) {
      await backupRecord.markFailed(error.message);
    }
    
    // Send notification about backup failure
    await backupAlertService.sendBackupFailureAlert(backupId, error.message, 'full');
  }
}

/**
 * Execute incremental backup process
 */
async function executeIncrementalBackup() {
  const backupId = `incremental-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let backupRecord = null;
  
  try {
    console.log(`Starting scheduled incremental backup: ${backupId}`);
    
    // Get the latest full backup to use as parent
    const latestFullBackup = await backupService.getLatestFullBackup();
    if (!latestFullBackup) {
      console.log('No full backup found, skipping incremental backup');
      return;
    }
    
    // Create backup record in database
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() + (parseInt(process.env.BACKUP_RETENTION_DAYS) || 30));
    
    backupRecord = new Backup({
      backupId,
      backupType: 'incremental',
      parentBackupId: latestFullBackup.backupId,
      status: 'in_progress',
      database: backupService.extractDatabaseName(process.env.MONGO_URI),
      retentionDate
    });
    
    await backupRecord.save();
    
    // Execute incremental backup
    const backupInfo = await backupService.createBackup('incremental', latestFullBackup.backupId);
    
    // Update backup record with completion details
    await backupRecord.markCompleted(
      backupInfo.s3Key,
      backupInfo.hash,
      backupInfo.size,
      {
        totalDocuments: 0, // This would be populated from actual dump stats
        totalSize: backupInfo.size,
        compressionRatio: 0.8 // Incremental backups typically have better compression
      }
    );
    
    // Verify backup integrity
    const verification = await backupService.verifyBackupIntegrity(backupInfo.s3Key);
    if (verification.verified) {
      await backupRecord.markVerified(backupInfo.hash);
    }
    
    console.log(`Incremental backup completed successfully: ${backupId}`);
    
  } catch (error) {
    console.error(`Incremental backup failed: ${backupId}`, error);
    
    if (backupRecord) {
      await backupRecord.markFailed(error.message);
    }
    
    // Send notification about backup failure
    await backupAlertService.sendBackupFailureAlert(backupId, error.message, 'incremental');
  }
}

/**
 * Cleanup old backups
 */
async function cleanupOldBackups() {
  try {
    console.log('Starting cleanup of old backups...');
    
    // Cleanup from S3
    const deletedCount = await backupService.cleanupOldBackups();
    
    // Cleanup from database
    const dbDeletedCount = await Backup.cleanupExpired();
    
    console.log(`Cleanup completed: ${deletedCount} S3 backups, ${dbDeletedCount} database records`);
    
  } catch (error) {
    console.error('Backup cleanup failed:', error);
  }
}

/**
 * Check backup health and send alerts
 */
async function checkBackupHealth() {
  try {
    console.log('Starting backup health check...');
    await backupAlertService.checkBackupHealth();
    console.log('Backup health check completed');
  } catch (error) {
    console.error('Backup health check failed:', error);
  }
}

/**
 * Notify about backup failure (legacy function - now handled by BackupAlertService)
 */
async function notifyBackupFailure(backupId, errorMessage) {
  try {
    console.error(`BACKUP FAILURE NOTIFICATION: ${backupId} - ${errorMessage}`);
    // This function is now deprecated - alerts are handled by BackupAlertService
  } catch (error) {
    console.error('Failed to send backup failure notification:', error);
  }
}

/**
 * Get backup statistics
 */
async function getBackupStats() {
  try {
    const stats = await Backup.getBackupStats();
    console.log('Backup Statistics:', JSON.stringify(stats, null, 2));
    return stats;
  } catch (error) {
    console.error('Failed to get backup statistics:', error);
    return null;
  }
}

/**
 * Manual backup trigger (for testing or emergency backups)
 */
async function triggerManualBackup() {
  console.log('Manual backup triggered');
  await executeBackup();
}

// Schedule backup jobs
// Default: Daily full backup at 2:00 AM UTC (configurable via BACKUP_SCHEDULE env var)
const fullBackupSchedule = process.env.BACKUP_SCHEDULE || '0 2 * * *';
// Default: Hourly incremental backup (configurable via INCREMENTAL_BACKUP_SCHEDULE env var)
const incrementalBackupSchedule = process.env.INCREMENTAL_BACKUP_SCHEDULE || '0 * * * *';

console.log(`Scheduling full backup job with cron pattern: ${fullBackupSchedule}`);
console.log(`Scheduling incremental backup job with cron pattern: ${incrementalBackupSchedule}`);

const fullBackupJob = cron.schedule(fullBackupSchedule, async () => {
  console.log('Scheduled full backup job started');
  await executeBackup();
}, {
  scheduled: true,
  timezone: 'UTC'
});

const incrementalBackupJob = cron.schedule(incrementalBackupSchedule, async () => {
  console.log('Scheduled incremental backup job started');
  await executeIncrementalBackup();
}, {
  scheduled: true,
  timezone: 'UTC'
});

// Schedule weekly cleanup job (Sundays at 3:00 AM UTC)
const cleanupJob = cron.schedule('0 3 * * 0', async () => {
  console.log('Scheduled cleanup job started');
  await cleanupOldBackups();
}, {
  scheduled: true,
  timezone: 'UTC'
});

// Schedule daily stats logging (Daily at 1:00 AM UTC)
const statsJob = cron.schedule('0 1 * * *', async () => {
  await getBackupStats();
}, {
  scheduled: true,
  timezone: 'UTC'
});

// Schedule backup health check (Every 6 hours)
const healthCheckJob = cron.schedule('0 */6 * * *', async () => {
  console.log('Scheduled backup health check started');
  await checkBackupHealth();
}, {
  scheduled: true,
  timezone: 'UTC'
});

// Schedule quarterly restore testing (First day of each quarter at 4:00 AM UTC)
const quarterlyTestJob = cron.schedule('0 4 1 1,4,7,10 *', async () => {
  console.log('Scheduled quarterly restore testing started');
  try {
    await restoreTestingService.runQuarterlyRestoreTest();
    console.log('Quarterly restore testing completed successfully');
  } catch (error) {
    console.error('Quarterly restore testing failed:', error);
  }
}, {
  scheduled: true,
  timezone: 'UTC'
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Stopping backup cron jobs...');
  fullBackupJob.stop();
  incrementalBackupJob.stop();
  cleanupJob.stop();
  statsJob.stop();
  healthCheckJob.stop();
  quarterlyTestJob.stop();
});

process.on('SIGINT', () => {
  console.log('Stopping backup cron jobs...');
  fullBackupJob.stop();
  incrementalBackupJob.stop();
  cleanupJob.stop();
  statsJob.stop();
  healthCheckJob.stop();
  quarterlyTestJob.stop();
});

export { 
  executeBackup,
  executeIncrementalBackup,
  cleanupOldBackups, 
  triggerManualBackup, 
  getBackupStats,
  checkBackupHealth,
  fullBackupJob,
  incrementalBackupJob,
  cleanupJob,
  statsJob,
  healthCheckJob,
  quarterlyTestJob
};