import cron from 'node-cron';
import path from 'path';
import DailyBackupService from '../services/dailyBackupService.js';
import Backup from '../models/Backup.js';

const dailyBackupService = new DailyBackupService();

/**
 * Execute daily database backup at 3 AM server time
 */
async function executeDailyBackupJob() {
  console.log('Starting scheduled daily database backup...');
  
  try {
    const result = await dailyBackupService.executeDailyBackup();
    console.log('Daily backup job completed successfully');
    return result;
  } catch (error) {
    console.error('Daily backup job failed:', error);
    throw error;
  }
}

/**
 * Cleanup old backups based on retention policy
 */
async function cleanupOldBackupsJob() {
  console.log('Starting scheduled backup cleanup...');
  
  try {
    const deletedCount = await dailyBackupService.cleanupOldBackups();
    console.log(`Backup cleanup job completed: ${deletedCount} old backups deleted`);
    return deletedCount;
  } catch (error) {
    console.error('Backup cleanup job failed:', error);
    throw error;
  }
}

/**
 * Send backup statistics report
 */
async function sendBackupStatsReport() {
  console.log('Generating backup statistics report...');
  
  try {
    const stats = await dailyBackupService.getBackupStats();
    if (stats) {
      console.log('Backup Statistics Report:');
      console.log(`Total Backups: ${stats.total}`);
      console.log(`Successful: ${stats.successful}`);
      console.log(`Failed: ${stats.failed}`);
      console.log(`Success Rate: ${stats.successRate}%`);
    }
    return stats;
  } catch (error) {
    console.error('Failed to generate backup stats report:', error);
    return null;
  }
}

/**
 * Health check for backup system
 */
async function backupHealthCheck() {
  console.log('Performing backup system health check...');
  
  try {
    // Check if we can connect to S3
    const testKey = `health-check-${Date.now()}`;
    await dailyBackupService.uploadToS3(
      path.join(process.cwd(), 'package.json'), // Use existing file for test
      `health-check/${testKey}`
    );
    
    // Delete test file
    await dailyBackupService.deleteFromS3(`health-check/${testKey}`);
    
    console.log('Backup system health check passed');
    return true;
  } catch (error) {
    console.error('Backup system health check failed:', error);
    return false;
  }
}

// Schedule the daily backup job for 3 AM server time
const dailyBackupJob = cron.schedule('0 3 * * *', async () => {
  try {
    await executeDailyBackupJob();
  } catch (error) {
    console.error('Scheduled daily backup job failed:', error);
  }
}, {
  scheduled: false, // Don't start automatically, will be started by main app
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
});

// Schedule cleanup job for 4 AM (1 hour after backup)
const cleanupJob = cron.schedule('0 4 * * *', async () => {
  try {
    await cleanupOldBackupsJob();
  } catch (error) {
    console.error('Scheduled cleanup job failed:', error);
  }
}, {
  scheduled: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
});

// Schedule weekly statistics report on Sundays at 5 AM
const statsJob = cron.schedule('0 5 * * 0', async () => {
  try {
    await sendBackupStatsReport();
  } catch (error) {
    console.error('Scheduled stats job failed:', error);
  }
}, {
  scheduled: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
});

// Schedule monthly health check on the 1st day of month at 6 AM
const healthCheckJob = cron.schedule('0 6 1 * *', async () => {
  try {
    await backupHealthCheck();
  } catch (error) {
    console.error('Scheduled health check job failed:', error);
  }
}, {
  scheduled: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('Shutting down backup cron jobs...');
  dailyBackupJob.stop();
  cleanupJob.stop();
  statsJob.stop();
  healthCheckJob.stop();
});

process.on('SIGINT', () => {
  console.log('Shutting down backup cron jobs...');
  dailyBackupJob.stop();
  cleanupJob.stop();
  statsJob.stop();
  healthCheckJob.stop();
});

export {
  dailyBackupJob,
  cleanupJob,
  statsJob,
  healthCheckJob,
  executeDailyBackupJob,
  cleanupOldBackupsJob,
  sendBackupStatsReport,
  backupHealthCheck
};