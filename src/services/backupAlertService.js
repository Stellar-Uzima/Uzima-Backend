import { createNotification } from './notificationService.js';
import Backup from '../models/Backup.js';
import BackupService from './backupService.js';

class BackupAlertService {
  constructor() {
    this.backupService = new BackupService();
    this.alertCooldown = new Map(); // Prevent spam alerts
    this.cooldownMinutes = 60; // 1 hour cooldown between similar alerts
  }

  /**
   * Send backup failure alert
   */
  async sendBackupFailureAlert(backupId, errorMessage, backupType = 'full') {
    const alertKey = `backup_failure_${backupType}`;
    
    // Check cooldown
    if (this.isInCooldown(alertKey)) {
      console.log(`Backup failure alert for ${backupType} backups is in cooldown`);
      return;
    }

    try {
      const subject = `🚨 Backup Failure Alert - ${backupType.charAt(0).toUpperCase() + backupType.slice(1)} Backup Failed`;
      const content = this.generateBackupFailureContent(backupId, errorMessage, backupType);

      // Send to configured admin emails
      const adminEmails = this.getAdminEmails();
      
      for (const email of adminEmails) {
        await createNotification({
          type: 'backup_failure',
          recipient: { email },
          subject,
          content: {
            html: content.html,
            text: content.text
          },
          provider: 'resend'
        });
      }

      // Set cooldown
      this.setCooldown(alertKey);
      
      console.log(`Backup failure alert sent for ${backupId}`);
    } catch (error) {
      console.error('Failed to send backup failure alert:', error);
    }
  }

  /**
   * Send storage quota warning
   */
  async sendStorageQuotaAlert(usagePercentage) {
    const alertKey = 'storage_quota_warning';
    
    // Check cooldown
    if (this.isInCooldown(alertKey)) {
      return;
    }

    try {
      const subject = `⚠️ Backup Storage Quota Warning - ${usagePercentage}% Used`;
      const content = this.generateStorageQuotaContent(usagePercentage);

      const adminEmails = this.getAdminEmails();
      
      for (const email of adminEmails) {
        await createNotification({
          type: 'backup_quota_warning',
          recipient: { email },
          subject,
          content: {
            html: content.html,
            text: content.text
          },
          provider: 'resend'
        });
      }

      this.setCooldown(alertKey);
      console.log(`Storage quota alert sent: ${usagePercentage}%`);
    } catch (error) {
      console.error('Failed to send storage quota alert:', error);
    }
  }

  /**
   * Send integrity verification failure alert
   */
  async sendIntegrityFailureAlert(backupId, verificationError) {
    const alertKey = `integrity_failure_${backupId}`;
    
    if (this.isInCooldown(alertKey)) {
      return;
    }

    try {
      const subject = `🔍 Backup Integrity Verification Failed - ${backupId}`;
      const content = this.generateIntegrityFailureContent(backupId, verificationError);

      const adminEmails = this.getAdminEmails();
      
      for (const email of adminEmails) {
        await createNotification({
          type: 'backup_integrity_failure',
          recipient: { email },
          subject,
          content: {
            html: content.html,
            text: content.text
          },
          provider: 'resend'
        });
      }

      this.setCooldown(alertKey);
      console.log(`Integrity failure alert sent for ${backupId}`);
    } catch (error) {
      console.error('Failed to send integrity failure alert:', error);
    }
  }

  /**
   * Send backup success notification (optional, for monitoring)
   */
  async sendBackupSuccessNotification(backupId, backupType, size, duration) {
    // Only send success notifications for full backups to avoid spam
    if (backupType !== 'full') {
      return;
    }

    try {
      const subject = `✅ Backup Completed Successfully - ${backupId}`;
      const content = this.generateBackupSuccessContent(backupId, backupType, size, duration);

      const adminEmails = this.getAdminEmails();
      
      for (const email of adminEmails) {
        await createNotification({
          type: 'backup_success',
          recipient: { email },
          subject,
          content: {
            html: content.html,
            text: content.text
          },
          provider: 'resend'
        });
      }

      console.log(`Backup success notification sent for ${backupId}`);
    } catch (error) {
      console.error('Failed to send backup success notification:', error);
    }
  }

  /**
   * Check backup health and send alerts if needed
   */
  async checkBackupHealth() {
    try {
      // Check for failed backups in the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const failedBackups = await Backup.find({
        status: 'failed',
        createdAt: { $gte: oneDayAgo }
      });

      if (failedBackups.length > 0) {
        const fullFailures = failedBackups.filter(b => b.backupType === 'full').length;
        const incrementalFailures = failedBackups.filter(b => b.backupType === 'incremental').length;
        
        if (fullFailures > 0) {
          await this.sendBackupFailureAlert(
            `Multiple full backups (${fullFailures})`,
            `${fullFailures} full backup(s) failed in the last 24 hours`,
            'full'
          );
        }
        
        if (incrementalFailures > 5) { // Only alert if many incremental failures
          await this.sendBackupFailureAlert(
            `Multiple incremental backups (${incrementalFailures})`,
            `${incrementalFailures} incremental backup(s) failed in the last 24 hours`,
            'incremental'
          );
        }
      }

      // Check storage usage (if S3 client supports this)
      await this.checkStorageUsage();

    } catch (error) {
      console.error('Failed to check backup health:', error);
    }
  }

  /**
   * Check S3 storage usage
   */
  async checkStorageUsage() {
    try {
      // This is a simplified check - in production you'd want to use S3 metrics
      const backups = await Backup.find({ status: 'completed' });
      const totalSize = backups.reduce((sum, backup) => sum + (backup.size || 0), 0);
      
      // Assume a 100GB storage limit (configurable)
      const storageLimit = parseInt(process.env.BACKUP_STORAGE_LIMIT_GB) || 100;
      const storageLimitBytes = storageLimit * 1024 * 1024 * 1024;
      const usagePercentage = (totalSize / storageLimitBytes) * 100;

      if (usagePercentage > 80) {
        await this.sendStorageQuotaAlert(Math.round(usagePercentage));
      }
    } catch (error) {
      console.error('Failed to check storage usage:', error);
    }
  }

  /**
   * Generate backup failure email content
   */
  generateBackupFailureContent(backupId, errorMessage, backupType) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">🚨 Backup Failure Alert</h2>
        <p>A <strong>${backupType}</strong> backup has failed in the Uzima system.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Backup Details:</h3>
          <ul>
            <li><strong>Backup ID:</strong> ${backupId}</li>
            <li><strong>Type:</strong> ${backupType.charAt(0).toUpperCase() + backupType.slice(1)}</li>
            <li><strong>Time:</strong> ${new Date().toISOString()}</li>
            <li><strong>Error:</strong> ${errorMessage}</li>
          </ul>
        </div>
        
        <p><strong>Action Required:</strong> Please investigate and resolve the backup issue as soon as possible.</p>
        
        <p>You can check the backup status and logs through the admin dashboard.</p>
        
        <hr style="margin: 30px 0;">
        <p style="color: #6c757d; font-size: 12px;">
          This is an automated alert from the Uzima Backup System.
        </p>
      </div>
    `;

    const text = `
Backup Failure Alert

A ${backupType} backup has failed in the Uzima system.

Backup Details:
- Backup ID: ${backupId}
- Type: ${backupType.charAt(0).toUpperCase() + backupType.slice(1)}
- Time: ${new Date().toISOString()}
- Error: ${errorMessage}

Action Required: Please investigate and resolve the backup issue as soon as possible.

This is an automated alert from the Uzima Backup System.
    `;

    return { html, text };
  }

  /**
   * Generate storage quota email content
   */
  generateStorageQuotaContent(usagePercentage) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ffc107;">⚠️ Storage Quota Warning</h2>
        <p>The backup storage is approaching its limit.</p>
        
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Storage Usage:</h3>
          <p><strong>${usagePercentage}%</strong> of backup storage is currently in use.</p>
          <p>Consider cleaning up old backups or increasing storage capacity.</p>
        </div>
        
        <p><strong>Recommended Actions:</strong></p>
        <ul>
          <li>Review backup retention policies</li>
          <li>Clean up old backup files</li>
          <li>Consider upgrading storage capacity</li>
        </ul>
        
        <hr style="margin: 30px 0;">
        <p style="color: #6c757d; font-size: 12px;">
          This is an automated alert from the Uzima Backup System.
        </p>
      </div>
    `;

    const text = `
Storage Quota Warning

The backup storage is approaching its limit.

Storage Usage: ${usagePercentage}% of backup storage is currently in use.

Recommended Actions:
- Review backup retention policies
- Clean up old backup files
- Consider upgrading storage capacity

This is an automated alert from the Uzima Backup System.
    `;

    return { html, text };
  }

  /**
   * Generate integrity failure email content
   */
  generateIntegrityFailureContent(backupId, verificationError) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">🔍 Backup Integrity Verification Failed</h2>
        <p>A backup integrity verification has failed.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Verification Details:</h3>
          <ul>
            <li><strong>Backup ID:</strong> ${backupId}</li>
            <li><strong>Time:</strong> ${new Date().toISOString()}</li>
            <li><strong>Error:</strong> ${verificationError}</li>
          </ul>
        </div>
        
        <p><strong>Action Required:</strong> The backup file may be corrupted. Please verify the backup manually and consider creating a new backup.</p>
        
        <hr style="margin: 30px 0;">
        <p style="color: #6c757d; font-size: 12px;">
          This is an automated alert from the Uzima Backup System.
        </p>
      </div>
    `;

    const text = `
Backup Integrity Verification Failed

A backup integrity verification has failed.

Verification Details:
- Backup ID: ${backupId}
- Time: ${new Date().toISOString()}
- Error: ${verificationError}

Action Required: The backup file may be corrupted. Please verify the backup manually and consider creating a new backup.

This is an automated alert from the Uzima Backup System.
    `;

    return { html, text };
  }

  /**
   * Generate backup success email content
   */
  generateBackupSuccessContent(backupId, backupType, size, duration) {
    const sizeMB = Math.round(size / (1024 * 1024));
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">✅ Backup Completed Successfully</h2>
        <p>A <strong>${backupType}</strong> backup has completed successfully.</p>
        
        <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Backup Details:</h3>
          <ul>
            <li><strong>Backup ID:</strong> ${backupId}</li>
            <li><strong>Type:</strong> ${backupType.charAt(0).toUpperCase() + backupType.slice(1)}</li>
            <li><strong>Size:</strong> ${sizeMB} MB</li>
            <li><strong>Duration:</strong> ${duration} seconds</li>
            <li><strong>Time:</strong> ${new Date().toISOString()}</li>
          </ul>
        </div>
        
        <p>The backup has been successfully created and uploaded to secure storage.</p>
        
        <hr style="margin: 30px 0;">
        <p style="color: #6c757d; font-size: 12px;">
          This is an automated notification from the Uzima Backup System.
        </p>
      </div>
    `;

    const text = `
Backup Completed Successfully

A ${backupType} backup has completed successfully.

Backup Details:
- Backup ID: ${backupId}
- Type: ${backupType.charAt(0).toUpperCase() + backupType.slice(1)}
- Size: ${sizeMB} MB
- Duration: ${duration} seconds
- Time: ${new Date().toISOString()}

The backup has been successfully created and uploaded to secure storage.

This is an automated notification from the Uzima Backup System.
    `;

    return { html, text };
  }

  /**
   * Get admin emails from environment or configuration
   */
  getAdminEmails() {
    const adminEmails = process.env.BACKUP_ADMIN_EMAILS;
    if (adminEmails) {
      return adminEmails.split(',').map(email => email.trim());
    }
    
    // Fallback to default admin email
    const defaultEmail = process.env.ADMIN_EMAIL || 'admin@uzima.com';
    return [defaultEmail];
  }

  /**
   * Check if alert is in cooldown period
   */
  isInCooldown(alertKey) {
    const lastAlert = this.alertCooldown.get(alertKey);
    if (!lastAlert) return false;
    
    const cooldownMs = this.cooldownMinutes * 60 * 1000;
    return (Date.now() - lastAlert) < cooldownMs;
  }

  /**
   * Set alert cooldown
   */
  setCooldown(alertKey) {
    this.alertCooldown.set(alertKey, Date.now());
  }

  /**
   * Send restore test failure alert
   */
  async sendRestoreTestFailureAlert(backupId, errorMessage) {
    const alertKey = `restore_test_failure_${backupId}`;
    
    if (this.isInCooldown(alertKey)) {
      return;
    }

    try {
      const subject = `🔧 Restore Test Failed - ${backupId}`;
      const content = this.generateRestoreTestFailureContent(backupId, errorMessage);

      const adminEmails = this.getAdminEmails();
      
      for (const email of adminEmails) {
        await createNotification({
          type: 'restore_test_failure',
          recipient: { email },
          subject,
          content: {
            html: content.html,
            text: content.text
          },
          provider: 'resend'
        });
      }

      this.setCooldown(alertKey);
      console.log(`Restore test failure alert sent for ${backupId}`);
    } catch (error) {
      console.error('Failed to send restore test failure alert:', error);
    }
  }

  /**
   * Send quarterly test notification
   */
  async sendQuarterlyTestNotification(report) {
    try {
      const subject = `📊 Quarterly Backup Restore Test Report`;
      const content = this.generateQuarterlyTestContent(report);

      const adminEmails = this.getAdminEmails();
      
      for (const email of adminEmails) {
        await createNotification({
          type: 'quarterly_test_report',
          recipient: { email },
          subject,
          content: {
            html: content.html,
            text: content.text
          },
          provider: 'resend'
        });
      }

      console.log('Quarterly test notification sent');
    } catch (error) {
      console.error('Failed to send quarterly test notification:', error);
    }
  }

  /**
   * Send quarterly test failure alert
   */
  async sendQuarterlyTestFailureAlert(errorMessage) {
    try {
      const subject = `🚨 Quarterly Backup Restore Test Failed`;
      const content = this.generateQuarterlyTestFailureContent(errorMessage);

      const adminEmails = this.getAdminEmails();
      
      for (const email of adminEmails) {
        await createNotification({
          type: 'quarterly_test_failure',
          recipient: { email },
          subject,
          content: {
            html: content.html,
            text: content.text
          },
          provider: 'resend'
        });
      }

      console.log('Quarterly test failure alert sent');
    } catch (error) {
      console.error('Failed to send quarterly test failure alert:', error);
    }
  }

  /**
   * Generate restore test failure email content
   */
  generateRestoreTestFailureContent(backupId, errorMessage) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">🔧 Restore Test Failed</h2>
        <p>A restore test has failed for backup <strong>${backupId}</strong>.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Test Details:</h3>
          <ul>
            <li><strong>Backup ID:</strong> ${backupId}</li>
            <li><strong>Time:</strong> ${new Date().toISOString()}</li>
            <li><strong>Error:</strong> ${errorMessage}</li>
          </ul>
        </div>
        
        <p><strong>Action Required:</strong> The backup may be corrupted or there may be an issue with the restore process. Please investigate immediately.</p>
        
        <hr style="margin: 30px 0;">
        <p style="color: #6c757d; font-size: 12px;">
          This is an automated alert from the Uzima Backup System.
        </p>
      </div>
    `;

    const text = `
Restore Test Failed

A restore test has failed for backup ${backupId}.

Test Details:
- Backup ID: ${backupId}
- Time: ${new Date().toISOString()}
- Error: ${errorMessage}

Action Required: The backup may be corrupted or there may be an issue with the restore process. Please investigate immediately.

This is an automated alert from the Uzima Backup System.
    `;

    return { html, text };
  }

  /**
   * Generate quarterly test report email content
   */
  generateQuarterlyTestContent(report) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${report.overallSuccess ? '#28a745' : '#dc3545'};">
          📊 Quarterly Backup Restore Test Report
        </h2>
        
        <div style="background-color: ${report.overallSuccess ? '#d4edda' : '#f8d7da'}; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Test Summary:</h3>
          <ul>
            <li><strong>Overall Status:</strong> ${report.overallSuccess ? '✅ PASSED' : '❌ FAILED'}</li>
            <li><strong>Test Date:</strong> ${report.testDate.toISOString()}</li>
            <li><strong>Total Backups:</strong> ${report.summary.totalBackups}</li>
            <li><strong>Successful Restores:</strong> ${report.summary.successfulRestores}</li>
            <li><strong>Failed Restores:</strong> ${report.summary.failedRestores}</li>
          </ul>
        </div>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Tested Backups:</h3>
          <ul>
            <li><strong>Full Backup:</strong> ${report.fullBackup.backupId}</li>
            <li><strong>Incremental Backups:</strong> ${report.incrementals.length}</li>
          </ul>
        </div>
        
        <p>This quarterly test ensures that your backup system is working correctly and that data can be restored when needed.</p>
        
        <hr style="margin: 30px 0;">
        <p style="color: #6c757d; font-size: 12px;">
          This is an automated report from the Uzima Backup System.
        </p>
      </div>
    `;

    const text = `
Quarterly Backup Restore Test Report

Test Summary:
- Overall Status: ${report.overallSuccess ? 'PASSED' : 'FAILED'}
- Test Date: ${report.testDate.toISOString()}
- Total Backups: ${report.summary.totalBackups}
- Successful Restores: ${report.summary.successfulRestores}
- Failed Restores: ${report.summary.failedRestores}

Tested Backups:
- Full Backup: ${report.fullBackup.backupId}
- Incremental Backups: ${report.incrementals.length}

This quarterly test ensures that your backup system is working correctly and that data can be restored when needed.

This is an automated report from the Uzima Backup System.
    `;

    return { html, text };
  }

  /**
   * Generate quarterly test failure email content
   */
  generateQuarterlyTestFailureContent(errorMessage) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">🚨 Quarterly Backup Restore Test Failed</h2>
        <p>The quarterly backup restore test has failed.</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Failure Details:</h3>
          <ul>
            <li><strong>Test Date:</strong> ${new Date().toISOString()}</li>
            <li><strong>Error:</strong> ${errorMessage}</li>
          </ul>
        </div>
        
        <p><strong>Action Required:</strong> The quarterly restore test is critical for ensuring backup integrity. Please investigate and resolve the issue immediately.</p>
        
        <hr style="margin: 30px 0;">
        <p style="color: #6c757d; font-size: 12px;">
          This is an automated alert from the Uzima Backup System.
        </p>
      </div>
    `;

    const text = `
Quarterly Backup Restore Test Failed

The quarterly backup restore test has failed.

Failure Details:
- Test Date: ${new Date().toISOString()}
- Error: ${errorMessage}

Action Required: The quarterly restore test is critical for ensuring backup integrity. Please investigate and resolve the issue immediately.

This is an automated alert from the Uzima Backup System.
    `;

    return { html, text };
  }
}

export default BackupAlertService;
