// Actual backup job implementation (only loaded when S3 is configured)
import cron from 'node-cron';
import BackupService from '../services/backupService.js';
import Backup from '../models/Backup.js';
import BackupAlertService from '../services/backupAlertService.js';
import RestoreTestingService from '../services/restoreTestingService.js';

const backupService = new BackupService();
const backupAlertService = new BackupAlertService();
const restoreTestingService = new RestoreTestingService();

async function executeBackup() {
  const backupId = `full-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let backupRecord = null;
  
  try {
    console.log(`Starting scheduled full backup: ${backupId}`);
    
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
    const backupInfo = await backupService.createBackup('full');
    
    await backupRecord.markCompleted(
      backupInfo.s3Key,
      backupInfo.hash,
      backupInfo.size,
      {
        totalDocuments: 0,
        totalSize: backupInfo.size,
        compressionRatio: 0.7
      }
    );
    
    const verification = await backupService.verifyBackupIntegrity(backupInfo.s3Key);
    if (verification.verified) {
      await backupRecord.markVerified(backupInfo.hash);
    }
    
    console.log(`Full backup completed successfully: ${backupId}`);
    
    const duration = Math.round((Date.now() - backupRecord.startedAt.getTime()) / 1000);
    await backupAlertService.sendBackupSuccessNotification(
      backupId, 
      'full', 
      backupInfo.size, 
      duration
    );
    
    await cleanupOldBackups();
    
  } catch (error) {
    console.error(`Full backup failed: ${backupId}`, error);
    if (backupRecord) {
      await backupRecord.markFailed(error.message);
    }
    await backupAlertService.sendBackupFailureAlert(backupId, error.message, 'full');
  }
}

async function executeIncrementalBackup() {
  const backupId = `incremental-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let backupRecord = null;
  
  try {
    console.log(`Starting scheduled incremental backup: ${backupId}`);
    const latestFullBackup = await backupService.getLatestFullBackup();
    if (!latestFullBackup) {
      console.log('No full backup found, skipping incremental backup');
      return;
    }
    
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
    const backupInfo = await backupService.createBackup('incremental', latestFullBackup.backupId);
    
    await backupRecord.markCompleted(
      backupInfo.s3Key,
      backupInfo.hash,
      backupInfo.size,
      {
        totalDocuments: 0,
        totalSize: backupInfo.size,
        compressionRatio: 0.8
      }
    );
    
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
    await backupAlertService.sendBackupFailureAlert(backupId, error.message, 'incremental');
  }
}

async function cleanupOldBackups() {
  try {
    console.log('Starting cleanup of old backups...');
    const deletedCount = await backupService.cleanupOldBackups();
    const dbDeletedCount = await Backup.cleanupExpired();
    console.log(`Cleanup completed: ${deletedCount} S3 backups, ${dbDeletedCount} database records`);
  } catch (error) {
    console.error('Backup cleanup failed:', error);
  }
}

async function checkBackupHealth() {
  try {
    console.log('Starting backup health check...');
    await backupAlertService.checkBackupHealth();
    console.log('Backup health check completed');
  } catch (error) {
    console.error('Backup health check failed:', error);
  }
}

async function triggerManualBackup() {
  console.log('Manual backup triggered');
  await executeBackup();
}

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

// Schedule jobs
const fullBackupSchedule = process.env.BACKUP_SCHEDULE || '0 2 * * *';
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

const cleanupJob = cron.schedule('0 3 * * 0', async () => {
  console.log('Scheduled cleanup job started');
  await cleanupOldBackups();
}, {
  scheduled: true,
  timezone: 'UTC'
});

const statsJob = cron.schedule('0 1 * * *', async () => {
  await getBackupStats();
}, {
  scheduled: true,
  timezone: 'UTC'
});

const healthCheckJob = cron.schedule('0 */6 * * *', async () => {
  console.log('Scheduled backup health check started');
  await checkBackupHealth();
}, {
  scheduled: true,
  timezone: 'UTC'
});

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
