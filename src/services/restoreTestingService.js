import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';
import Backup  from '../models/Backup.js';
import BackupService from './backupService.js';
import BackupAlertService from './backupAlertService.js';

const execAsync = promisify(exec);

class RestoreTestingService {
  constructor() {
    this.backupService = new BackupService();
    this.alertService = new BackupAlertService();
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    this.bucketName = process.env.S3_BACKUP_BUCKET;
    this.stagingMongoUri = process.env.STAGING_MONGO_URI || process.env.MONGO_URI;
    this.encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
  }

  /**
   * Test restore from a specific backup
   */
  async testRestoreFromBackup(backupId, testType = 'full') {
    const testId = `restore-test-${Date.now()}`;
    const tempDir = path.join(process.cwd(), 'temp', testId);
    
    try {
      console.log(`Starting restore test for backup: ${backupId}`);
      
      // Get backup record
      const backup = await Backup.findOne({ backupId });
      if (!backup) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      if (backup.status !== 'completed') {
        throw new Error(`Backup is not completed: ${backup.status}`);
      }

      // Create temp directory
      await fs.mkdir(tempDir, { recursive: true });

      // Download and decrypt backup
      const restoredData = await this.downloadAndDecryptBackup(backup.s3Key, tempDir);
      
      // Test restore to staging environment
      const restoreResult = await this.restoreToStaging(restoredData, testType);
      
      // Validate restored data
      const validationResult = await this.validateRestoredData(restoreResult);
      
      // Cleanup
      await this.cleanupTempFiles(tempDir);
      
      // Create test report
      const testReport = {
        testId,
        backupId,
        backupType: backup.backupType,
        testType,
        startTime: new Date(),
        endTime: new Date(),
        success: validationResult.success,
        details: {
          restoreResult,
          validationResult,
          backupSize: backup.size,
          restoreDuration: Date.now() - Date.now() // This would be calculated properly
        }
      };

      // Log test results
      await this.logTestResults(testReport);
      
      if (!validationResult.success) {
        await this.alertService.sendRestoreTestFailureAlert(backupId, validationResult.error);
      }

      return testReport;

    } catch (error) {
      console.error(`Restore test failed for ${backupId}:`, error);
      
      // Cleanup on error
      try {
        await this.cleanupTempFiles(tempDir);
      } catch (cleanupError) {
        console.error('Failed to cleanup temp files:', cleanupError);
      }

      // Send failure alert
      await this.alertService.sendRestoreTestFailureAlert(backupId, error.message);
      
      throw error;
    }
  }

  /**
   * Test restore from full backup chain (full + incrementals)
   */
  async testRestoreFromChain(fullBackupId) {
    try {
      console.log(`Testing restore from backup chain: ${fullBackupId}`);
      
      // Get backup chain
      const { fullBackup, incrementals } = await Backup.getBackupChain(fullBackupId);
      
      // Test full backup restore
      const fullRestoreResult = await this.testRestoreFromBackup(fullBackupId, 'full');
      
      // Test incremental restore if incrementals exist
      let incrementalRestoreResults = [];
      if (incrementals.length > 0) {
        const latestIncremental = incrementals[incrementals.length - 1];
        incrementalRestoreResults = await this.testRestoreFromBackup(
          latestIncremental.backupId, 
          'incremental'
        );
      }

      return {
        fullBackup: fullBackup,
        incrementals: incrementals,
        fullRestoreResult,
        incrementalRestoreResults,
        chainTestSuccess: fullRestoreResult.success && 
          (incrementals.length === 0 || incrementalRestoreResults.success)
      };

    } catch (error) {
      console.error(`Backup chain restore test failed for ${fullBackupId}:`, error);
      throw error;
    }
  }

  /**
   * Run quarterly restore testing
   */
  async runQuarterlyRestoreTest() {
    try {
      console.log('Starting quarterly restore testing...');
      
      // Get the most recent full backup
      const latestFullBackup = await Backup.getLatestFullBackup();
      if (!latestFullBackup) {
        throw new Error('No full backup found for quarterly testing');
      }

      // Test restore from the latest backup chain
      const testResult = await this.testRestoreFromChain(latestFullBackup.backupId);
      
      // Generate quarterly report
      const quarterlyReport = await this.generateQuarterlyReport(testResult);
      
      // Send quarterly test notification
      await this.alertService.sendQuarterlyTestNotification(quarterlyReport);
      
      console.log('Quarterly restore testing completed successfully');
      return quarterlyReport;

    } catch (error) {
      console.error('Quarterly restore testing failed:', error);
      await this.alertService.sendQuarterlyTestFailureAlert(error.message);
      throw error;
    }
  }

  /**
   * Download and decrypt backup from S3
   */
  async downloadAndDecryptBackup(s3Key, tempDir) {
    try {
      // Download from S3
      const downloadParams = {
        Bucket: this.bucketName,
        Key: s3Key
      };

      const response = await this.s3Client.send(new GetObjectCommand(downloadParams));
      const encryptedData = await response.Body.transformToByteArray();
      
      // Save encrypted file
      const encryptedPath = path.join(tempDir, 'backup.tar.gz.enc');
      await fs.writeFile(encryptedPath, Buffer.from(encryptedData));

      // Decrypt file
      const decryptedPath = path.join(tempDir, 'backup.tar.gz');
      await this.decryptFile(encryptedPath, decryptedPath);

      // Extract archive
      const extractPath = path.join(tempDir, 'extracted');
      await this.extractArchive(decryptedPath, extractPath);

      return extractPath;

    } catch (error) {
      throw new Error(`Failed to download and decrypt backup: ${error.message}`);
    }
  }

  /**
   * Decrypt file using AES-256-GCM
   */
  async decryptFile(inputPath, outputPath) {
    try {
      const algorithm = 'aes-256-gcm';
      const encryptedData = await fs.readFile(inputPath);
      
      // Extract IV, auth tag, and encrypted data
      const iv = encryptedData.slice(0, 16);
      const authTag = encryptedData.slice(16, 32);
      const encrypted = encryptedData.slice(32);
      
      const decipher = crypto.createDecipher(algorithm, this.encryptionKey);
      decipher.setAAD(Buffer.from('backup-metadata'));
      decipher.setAuthTag(authTag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      await fs.writeFile(outputPath, decrypted);
      console.log('File decrypted successfully');

    } catch (error) {
      throw new Error(`File decryption failed: ${error.message}`);
    }
  }

  /**
   * Extract tar.gz archive
   */
  async extractArchive(archivePath, outputPath) {
    try {
      await fs.mkdir(outputPath, { recursive: true });
      
      const command = process.platform === 'win32' 
        ? `powershell Expand-Archive -Path "${archivePath}" -DestinationPath "${outputPath}"`
        : `tar -xzf "${archivePath}" -C "${outputPath}"`;
      
      await execAsync(command);
      console.log('Archive extracted successfully');

    } catch (error) {
      throw new Error(`Archive extraction failed: ${error.message}`);
    }
  }

  /**
   * Restore to staging environment
   */
  async restoreToStaging(dataPath, testType) {
    try {
      console.log(`Restoring to staging environment (${testType})...`);
      
      // Create staging database name
      const stagingDbName = `staging_test_${Date.now()}`;
      const stagingUri = this.stagingMongoUri.replace(/\/[^\/]*$/, `/${stagingDbName}`);
      
      // Find the database directory in the extracted data
      const dbPath = await this.findDatabasePath(dataPath);
      
      // Restore using mongorestore
      const restoreCommand = `mongorestore --uri="${stagingUri}" --drop "${dbPath}"`;
      await execAsync(restoreCommand);
      
      console.log(`Successfully restored to staging database: ${stagingDbName}`);
      
      return {
        stagingDbName,
        stagingUri,
        dataPath,
        testType,
        success: true
      };

    } catch (error) {
      throw new Error(`Staging restore failed: ${error.message}`);
    }
  }

  /**
   * Find database directory in extracted backup
   */
  async findDatabasePath(extractPath) {
    try {
      const items = await fs.readdir(extractPath);
      const dumpDir = items.find(item => item === 'dump');
      
      if (!dumpDir) {
        throw new Error('Dump directory not found in backup');
      }
      
      const dumpPath = path.join(extractPath, dumpDir);
      const dbDirs = await fs.readdir(dumpPath);
      
      if (dbDirs.length === 0) {
        throw new Error('No database directories found in dump');
      }
      
      // Return the first database directory (assuming single database)
      return path.join(dumpPath, dbDirs[0]);

    } catch (error) {
      throw new Error(`Failed to find database path: ${error.message}`);
    }
  }

  /**
   * Validate restored data
   */
  async validateRestoredData(restoreResult) {
    try {
      console.log('Validating restored data...');
      
      const { stagingDbName } = restoreResult;
      
      // Connect to staging database
      const stagingConnection = mongoose.createConnection(
        restoreResult.stagingUri
      );

      try {
        // Check if collections exist
        const collections = await stagingConnection.db.listCollections().toArray();
        
        if (collections.length === 0) {
          throw new Error('No collections found in restored database');
        }

        // Validate key collections
        const validationResults = {};
        
        // Check users collection
        if (collections.find(c => c.name === 'users')) {
          const userCount = await stagingConnection.db.collection('users').countDocuments();
          validationResults.users = { count: userCount, exists: true };
        }

        // Check records collection
        if (collections.find(c => c.name === 'records')) {
          const recordCount = await stagingConnection.db.collection('records').countDocuments();
          validationResults.records = { count: recordCount, exists: true };
        }

        // Check backup collection
        if (collections.find(c => c.name === 'backups')) {
          const backupCount = await stagingConnection.db.collection('backups').countDocuments();
          validationResults.backups = { count: backupCount, exists: true };
        }

        console.log('Data validation completed successfully');
        
        return {
          success: true,
          collections: collections.length,
          validationResults,
          message: 'Restore validation passed'
        };

      } finally {
        // Clean up staging database
        await stagingConnection.db.dropDatabase();
        await stagingConnection.close();
      }

    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Restore validation failed'
      };
    }
  }

  /**
   * Generate quarterly test report
   */
  async generateQuarterlyReport(testResult) {
    const report = {
      testDate: new Date(),
      testType: 'quarterly',
      fullBackup: testResult.fullBackup,
      incrementals: testResult.incrementals,
      fullRestoreResult: testResult.fullRestoreResult,
      incrementalRestoreResults: testResult.incrementalRestoreResults,
      overallSuccess: testResult.chainTestSuccess,
      summary: {
        totalBackups: 1 + testResult.incrementals.length,
        successfulRestores: (testResult.fullRestoreResult.success ? 1 : 0) + 
          (testResult.incrementalRestoreResults.success ? 1 : 0),
        failedRestores: (testResult.fullRestoreResult.success ? 0 : 1) + 
          (testResult.incrementalRestoreResults.success ? 0 : 1)
      }
    };

    // Log report to database
    await this.logTestResults(report);
    
    return report;
  }

  /**
   * Log test results to database
   */
  async logTestResults(testReport) {
    try {
      // This would typically be stored in a separate test results collection
      console.log('Test Results:', JSON.stringify(testReport, null, 2));
      
      // In a full implementation, you might store this in a TestResult model
      // await TestResult.create(testReport);
      
    } catch (error) {
      console.error('Failed to log test results:', error);
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFiles(tempDir) {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to cleanup temp files:', error);
    }
  }
}

export default RestoreTestingService;
