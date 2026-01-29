import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import cron from 'node-cron';
import { createNotification } from './notificationService.js';
import Backup from '../models/Backup.js';

class DailyBackupService {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    this.bucketName = process.env.S3_BACKUP_BUCKET || 'uzima-backups';
    this.backupPrefix = process.env.S3_BACKUP_PREFIX || 'daily-backups/';
    this.retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS) || 30;
    this.mongoUri = process.env.MONGO_URI;
    this.backupDir = path.join(process.cwd(), 'backups');
  }

  /**
   * Execute daily database backup
   */
  async executeDailyBackup() {
    const backupId = `daily-backup-${new Date().toISOString().slice(0, 10)}`;
    const timestamp = new Date().toISOString();
    
    try {
      console.log(`Starting daily backup: ${backupId}`);
      
      // Create backup directory if it doesn't exist
      await fs.mkdir(this.backupDir, { recursive: true });
      
      // Generate backup filename
      const backupFilename = `${backupId}.tar.gz`;
      const localBackupPath = path.join(this.backupDir, backupFilename);
      
      // Extract database name from URI
      const dbName = this.extractDatabaseName();
      
      // Execute mongodump
      await this.runMongodump(dbName, localBackupPath);
      
      // Get file stats
      const stats = await fs.stat(localBackupPath);
      const fileSize = stats.size;
      
      // Upload to S3
      const s3Key = `${this.backupPrefix}${backupFilename}`;
      await this.uploadToS3(localBackupPath, s3Key);
      
      // Save backup record to database
      const backupRecord = new Backup({
        backupId,
        backupType: 'daily',
        status: 'completed',
        database: dbName,
        s3Key,
        size: fileSize,
        startedAt: new Date(timestamp),
        completedAt: new Date(),
        metadata: {
          backupMethod: 'mongodump',
          compression: 'gzip',
          retentionDays: this.retentionDays
        }
      });
      
      await backupRecord.save();
      
      // Cleanup local file
      await fs.unlink(localBackupPath);
      
      // Send success notification
      await this.sendBackupNotification(backupId, 'success', fileSize);
      
      console.log(`Daily backup completed successfully: ${backupId}`);
      
      return {
        success: true,
        backupId,
        s3Key,
        size: fileSize
      };
      
    } catch (error) {
      console.error(`Daily backup failed: ${backupId}`, error);
      
      // Save failed backup record
      const backupRecord = new Backup({
        backupId,
        backupType: 'daily',
        status: 'failed',
        database: this.extractDatabaseName(),
        startedAt: new Date(timestamp),
        completedAt: new Date(),
        errorMessage: error.message
      });
      
      await backupRecord.save();
      
      // Send failure notification
      await this.sendBackupNotification(backupId, 'failure', 0, error.message);
      
      throw error;
    }
  }

  /**
   * Run mongodump command
   */
  async runMongodump(databaseName, outputPath) {
    return new Promise((resolve, reject) => {
      const dumpArgs = [
        '--uri', this.mongoUri,
        '--db', databaseName,
        '--archive=' + outputPath.replace('.tar.gz', ''),
        '--gzip'
      ];
      
      const mongodump = spawn('mongodump', dumpArgs);
      
      let stdout = '';
      let stderr = '';
      
      mongodump.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      mongodump.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      mongodump.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`mongodump failed with code ${code}: ${stderr}`));
        }
      });
      
      mongodump.on('error', (error) => {
        reject(new Error(`Failed to spawn mongodump: ${error.message}`));
      });
    });
  }

  /**
   * Upload backup file to S3
   */
  async uploadToS3(localPath, s3Key) {
    try {
      const fileContent = await fs.readFile(localPath);
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: 'application/gzip',
        Metadata: {
          'backup-date': new Date().toISOString(),
          'backup-type': 'daily'
        }
      });
      
      await this.s3Client.send(command);
      console.log(`Backup uploaded to S3: ${s3Key}`);
      
    } catch (error) {
      throw new Error(`Failed to upload backup to S3: ${error.message}`);
    }
  }

  /**
   * Cleanup old backups based on retention policy
   */
  async cleanupOldBackups() {
    try {
      console.log('Starting cleanup of old daily backups...');
      
      // Get all daily backups from database
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
      
      const oldBackups = await Backup.find({
        backupType: 'daily',
        startedAt: { $lt: cutoffDate },
        status: 'completed'
      });
      
      let deletedCount = 0;
      
      for (const backup of oldBackups) {
        try {
          // Delete from S3
          await this.deleteFromS3(backup.s3Key);
          
          // Delete database record
          await backup.remove();
          
          deletedCount++;
          console.log(`Deleted old backup: ${backup.backupId}`);
        } catch (error) {
          console.error(`Failed to delete backup ${backup.backupId}:`, error);
        }
      }
      
      console.log(`Cleanup completed: ${deletedCount} old backups deleted`);
      
      // Send cleanup summary notification
      if (deletedCount > 0) {
        await this.sendCleanupNotification(deletedCount);
      }
      
      return deletedCount;
      
    } catch (error) {
      console.error('Backup cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Delete backup from S3
   */
  async deleteFromS3(s3Key) {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key
      });
      
      await this.s3Client.send(command);
      
    } catch (error) {
      throw new Error(`Failed to delete backup from S3: ${error.message}`);
    }
  }

  /**
   * Send backup notification email
   */
  async sendBackupNotification(backupId, status, size = 0, errorMessage = '') {
    try {
      const subject = status === 'success' 
        ? `✅ Daily Database Backup Successful - ${backupId}`
        : `❌ Daily Database Backup Failed - ${backupId}`;
      
      const content = status === 'success'
        ? `
        <h2>Daily Database Backup Successful</h2>
        <p><strong>Backup ID:</strong> ${backupId}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Size:</strong> ${(size / (1024 * 1024)).toFixed(2)} MB</p>
        <p><strong>Status:</strong> Completed successfully</p>
        <p>Your daily database backup has been created and stored securely in S3.</p>
        `
        : `
        <h2>Daily Database Backup Failed</h2>
        <p><strong>Backup ID:</strong> ${backupId}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Error:</strong> ${errorMessage}</p>
        <p><strong>Status:</strong> Failed</p>
        <p style="color: red;">The daily database backup failed. Please investigate immediately.</p>
        `;
      
      const adminEmails = this.getAdminEmails();
      
      for (const email of adminEmails) {
        await createNotification({
          type: 'backup_notification',
          recipient: { email },
          subject,
          content: {
            html: content,
            text: content.replace(/<[^>]*>/g, '')
          },
          provider: 'resend'
        });
      }
      
    } catch (error) {
      console.error('Failed to send backup notification:', error);
    }
  }

  /**
   * Send cleanup notification
   */
  async sendCleanupNotification(deletedCount) {
    try {
      const subject = `🧹 Backup Cleanup Completed - ${deletedCount} Old Backups Removed`;
      
      const content = `
      <h2>Backup Cleanup Completed</h2>
      <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
      <p><strong>Deleted Backups:</strong> ${deletedCount}</p>
      <p><strong>Retention Policy:</strong> ${this.retentionDays} days</p>
      <p>Old backups have been automatically cleaned up according to the retention policy.</p>
      `;
      
      const adminEmails = this.getAdminEmails();
      
      for (const email of adminEmails) {
        await createNotification({
          type: 'backup_cleanup',
          recipient: { email },
          subject,
          content: {
            html: content,
            text: content.replace(/<[^>]*>/g, '')
          },
          provider: 'resend'
        });
      }
      
    } catch (error) {
      console.error('Failed to send cleanup notification:', error);
    }
  }

  /**
   * Extract database name from MongoDB URI
   */
  extractDatabaseName() {
    try {
      const uri = new URL(this.mongoUri);
      return uri.pathname.substring(1) || 'admin';
    } catch (error) {
      return 'admin';
    }
  }

  /**
   * Get admin emails for notifications
   */
  getAdminEmails() {
    const emails = process.env.ADMIN_EMAILS || process.env.NOTIFICATION_EMAILS;
    if (emails) {
      return emails.split(',').map(email => email.trim());
    }
    return ['admin@uzima.com']; // fallback
  }

  /**
   * Get backup statistics
   */
  async getBackupStats() {
    try {
      const totalBackups = await Backup.countDocuments({ backupType: 'daily' });
      const successfulBackups = await Backup.countDocuments({ 
        backupType: 'daily', 
        status: 'completed' 
      });
      const failedBackups = await Backup.countDocuments({ 
        backupType: 'daily', 
        status: 'failed' 
      });
      
      const recentBackups = await Backup.find({ backupType: 'daily' })
        .sort({ startedAt: -1 })
        .limit(10);
      
      return {
        total: totalBackups,
        successful: successfulBackups,
        failed: failedBackups,
        successRate: totalBackups > 0 ? (successfulBackups / totalBackups * 100).toFixed(2) : 0,
        recentBackups: recentBackups.map(backup => ({
          backupId: backup.backupId,
          status: backup.status,
          size: backup.size,
          startedAt: backup.startedAt,
          completedAt: backup.completedAt
        }))
      };
      
    } catch (error) {
      console.error('Failed to get backup stats:', error);
      return null;
    }
  }
}

export default DailyBackupService;