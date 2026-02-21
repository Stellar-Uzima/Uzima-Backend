// Backup job loader - loads appropriate implementation based on configuration
import cron from 'node-cron';
import BackupService from '../services/backupService.js';
import Backup from '../models/Backup.js';
import BackupAlertService from '../services/backupAlertService.js';

const backupService = new BackupService();
const backupAlertService = new BackupAlertService();
const useLocalStorage = backupService.useLocalStorage;

// Schedule configuration - default to 3 AM server time
const fullBackupSchedule = process.env.BACKUP_SCHEDULE || '0 3 * * *';
const serverTimezone = process.env.BACKUP_TIMEZONE || 'UTC';

console.log(`Backup system initialized:`);
console.log(`  - Storage type: ${useLocalStorage ? 'local' : 'S3'}`);
console.log(`  - Full backup schedule: ${fullBackupSchedule} (${serverTimezone})`);
console.log(`  - Retention days: ${backupService.retentionDays}`);

async function executeBackup() {
  const backupId = `full-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  let backupRecord = null;

  try {
    console.log(`Starting scheduled full backup: ${backupId}`);

    const retentionDate = new Date();
    retentionDate.setDate(
      retentionDate.getDate() + (parseInt(process.env.BACKUP_RETENTION_DAYS) || 30)
    );

    backupRecord = new Backup({
      backupId,
      backupType: 'full',
      status: 'in_progress',
      database: backupService.extractDatabaseName(process.env.MONGO_URI),
      retentionDate,
    });

    await backupRecord.save();
    const backupInfo = await backupService.createBackup('full');

    await backupRecord.markCompleted(backupInfo.s3Key, backupInfo.hash, backupInfo.size, {
      totalDocuments: 0,
      totalSize: backupInfo.size,
      compressionRatio: backupInfo.originalSize ? (backupInfo.size / backupInfo.originalSize) : 0.7,
      storageType: backupInfo.storageType,
    });

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
    retentionDate.setDate(
      retentionDate.getDate() + (parseInt(process.env.BACKUP_RETENTION_DAYS) || 30)
    );

    backupRecord = new Backup({
      backupId,
      backupType: 'incremental',
      parentBackupId: latestFullBackup.backupId,
      status: 'in_progress',
      database: backupService.extractDatabaseName(process.env.MONGO_URI),
      retentionDate,
    });

    await backupRecord.save();
    const backupInfo = await backupService.createBackup('incremental', latestFullBackup.backupId);

    await backupRecord.markCompleted(backupInfo.s3Key, backupInfo.hash, backupInfo.size, {
      totalDocuments: 0,
      totalSize: backupInfo.size,
      compressionRatio: 0.8,
      storageType: backupInfo.storageType,
    });

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
    console.log(
      `Cleanup completed: ${deletedCount} storage backups, ${dbDeletedCount} database records`
    );
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
const incrementalBackupSchedule = process.env.INCREMENTAL_BACKUP_SCHEDULE || '0 * * * *';

console.log(`Scheduling incremental backup job with cron pattern: ${incrementalBackupSchedule}`);

const fullBackupJob = cron.schedule(
  fullBackupSchedule,
  async () => {
    console.log('Scheduled full backup job started');
    await executeBackup();
  },
  {
    scheduled: true,
    timezone: serverTimezone,
  }
);

const incrementalBackupJob = cron.schedule(
  incrementalBackupSchedule,
  async () => {
    console.log('Scheduled incremental backup job started');
    await executeIncrementalBackup();
  },
  {
    scheduled: true,
    timezone: serverTimezone,
  }
);

// Cleanup job runs daily at 4 AM
const cleanupJob = cron.schedule(
  '0 4 * * *',
  async () => {
    console.log('Scheduled cleanup job started');
    await cleanupOldBackups();
  },
  {
    scheduled: true,
    timezone: serverTimezone,
  }
);

// Stats job runs daily at 1 AM
const statsJob = cron.schedule(
  '0 1 * * *',
  async () => {
    await getBackupStats();
  },
  {
    scheduled: true,
    timezone: serverTimezone,
  }
);

// Health check runs every 6 hours
const healthCheckJob = cron.schedule(
  '0 */6 * * *',
  async () => {
    console.log('Scheduled backup health check started');
    await checkBackupHealth();
  },
  {
    scheduled: true,
    timezone: serverTimezone,
  }
);

process.on('SIGTERM', () => {
  console.log('Stopping backup cron jobs...');
  fullBackupJob.stop();
  incrementalBackupJob.stop();
  cleanupJob.stop();
  statsJob.stop();
  healthCheckJob.stop();
});

process.on('SIGINT', () => {
  console.log('Stopping backup cron jobs...');
  fullBackupJob.stop();
  incrementalBackupJob.stop();
  cleanupJob.stop();
  statsJob.stop();
  healthCheckJob.stop();
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
};
